/**
 * ExecutiveSummary.tsx — high-value executive briefing across loaded modules.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { SectionNav } from '../components/shared/SectionNav';
import type { SectionDef } from '../components/shared/SectionNav';
import { TrendBadge } from '../components/shared/TrendBadge';
import { RAGStatus } from '../components/shared/RAGStatus';
import { ChartCard } from '../components/shared/ChartCard';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useModuleData } from '../hooks/useModuleData';
import { useProgressTracker } from '../hooks/useProgressTracker';
import { costsApi } from '../api/costs';
import { securityApi } from '../api/security';
import { inventoryApi } from '../api/inventory';
import { licensesApi } from '../api/licenses';
import { insightsApi } from '../api/insights';
import { dataGapsApi } from '../api/dataGaps';
import { routePaths } from '../config/navigation';
import { formatCompact, formatCurrency, formatPercent } from '../utils/formatters';
import type {
  AdvisorRecommendation,
  CostSummary,
  CostRollup,
  ExecutiveInsight,
  DataGap,
  ModuleName,
  DefenderScoreResponse,
  InventorySummary,
  LicenseSummary,
  Subscription,
} from '../types';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { normalizeResourceTypeName, getResourceTypeHint } from '../utils/resourceNaming';

type LoadStatus = 'pending' | 'loading' | 'success' | 'error';
type SignalTone = 'critical' | 'watch' | 'positive';

interface DriverRow {
  id?: string;
  name: string;
  amount: number;
  share: number;
}

interface ExecutiveSignal {
  title: string;
  metric: string;
  context: string;
  action: string;
  tone: SignalTone;
  href?: string;
}

const EXEC_SUMMARY_MODULES: ModuleName[] = [
  'cost_summary',
  'costs',
  'security',
  'inventory_summary',
  'licenses',
  'insights',
  'data_gaps',
];

function monthLabel(raw: string): string {
  if (!raw.includes('-')) return raw;
  const [yearRaw, monthRaw] = raw.split('-');
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return raw;
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' });
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function trendFromPct(pct: number): 'increasing' | 'decreasing' | 'stable' {
  if (pct > 1) return 'increasing';
  if (pct < -1) return 'decreasing';
  return 'stable';
}

function mergeStatus(...statuses: LoadStatus[]): LoadStatus {
  if (statuses.some((status) => status === 'error')) return 'error';
  if (statuses.every((status) => status === 'success')) return 'success';
  return 'loading';
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    default:
      return 3;
  }
}

function toneLabel(tone: SignalTone): string {
  if (tone === 'critical') return 'Critical';
  if (tone === 'watch') return 'Watch';
  return 'Positive';
}

function isSubscriptionId(value: string): boolean {
  const raw = (value ?? '').trim();
  if (!raw) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

function resolveSubscriptionName(
  nameCandidate: string | undefined,
  keyCandidate: string | undefined,
  subscriptionNames: Map<string, string>
): string {
  const directName = (nameCandidate ?? '').trim();
  if (directName && !isSubscriptionId(directName)) return directName;

  const key = (keyCandidate ?? '').trim();
  if (key && subscriptionNames.has(key)) return subscriptionNames.get(key)!;

  const pathMatch = key.match(/\/subscriptions\/([0-9a-f-]{36})/i);
  if (pathMatch?.[1] && subscriptionNames.has(pathMatch[1])) {
    return subscriptionNames.get(pathMatch[1])!;
  }

  if (directName && subscriptionNames.has(directName)) return subscriptionNames.get(directName)!;
  if (key && !isSubscriptionId(key)) return key;
  return 'Unknown subscription';
}

function replaceSubscriptionIdsInText(text: string, subscriptionNames: Map<string, string>): string {
  let result = text ?? '';
  for (const [id, name] of subscriptionNames.entries()) {
    if (!id || !name || id === name) continue;
    result = result.split(id).join(name);
  }
  return result;
}

function buildSparklinePath(values: number[], width: number, height: number, padding = 4) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * innerW;
    const y = padding + (1 - (value - min) / span) * innerH;
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const bottomY = height - padding;
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;

  return { linePath, areaPath };
}

function normalizeInsightRows(data: unknown): ExecutiveInsight[] {
  if (Array.isArray(data)) return data as ExecutiveInsight[];
  if (data && typeof data === 'object') {
    const rows = (data as { insights?: unknown }).insights;
    if (Array.isArray(rows)) return rows as ExecutiveInsight[];
  }
  return [];
}

const execSections: SectionDef[] = [
  { id: 'exec-briefing', label: 'Briefing' },
  { id: 'exec-kpis', label: 'KPI cards' },
  { id: 'exec-signals', label: 'Signals' },
  { id: 'exec-actions', label: 'Actions' },
  { id: 'exec-findings', label: 'Findings' },
];

export default function ExecutiveSummary() {
  const navigate = useNavigate();

  const gaps = useModuleData<DataGap[]>(() => dataGapsApi.list(), [], {
    cacheKey: MODULE_CACHE_KEYS.dataGaps,
  });
  const security = useModuleData<DefenderScoreResponse>(() => securityApi.defenderScores(), [], {
    cacheKey: MODULE_CACHE_KEYS.securityDefenderScores,
  });
  const securityRecommendations = useModuleData<AdvisorRecommendation[]>(
    () => securityApi.advisorRecommendations(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.securityAdvisorRecommendations }
  );
  const costs = useModuleData<CostSummary>(() => costsApi.summary(), [], {
    cacheKey: MODULE_CACHE_KEYS.costSummary,
  });
  const costBySubscription = useModuleData<CostRollup[]>(() => costsApi.bySubscription(), [], {
    cacheKey: MODULE_CACHE_KEYS.costBySubscription,
  });
  const costByType = useModuleData<CostRollup[]>(() => costsApi.byResourceType(), [], {
    cacheKey: MODULE_CACHE_KEYS.costByResourceType,
  });
  const subscriptions = useModuleData<Subscription[]>(() => inventoryApi.subscriptions(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions,
  });
  const inventorySummary = useModuleData<InventorySummary>(() => inventoryApi.summary(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventorySummary,
  });
  const licenses = useModuleData<LicenseSummary>(() => licensesApi.summary(), [], {
    cacheKey: MODULE_CACHE_KEYS.licensesSummary,
  });
  const insights = useModuleData<ExecutiveInsight[]>(() => insightsApi.list(), [], {
    cacheKey: MODULE_CACHE_KEYS.insightsList,
  });

  const { updateModule, overallPercentage, completedCount, totalCount, hasErrors } =
    useProgressTracker(EXEC_SUMMARY_MODULES);

  const securityModuleStatus = mergeStatus(security.status, securityRecommendations.status);
  const costsModuleStatus = mergeStatus(costBySubscription.status, costByType.status);

  useEffect(() => {
    updateModule('cost_summary', { status: costs.status === 'success' ? 'success' : costs.status === 'error' ? 'error' : 'loading' });
  }, [costs.status, updateModule]);
  useEffect(() => {
    updateModule('costs', { status: costsModuleStatus });
  }, [costsModuleStatus, updateModule]);
  useEffect(() => {
    updateModule('security', { status: securityModuleStatus });
  }, [securityModuleStatus, updateModule]);
  useEffect(() => {
    updateModule('inventory_summary', {
      status: inventorySummary.status === 'success' ? 'success' : inventorySummary.status === 'error' ? 'error' : 'loading',
    });
  }, [inventorySummary.status, updateModule]);
  useEffect(() => {
    updateModule('licenses', {
      status: licenses.status === 'success' ? 'success' : licenses.status === 'error' ? 'error' : 'loading',
    });
  }, [licenses.status, updateModule]);
  useEffect(() => {
    updateModule('insights', { status: insights.status === 'success' ? 'success' : insights.status === 'error' ? 'error' : 'loading' });
  }, [insights.status, updateModule]);
  useEffect(() => {
    updateModule('data_gaps', { status: gaps.status === 'success' ? 'success' : gaps.status === 'error' ? 'error' : 'loading' });
  }, [gaps.status, updateModule]);

  const dataGaps = useMemo(() => gaps.data ?? [], [gaps.data]);
  const totalMonthly = costs.data?.total ?? costs.data?.total_cost_1m ?? 0;
  const annualRunRate = totalMonthly * 12;
  const secureScore = security.data?.overall_percentage ?? 0;
  const trendDirection = (costs.data?.trend_direction ?? costs.data?.overall_trend ?? 'stable') as
    | 'increasing'
    | 'decreasing'
    | 'stable';
  const trendPercent = costs.data?.trend_percent ?? 0;

  const monthlyTrend = useMemo(
    () =>
      (costs.data?.by_month ?? [])
        .slice(-6)
        .map((point) => ({ month: monthLabel(point.month), amount: point.amount })),
    [costs.data?.by_month]
  );

  const monthlySparkline = useMemo(() => {
    const points = monthlyTrend.map((point) => Number(point.amount ?? 0)).filter((value) => Number.isFinite(value));
    if (points.length < 2) return null;
    const width = 320;
    const height = 62;
    const paths = buildSparklinePath(points, width, height, 4);
    if (!paths) return null;
    return {
      width,
      height,
      ...paths,
      firstMonth: monthlyTrend[0]?.month ?? '',
      lastMonth: monthlyTrend[monthlyTrend.length - 1]?.month ?? '',
      latestValue: points[points.length - 1],
    };
  }, [monthlyTrend]);

  const trendPairs = useMemo(() => {
    const rows = (costs.data?.by_month ?? [])
      .map((r) => ({ month: r.month, amount: r.amount ?? 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));
    if (rows.length < 2) return { previous: null as null | { fromMonth: string; toMonth: string; pct: number; trend: 'increasing' | 'decreasing' | 'stable' }, current: null as null | { fromMonth: string; toMonth: string; pct: number; trend: 'increasing' | 'decreasing' | 'stable' } };

    const latest = rows[rows.length - 1];
    const second = rows[rows.length - 2];
    const third = rows.length >= 3 ? rows[rows.length - 3] : null;
    const now = currentMonthKey();

    const makePair = (from: { month: string; amount: number }, to: { month: string; amount: number }) => {
      const pct = from.amount > 0 ? ((to.amount - from.amount) / Math.abs(from.amount)) * 100 : 0;
      return { fromMonth: monthLabel(from.month), toMonth: monthLabel(to.month), pct, trend: trendFromPct(pct) };
    };

    if (latest.month === now) {
      return {
        previous: third ? makePair(third, second) : null,
        current: makePair(second, latest),
      };
    }

    return {
      previous: makePair(second, latest),
      current: null,
    };
  }, [costs.data?.by_month]);

  const securityRecommendationSummary = useMemo(() => {
    const rows = securityRecommendations.data ?? [];
    return {
      high: rows.filter((item) => item.impact === 'High').length,
      medium: rows.filter((item) => item.impact === 'Medium').length,
      low: rows.filter((item) => item.impact === 'Low').length,
      total: rows.length,
    };
  }, [securityRecommendations.data]);

  const subscriptionNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of subscriptions.data ?? []) {
      if (row.subscription_id && row.display_name) {
        map.set(row.subscription_id, row.display_name);
      }
    }
    for (const row of costBySubscription.data ?? []) {
      if (row.group_key && row.subscription_name && !isSubscriptionId(row.subscription_name)) {
        map.set(row.group_key, row.subscription_name);
      }
    }
    return map;
  }, [subscriptions.data, costBySubscription.data]);

  const topSubscriptionDrivers = useMemo<DriverRow[]>(() => {
    const rows = [...(costBySubscription.data ?? [])]
      .map((row) => ({
        id: row.group_key || row.subscription_id || row.subscription_name || 'unknown-subscription',
        name: resolveSubscriptionName(row.subscription_name, row.group_key, subscriptionNames),
        amount: row.cost_1m ?? 0,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const baseline = totalMonthly > 0 ? totalMonthly : rows.reduce((sum, row) => sum + row.amount, 0);
    return rows.slice(0, 5).map((row) => ({
      ...row,
      share: baseline > 0 ? (row.amount / baseline) * 100 : 0,
    }));
  }, [costBySubscription.data, subscriptionNames, totalMonthly]);

  const topTypeDrivers = useMemo<DriverRow[]>(() => {
    const rows = [...(costByType.data ?? [])]
      .map((row) => ({
        name: normalizeResourceTypeName(row.group_key || 'Unknown resource type'),
        amount: row.cost_1m ?? 0,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const baseline = totalMonthly > 0 ? totalMonthly : rows.reduce((sum, row) => sum + row.amount, 0);
    return rows.slice(0, 5).map((row) => ({
      ...row,
      share: baseline > 0 ? (row.amount / baseline) * 100 : 0,
    }));
  }, [costByType.data, totalMonthly]);

  const topTypeHint = useMemo(() => {
    for (const row of costByType.data ?? []) {
      const hint = getResourceTypeHint(row.group_key ?? '');
      if (hint) return hint;
    }
    return null;
  }, [costByType.data]);

  const insightRows = useMemo(() => normalizeInsightRows(insights.data), [insights.data]);

  const gapSummary = useMemo(() => {
    const high = dataGaps.filter((gap) => gap.severity === 'high').length;
    const medium = dataGaps.filter((gap) => gap.severity === 'medium').length;
    const low = dataGaps.filter((gap) => gap.severity === 'low').length;
    const byModule = new Map<string, number>();
    for (const gap of dataGaps) {
      const key = (gap.module ?? 'unknown').trim() || 'unknown';
      byModule.set(key, (byModule.get(key) ?? 0) + 1);
    }
    const topModules = [...byModule.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([module, count]) => `${module} (${count})`);
    return { high, medium, low, topModules };
  }, [dataGaps]);

  const prioritizedInsights = useMemo(
    () => [...insightRows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [insightRows]
  );

  const insightSummary = useMemo(() => {
    const rows = insightRows;
    return {
      critical: rows.filter((item) => item.severity === 'critical').length,
      high: rows.filter((item) => item.severity === 'high').length,
      medium: rows.filter((item) => item.severity === 'medium').length,
      low: rows.filter((item) => item.severity === 'low').length,
    };
  }, [insightRows]);

  const executiveSignals = useMemo<ExecutiveSignal[]>(() => {
    const signals: ExecutiveSignal[] = [];

    if (topSubscriptionDrivers.length > 0) {
      const leader = topSubscriptionDrivers[0];
      const tone: SignalTone = leader.share >= 45 ? 'critical' : leader.share >= 30 ? 'watch' : 'positive';
      signals.push({
        title: 'Spend concentration',
        metric: `${leader.share.toFixed(1)}%`,
        context: `${leader.name} is the highest subscription cost driver at ${formatCurrency(leader.amount)} this month.`,
        action:
          tone === 'critical'
            ? 'Start optimization and accountability reviews in this subscription first to unlock largest savings impact.'
            : 'Track this subscription with a monthly spend target and anomaly alerts.',
        tone,
        href: '/costs',
      });
    }

    if (security.status === 'success' || securityRecommendations.status === 'success') {
      const tone: SignalTone =
        securityRecommendationSummary.high > 0 || secureScore < 50
          ? 'critical'
          : securityRecommendationSummary.medium > 10 || secureScore < 70
            ? 'watch'
            : 'positive';
      signals.push({
        title: 'Security posture',
        metric: `${Math.round(secureScore)}%`,
        context: `${securityRecommendationSummary.high} high and ${securityRecommendationSummary.medium} medium advisor findings are currently open.`,
        action:
          tone === 'critical'
            ? 'Prioritize high impact remediations this month and assign owners per subscription.'
            : 'Sustain score momentum by resolving medium findings in recurring security sprints.',
        tone,
        href: '/security',
      });
    }

    if (inventorySummary.status === 'success' && inventorySummary.data) {
      const tone: SignalTone =
        inventorySummary.data.untagged_percentage >= 20
          ? 'critical'
          : inventorySummary.data.untagged_percentage >= 10
            ? 'watch'
            : 'positive';
      signals.push({
        title: 'Asset hygiene',
        metric: `${inventorySummary.data.untagged_percentage.toFixed(1)}%`,
        context: `${formatCompact(inventorySummary.data.total_resources)} resources are in scope and ${inventorySummary.data.untagged_count} are untagged.`,
        action:
          tone === 'critical'
            ? 'Enforce mandatory tags through policy to restore cost and ownership visibility.'
            : 'Drive tagging closure in remaining resource groups and monitor drift.',
        tone,
        href: '/inventory',
      });
    }

    if (licenses.status === 'success' && licenses.data) {
      const estimatedWaste = licenses.data.estimated_waste_monthly;
      const tone: SignalTone =
        estimatedWaste == null
          ? 'watch'
          : estimatedWaste > 5000
            ? 'critical'
            : estimatedWaste > 1000
              ? 'watch'
              : 'positive';
      signals.push({
        title: 'License efficiency',
        metric: estimatedWaste == null ? 'Not available' : formatCurrency(estimatedWaste),
        context:
          estimatedWaste == null
            ? 'License waste estimate is unavailable because pricing is not returned by this Graph API.'
            : `${licenses.data.inactive_licensed_users ?? 0} inactive licensed users and ${licenses.data.underutilized_skus?.length ?? 0} underutilized SKUs were detected.`,
        action:
          tone === 'critical'
            ? 'Launch a true-up and reclamation cycle to remove unused assignments before next billing period.'
            : estimatedWaste == null
              ? 'Use SKU/unit costs from procurement data to calculate waste against inactive users and unused seats.'
              : 'Review inactive user assignments monthly and reclaim low-utilization licenses.',
        tone,
        href: '/licenses',
      });
    }

    if (costs.status === 'success' && costs.data) {
      const tone: SignalTone =
        trendDirection === 'increasing' && trendPercent >= 5
          ? 'critical'
          : trendDirection === 'increasing'
            ? 'watch'
            : trendDirection === 'decreasing'
              ? 'positive'
              : 'watch';
      signals.push({
        title: 'Cost trend',
        metric: `${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(1)}%`,
        context:
          trendDirection === 'increasing'
            ? `Monthly spend is rising from the recent baseline. Current run rate is ${formatCurrency(totalMonthly)}.`
            : trendDirection === 'decreasing'
              ? `Monthly spend is easing toward ${formatCurrency(totalMonthly)} run rate.`
              : `Monthly spend is steady at ${formatCurrency(totalMonthly)} this period.`,
        action:
          tone === 'critical'
            ? 'Start a variance review on the top subscriptions and confirm which changes are driving the increase.'
            : trendDirection === 'decreasing'
              ? 'Keep the current savings actions in motion and watch for any rebound in the next pull.'
              : 'Keep a monthly variance watch on the biggest subscriptions to prevent drift.',
        tone,
        href: '/costs',
      });
    }

    return signals.slice(0, 6);
  }, [
    topSubscriptionDrivers,
    costs.status,
    costs.data,
    security.status,
    securityRecommendations.status,
    securityRecommendationSummary.high,
    securityRecommendationSummary.medium,
    secureScore,
    trendDirection,
    trendPercent,
    totalMonthly,
    inventorySummary.status,
    inventorySummary.data,
    licenses.status,
    licenses.data,
    dataGaps.length,
    gapSummary.high,
    gapSummary.topModules,
  ]);

  const recommendedActions = useMemo(() => {
    const fromSignals = executiveSignals.map((signal) => signal.action);
    const fromInsights = prioritizedInsights
      .map((insight) => replaceSubscriptionIdsInText(insight.recommendation ?? insight.message ?? '', subscriptionNames))
      .filter((line) => line.trim().length > 0);
    return [...new Set([...fromSignals, ...fromInsights])].slice(0, 6);
  }, [executiveSignals, prioritizedInsights, subscriptionNames]);

  const briefingLine = useMemo(() => {
    const segments: string[] = [];
    if (totalMonthly > 0) {
      segments.push(
        `Current monthly run rate is ${formatCurrency(totalMonthly)} (${formatCurrency(annualRunRate)} annualized).`
      );
    }
    if (security.status === 'success') {
      segments.push(`Security score is ${formatPercent(secureScore, 1)}.`);
    }
    if (inventorySummary.status === 'success' && inventorySummary.data) {
      segments.push(
        `${formatCompact(inventorySummary.data.total_resources)} resources across ${inventorySummary.data.total_subscriptions} subscriptions are in current scope.`
      );
    }
    if (segments.length === 0) {
      return 'Assessment data is still loading. Pull data once to build a full executive narrative.';
    }
    return segments.join(' ');
  }, [annualRunRate, inventorySummary.data, inventorySummary.status, secureScore, security.status, totalMonthly]);

  const moduleErrors = [
    costs.error,
    costBySubscription.error,
    costByType.error,
    security.error,
    securityRecommendations.error,
    inventorySummary.error,
    licenses.error,
    gaps.error,
    insights.error,
  ].filter(Boolean) as string[];

  const dataQualityStatus =
    gapSummary.high > 0 ? 'red' : dataGaps.length > 0 ? 'amber' : 'green';

  return (
    <PageLayout title="Executive summary" exportId="executive-summary">
      <SectionNav sections={execSections} />
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${overallPercentage}%` }} />
      </div>
      <p className="progress-label">
        {completedCount} / {totalCount} modules loaded ({overallPercentage}%)
        {hasErrors && '. Some modules failed'}
      </p>

      <section id="exec-briefing" className="exec-briefing">
        <h2>Executive briefing</h2>
        <p>{briefingLine}</p>
        {moduleErrors.length > 0 && (
          <p className="exec-briefing-warning">
            Some module calls returned errors. Figures shown are based on currently available cached and live data.
          </p>
        )}
      </section>

      <div id="exec-kpis" className="exec-kpi-layout">
        <button
          type="button"
          className="exec-kpi-btn"
          onClick={() => navigate('/costs')}
          title="Open cost analysis"
        >
          <Card className="exec-kpi-card">
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Monthly cloud spend</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-2 pb-4 flex flex-col gap-1.5">
              {costs.status === 'success' && costs.data ? (
                <>
                  <p className="big-number">{formatCurrency(totalMonthly)}</p>
                  {/* Prefer full-month month-over-month (from CostAnalysis logic) when available */}
                  <TrendBadge trend={trendPairs.previous?.trend ?? trendDirection} label={`${(trendPairs.previous?.pct ?? trendPercent).toFixed(1)}%`} />
                  <p className="exec-kpi-note">Annualized run rate: {formatCurrency(annualRunRate)}</p>
                  {trendPairs.previous ? (
                    <p className="exec-kpi-note">Full-month month over month: {trendPairs.previous.fromMonth}/{trendPairs.previous.toMonth}</p>
                  ) : null}
                  {monthlySparkline ? (
                    <div className="mini-cost-trend">
                      <svg
                        className="exec-sparkline-svg"
                        viewBox={`0 0 ${monthlySparkline.width} ${monthlySparkline.height}`}
                        aria-label="Monthly cloud spend trend"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient id="exec-cost-spark-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(79,143,247,0.30)" />
                            <stop offset="100%" stopColor="rgba(79,143,247,0.03)" />
                          </linearGradient>
                        </defs>
                        <path d={monthlySparkline.areaPath} fill="url(#exec-cost-spark-fill)" />
                        <path d={monthlySparkline.linePath} className="exec-sparkline-stroke" />
                      </svg>
                      <div className="exec-sparkline-meta">
                        <span>{monthlySparkline.firstMonth}</span>
                        <span>{formatCurrency(monthlySparkline.latestValue)}</span>
                        <span>{monthlySparkline.lastMonth}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mini-cost-trend-empty">Trend data not returned yet.</p>
                  )}
                  <span className="card-link-hint">Open cost analysis</span>
                </>
              ) : costs.status === 'error' ? (
                <p className="error-text">Failed to load cost summary: {costs.error}</p>
              ) : (
                <p className="loading-text">Loading…</p>
              )}
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          className="exec-kpi-btn"
          onClick={() => navigate('/security')}
          title="Open security and health"
        >
          <Card className="exec-kpi-card">
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Security posture</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-2 pb-4 flex flex-col gap-1.5">
              {securityModuleStatus === 'success' ? (
                <>
                  <p className="big-number">{formatPercent(secureScore, 1)}</p>
                  <p className="exec-kpi-note">
                    Advisor findings: {securityRecommendationSummary.high} high, {securityRecommendationSummary.medium} medium
                  </p>
                  <span className="card-link-hint">Open security details</span>
                </>
              ) : securityModuleStatus === 'error' ? (
                <p className="error-text">
                  Failed to load security summary: {security.error ?? securityRecommendations.error}
                </p>
              ) : (
                <p className="loading-text">Loading…</p>
              )}
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          className="exec-kpi-btn"
          onClick={() => navigate('/inventory')}
          title="Open inventory"
        >
          <Card className="exec-kpi-card">
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Asset footprint</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-2 pb-4 flex flex-col gap-1.5">
              {inventorySummary.status === 'success' && inventorySummary.data ? (
                <>
                  <p className="big-number">{formatCompact(inventorySummary.data.total_resources)}</p>
                  <p className="exec-kpi-note">
                    {inventorySummary.data.total_subscriptions} subscriptions, {inventorySummary.data.total_resource_groups} groups
                  </p>
                  <p className="exec-kpi-note">
                    {inventorySummary.data.untagged_count} untagged ({inventorySummary.data.untagged_percentage.toFixed(1)}%)
                  </p>
                  <span className="card-link-hint">Open inventory</span>
                </>
              ) : inventorySummary.status === 'error' ? (
                <p className="error-text">Failed to load inventory summary: {inventorySummary.error}</p>
              ) : (
                <p className="loading-text">Loading…</p>
              )}
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          className="exec-kpi-btn"
          onClick={() => navigate(routePaths.dataPull)}
          title="Open data gaps"
        >
          <Card className="exec-kpi-card">
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data reliability</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-2 pb-4 flex flex-col justify-between gap-2 h-full">
              <div className="flex flex-col gap-1.5">
                <RAGStatus status={dataQualityStatus} />
                <p className="big-number">{dataGaps.length}</p>
                <p className="exec-kpi-note">
                  High: {gapSummary.high}, medium: {gapSummary.medium}, low: {gapSummary.low}
                  {gapSummary.topModules.length > 0 ? ` · Top modules: ${gapSummary.topModules.join(', ')}` : ''}
                </p>
              </div>
              <span className="card-link-hint mt-auto">Open data gaps</span>
            </CardContent>
          </Card>
        </button>

      </div>

      <div className="exec-driver-grid">
        <ChartCard title="Top subscription spend drivers" subtitle="Largest subscriptions by monthly spend">
          {topSubscriptionDrivers.length > 0 ? (
              <div className="exec-driver-list">
                {topSubscriptionDrivers.map((row) => (
                  <div key={row.id} className="exec-driver-row">
                    <div className="exec-driver-meta">
                      <span className="exec-driver-name">{row.name}</span>
                    <span className="exec-driver-value">
                      {formatCurrency(row.amount)} ({row.share.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="exec-driver-track">
                    <div className="exec-driver-fill" style={{ width: `${Math.max(4, Math.min(row.share, 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No subscription-level spend data returned yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Top resource type spend drivers" subtitle="Largest Azure service categories by monthly spend">
          {topTypeDrivers.length > 0 ? (
            <div className="exec-driver-list">
              {topTypeDrivers.map((row) => (
                <div key={row.name} className="exec-driver-row">
                  <div className="exec-driver-meta">
                    <span className="exec-driver-name">{row.name}</span>
                    <span className="exec-driver-value">
                      {formatCurrency(row.amount)} ({row.share.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="exec-driver-track">
                    <div className="exec-driver-fill" style={{ width: `${Math.max(4, Math.min(row.share, 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No resource-type spend data returned yet.</p>
          )}
          {topTypeHint && <p className="cost-chart-note">{topTypeHint}</p>}
        </ChartCard>
      </div>

      <section id="exec-signals" className="exec-signals-section">
        <h2>Priority signals</h2>
        {executiveSignals.length > 0 ? (
          <div className="exec-signal-grid">
            {executiveSignals.map((signal, idx) => (
              <Card key={`${signal.title}-${idx}`} className={`exec-signal-card tone-${signal.tone}`}>
                <CardHeader className="px-4 pt-4 pb-0">
                  <div className="exec-signal-header">
                    <CardTitle className="text-sm">{signal.title}</CardTitle>
                    <span className={`exec-signal-pill tone-${signal.tone}`}>{toneLabel(signal.tone)}</span>
                  </div>
                  <p className="exec-signal-metric">{signal.metric}</p>
                </CardHeader>
                <CardContent className="px-4 pt-2 pb-4 flex flex-col gap-2">
                  <p>{signal.context}</p>
                  <p className="exec-signal-action">{signal.action}</p>
                  {signal.href && (
                    <Button variant="outline" size="sm" className="exec-signal-btn" onClick={() => navigate(signal.href!)}>
                      Open related page
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="empty-state">Not enough data yet to generate priority signals.</p>
        )}
      </section>

      <section id="exec-actions" className="exec-action-section">
        <h2>Executive actions</h2>
        {recommendedActions.length > 0 ? (
          <ol className="exec-action-grid">
            {recommendedActions.map((action, idx) => (
              <li key={`${idx}-${action.slice(0, 20)}`} className="exec-action-card">
                <span className="exec-action-step">Action {idx + 1}</span>
                <p>{action}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">Action recommendations will appear once insights and module data are available.</p>
        )}
      </section>

      <section id="exec-findings" className="insights-section">
        <h2>Key findings</h2>
        {insights.status === 'success' ? (
          insightRows.length === 0 ? (
            <p className="empty-state">No findings yet. Run a full assessment first.</p>
          ) : (
            <>
              <div className="exec-insight-summary">
                <span className="exec-insight-chip severity-critical">{insightSummary.critical} critical</span>
                <span className="exec-insight-chip severity-high">{insightSummary.high} high</span>
                <span className="exec-insight-chip severity-medium">{insightSummary.medium} medium</span>
                <span className="exec-insight-chip severity-low">{insightSummary.low} low</span>
              </div>
              <div className="insights-list">
                {prioritizedInsights.slice(0, 10).map((insight, i) => (
                  <div key={`${insight.title}-${i}`} className={`insight-card severity-${insight.severity}`}>
                    <div className="insight-header">
                      <span className="insight-category">{insight.category}</span>
                      <span className={`insight-severity severity-${insight.severity}`}>{insight.severity}</span>
                    </div>
                    <h4>{insight.title}</h4>
                    <p>{replaceSubscriptionIdsInText(insight.description ?? insight.message ?? 'No description provided.', subscriptionNames)}</p>
                    {insight.recommendation && <p className="insight-rec">→ {replaceSubscriptionIdsInText(insight.recommendation, subscriptionNames)}</p>}
                  </div>
                ))}
              </div>
            </>
          )
        ) : insights.status === 'error' ? (
          <p className="error-text">Failed to load insights: {insights.error}</p>
        ) : (
          <p className="loading-text">Loading insights…</p>
        )}
      </section>
    </PageLayout>
  );
}
