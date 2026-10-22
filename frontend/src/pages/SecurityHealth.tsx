/**
 * SecurityHealth.tsx — Security posture, Defender scores, Advisor scores & recommendations.
 *
 * Design goals:
 *   • Every number is labelled and explained so you never wonder "what am I looking at?"
 *   • Resource Health % (healthy ÷ total) = the intuitive metric everyone understands
 *   • Defender Secure Score = Azure's weighted point system (shown alongside for context)
 *   • Insights auto-generated from the data to surface what matters
 */

import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { PageLayout } from '../components/layout/PageLayout';
import { ScoreCard } from '../components/shared/ScoreCard';
import { DataTable } from '../components/shared/DataTable';
import { AdvisorRadar } from '../components/charts/AdvisorRadar';
import { ChartCard } from '../components/shared/ChartCard';
import { Badge } from '../components/ui/badge';
import { useModuleData } from '../hooks/useModuleData';
import { securityApi } from '../api/security';
import { inventoryApi } from '../api/inventory';
import type {
  AdvisorRecommendation,
  AdvisorScore,
  AdvisorScoresResponse,
  CspmAssessmentFinding,
  CspmAssessmentSubscription,
  CspmAttackPath,
  CspmAttackPathSubscription,
  CspmInsightsResponse,
  CspmUnavailableSignal,
  DefenderControl,
  DefenderScoreResponse,
  SecureScore,
  Subscription,
} from '../types';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';

/* ── Helpers ── */

function tierClass(pct: number): string {
  if (pct >= 80) return 'tier tier--good';
  if (pct >= 50) return 'tier tier--fair';
  return 'tier tier--poor';
}

function tierColor(pct: number): string {
  if (pct >= 80) return 'var(--color-success)';
  if (pct >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
}


function isGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function fmtPct(n: number): string {
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`;
}

function fmtScore(current: number, max: number): string {
  const c = current % 1 === 0 ? String(current) : current.toFixed(2);
  const m = max % 1 === 0 ? String(max) : max.toFixed(0);
  return `${c} / ${m} pts`;
}

/* ── Mini bar component ── */
function MiniBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = color ?? tierColor(pct);
  return (
    <div className="mini-bar-track">
      <div className="mini-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
    </div>
  );
}

/* ── Extended rollup type ── */
interface ControlRollup {
  name: string;
  subscription_count: number;
  current_score: number;
  max_score: number;
  defender_pct: number;     // Azure's weighted score %
  healthy_count: number;
  unhealthy_count: number;
  not_applicable_count: number;
  total_assessed: number;
  health_pct: number;       // healthy ÷ (healthy + unhealthy) — the intuitive metric
}

export default function SecurityHealth() {
  const [impactFilter, setImpactFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('');

  /* ── Data fetching ── */
  const advisorScores = useModuleData<AdvisorScoresResponse>(() => securityApi.advisorScores(), [], {
    cacheKey: MODULE_CACHE_KEYS.securityAdvisorScores,
  });
  const recommendations = useModuleData<AdvisorRecommendation[]>(() => securityApi.advisorRecommendations(), [], {
    cacheKey: MODULE_CACHE_KEYS.securityAdvisorRecommendations,
  });
  const defenderScores = useModuleData<DefenderScoreResponse>(() => securityApi.defenderScores(), [], {
    cacheKey: MODULE_CACHE_KEYS.securityDefenderScores,
  });
  const cspmInsights = useModuleData<CspmInsightsResponse>(() => securityApi.cspmInsights(), [], {
    cacheKey: MODULE_CACHE_KEYS.securityCspmInsights,
  });
  const subscriptions = useModuleData<Subscription[]>(() => inventoryApi.subscriptions(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions,
  });

  /* ── Subscription name resolution ── */
  const subscriptionNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const sub of subscriptions.data ?? []) {
      if (sub.subscription_id && sub.display_name) {
        map.set(sub.subscription_id, sub.display_name);
      }
    }
    return map;
  }, [subscriptions.data]);

  const resolveSubscriptionName = (subscriptionId: string | undefined, candidateName: string | undefined): string => {
    const explicit = (candidateName ?? '').trim();
    if (explicit && !isGuid(explicit)) return explicit;
    const id = (subscriptionId ?? '').trim();
    if (id && subscriptionNames.has(id)) return subscriptionNames.get(id)!;
    if (explicit && subscriptionNames.has(explicit)) return subscriptionNames.get(explicit)!;
    if (id) return id;
    return 'Unknown subscription';
  };

  /* ── Defender per-subscription rows ── */
  const defenderRows = useMemo<SecureScore[]>(() => {
    const raw = defenderScores.data?.scores ?? [];
    const byId = new Map<string, SecureScore>();
    for (const row of raw) {
      if (row.subscription_id) byId.set(row.subscription_id, row);
    }

    const rows: SecureScore[] = [];
    for (const sub of subscriptions.data ?? []) {
      const fromDefender = byId.get(sub.subscription_id);
      if (fromDefender) {
        rows.push({
          ...fromDefender,
          subscription_name: resolveSubscriptionName(fromDefender.subscription_id, fromDefender.subscription_name),
        });
        byId.delete(sub.subscription_id);
      } else {
        rows.push({
          subscription_id: sub.subscription_id,
          subscription_name: sub.display_name || sub.subscription_id,
          current_score: 0,
          max_score: 0,
          percentage: 0,
          unavailable: true,
        });
      }
    }
    for (const row of byId.values()) {
      rows.push({
        ...row,
        subscription_name: resolveSubscriptionName(row.subscription_id, row.subscription_name),
      });
    }
    if (rows.length === 0) {
      return raw.map((row) => ({
        ...row,
        subscription_name: resolveSubscriptionName(row.subscription_id, row.subscription_name),
      }));
    }
    return rows.sort((a, b) => a.subscription_name.localeCompare(b.subscription_name));
  }, [defenderScores.data?.scores, subscriptions.data]);

  /* ── Defender control rollups with health % ── */
  const defenderControlRollups = useMemo<ControlRollup[]>(() => {
    const rows: DefenderControl[] = defenderScores.data?.controls ?? [];
    const byName = new Map<string, ControlRollup>();

    for (const row of rows) {
      const key = row.name || 'Unnamed control';
      const existing = byName.get(key) ?? {
        name: key,
        subscription_count: 0,
        current_score: 0,
        max_score: 0,
        defender_pct: 0,
        healthy_count: 0,
        unhealthy_count: 0,
        not_applicable_count: 0,
        total_assessed: 0,
        health_pct: 0,
      };
      existing.subscription_count += 1;
      existing.current_score += row.current_score ?? 0;
      existing.max_score += row.max_score ?? 0;
      existing.healthy_count += row.healthy_count ?? 0;
      existing.unhealthy_count += row.unhealthy_count ?? 0;
      existing.not_applicable_count += row.not_applicable_count ?? 0;
      byName.set(key, existing);
    }

    return [...byName.values()]
      .map((row) => {
        const assessed = row.healthy_count + row.unhealthy_count;
        return {
          ...row,
          total_assessed: assessed,
          health_pct: assessed > 0 ? Number(((row.healthy_count / assessed) * 100).toFixed(1)) : 100,
          defender_pct: row.max_score > 0 ? Number(((row.current_score / row.max_score) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => {
        if (b.unhealthy_count !== a.unhealthy_count) return b.unhealthy_count - a.unhealthy_count;
        return a.health_pct - b.health_pct;
      })
      .slice(0, 15);
  }, [defenderScores.data?.controls]);

  /* ── Posture totals ── */
  const postureTotals = useMemo(() => {
    const posture = defenderScores.data?.posture_summary;
    const controls = defenderScores.data?.controls ?? [];
    const healthy = posture?.total_healthy ?? controls.reduce((s, c) => s + (c.healthy_count ?? 0), 0);
    const unhealthy = posture?.total_unhealthy ?? controls.reduce((s, c) => s + (c.unhealthy_count ?? 0), 0);
    const assessed = healthy + unhealthy;
    return {
      healthy,
      unhealthy,
      assessed,
      healthPct: assessed > 0 ? Math.round((healthy / assessed) * 100) : 0,
      controlsTotal: posture?.total_controls ?? new Set(controls.map((c) => c.name)).size,
      controlsAtRisk: posture?.controls_at_risk ?? 0,
    };
  }, [defenderScores.data]);

  /* ── Advisor memos ── */
  const aggregateAdvisorScores = useMemo<AdvisorScore[]>(
    () => advisorScores.data?.aggregated_scores ?? [],
    [advisorScores.data]
  );

  const advisorScoresBySubscription = useMemo<AdvisorScore[]>(
    () => (advisorScores.data?.scores_by_subscription ?? [])
      .map((row) => ({
        ...row,
        subscription_name: resolveSubscriptionName(row.subscription_id, row.subscription_name),
      }))
      .sort((a, b) => {
        const bySub = (a.subscription_name ?? '').localeCompare(b.subscription_name ?? '');
        if (bySub !== 0) return bySub;
        return (a.category ?? a.pillar ?? '').localeCompare(b.category ?? b.pillar ?? '');
      }),
    [advisorScores.data, subscriptionNames]
  );

  const advisorScoresBySubscriptionFiltered = useMemo<AdvisorScore[]>(() => {
    return advisorScoresBySubscription.filter((row) => {
      const label = (row.category ?? row.pillar ?? '').toString();
      const hasIdLike = /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label) || label.length > 50;
      return !hasIdLike;
    });
  }, [advisorScoresBySubscription]);

  /* ── Recommendation memos ── */
  const recSummary = useMemo(() => {
    const recs = recommendations.data ?? [];
    return {
      high: recs.filter((r) => r.impact === 'High').length,
      medium: recs.filter((r) => r.impact === 'Medium').length,
      low: recs.filter((r) => r.impact === 'Low').length,
      total: recs.length,
    };
  }, [recommendations.data]);

  const recommendationRows = useMemo(
    () =>
      (recommendations.data ?? []).map((row) => ({
        ...row,
        subscription_name: resolveSubscriptionName(row.subscription_id, row.subscription_name),
      })),
    [recommendations.data, subscriptionNames]
  );

  const recommendationCategories = useMemo(
    () => [...new Set(recommendationRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [recommendationRows]
  );

  const recommendationSubscriptions = useMemo(
    () => [...new Set(recommendationRows.map((row) => row.subscription_name ?? 'Unknown subscription'))].sort((a, b) => a.localeCompare(b)),
    [recommendationRows]
  );

  /* ── Auto-generated security insights ── */
  const securityInsights = useMemo(() => {
    const insights: Array<{ severity: string; title: string; detail: string }> = [];
    const data = defenderScores.data;
    const recs = recommendations.data ?? [];
    const advisorAgg = advisorScores.data?.aggregated_scores ?? [];

    if (!data) return insights;

    // Overall score
    if (data.overall_percentage < 50) {
      insights.push({
        severity: 'critical',
        title: `Secure Score is ${Math.round(data.overall_percentage)}%. Below critical threshold.`,
        detail: 'Immediate action is needed. Focus on the controls with the most unhealthy resources below. Remediating those will have the biggest impact on your score.',
      });
    } else if (data.overall_percentage < 80) {
      insights.push({
        severity: 'high',
        title: `Secure Score is ${Math.round(data.overall_percentage)}%. Below the 80% target.`,
        detail: 'Microsoft recommends maintaining a Secure Score above 80%. Review the controls table below to find quick wins for score improvement.',
      });
    }

    // Resource health
    if (postureTotals.unhealthy > 0) {
      const ratio = postureTotals.assessed > 0 ? Math.round((postureTotals.unhealthy / postureTotals.assessed) * 100) : 0;
      insights.push({
        severity: ratio > 50 ? 'critical' : ratio > 25 ? 'high' : 'medium',
        title: `${postureTotals.unhealthy} of ${postureTotals.assessed} assessed resources are unhealthy (${ratio}%)`,
        detail: `These resources have failed one or more Defender security checks. Prioritise controls with the highest unhealthy counts for maximum impact.`,
      });
    }

    // Subscription score spread
    const subs = data.scores ?? [];
    if (subs.length > 1) {
      const pcts = subs.map((s) => s.percentage);
      const min = Math.min(...pcts);
      const max = Math.max(...pcts);
      if (max - min > 15) {
        const weakest = subs.find((s) => s.percentage === min);
        insights.push({
          severity: min < 50 ? 'high' : 'medium',
          title: `Score gap across subscriptions: ${fmtPct(min)} to ${fmtPct(max)}`,
          detail: `"${weakest?.subscription_name ?? 'One subscription'}" has the lowest score. Consider applying consistent security policies across all subscriptions.`,
        });
      }
    }

    // Controls at risk
    if (postureTotals.controlsAtRisk > 0) {
      insights.push({
        severity: postureTotals.controlsAtRisk > postureTotals.controlsTotal / 2 ? 'high' : 'medium',
        title: `${postureTotals.controlsAtRisk} of ${postureTotals.controlsTotal} security controls are below 80%`,
        detail: 'These controls represent security areas that need attention. The controls table below is sorted by unhealthy resource count. Start from the top.',
      });
    }

    // High-impact Advisor recs
    const highRecs = recs.filter((r) => r.impact === 'High').length;
    if (highRecs > 0) {
      insights.push({
        severity: highRecs > 10 ? 'high' : 'medium',
        title: `${highRecs} high-impact Advisor recommendation${highRecs !== 1 ? 's' : ''} pending`,
        detail: 'Azure Advisor has identified high-impact findings across your subscriptions. Scroll to the Recommendations section to review.',
      });
    }

    // Weakest Advisor pillar
    if (advisorAgg.length > 0) {
      const lowest = [...advisorAgg].sort((a, b) => a.score - b.score)[0];
      if (lowest.score < 70) {
        insights.push({
          severity: lowest.score < 50 ? 'high' : 'medium',
          title: `Advisor ${lowest.category ?? lowest.pillar} pillar scores ${lowest.score.toFixed(0)}%`,
          detail: `This is your weakest Azure Advisor pillar. Review the category-specific recommendations to improve it.`,
        });
      }
    }

    return insights;
  }, [defenderScores.data, recommendations.data, advisorScores.data, postureTotals]);

  const filteredRecommendations = useMemo(
    () =>
      recommendationRows.filter((row) => {
        if (impactFilter && row.impact !== impactFilter) return false;
        if (categoryFilter && row.category !== categoryFilter) return false;
        if (subscriptionFilter && (row.subscription_name ?? 'Unknown subscription') !== subscriptionFilter) return false;
        return true;
      }),
    [recommendationRows, impactFilter, categoryFilter, subscriptionFilter]
  );

  /* ── Column definitions ── */

  const defenderCol = createColumnHelper<SecureScore>();
  const defenderColumns = useMemo(() => [
    defenderCol.accessor('subscription_name', {
      header: 'Subscription',
      cell: (info) => {
        const name = info.getValue();
        const id = info.row.original.subscription_id;
        return (
          <div>
            <div className="cell-primary">{name || id}</div>
            <div className="cell-sub-text">{id}</div>
          </div>
        );
      },
    }),
    defenderCol.accessor('percentage', {
      header: 'Secure Score',
      cell: (info) => {
        const pct = info.getValue();
        const row = info.row.original;
        if (row.unavailable) {
          return (
            <div className="score-cell">
              <span className="cell-primary">Unavailable</span>
              <span className="cell-sub-text">Secure score was not collected for this subscription in the current snapshot.</span>
            </div>
          );
        }
        return (
          <div className="score-cell">
            <span className={tierClass(pct)}>{fmtPct(pct)}</span>
            <MiniBar value={pct} max={100} />
            <span className="cell-sub-text">{fmtScore(row.current_score, row.max_score)}</span>
          </div>
        );
      },
    }),
  ], []);

  const controlCol = createColumnHelper<ControlRollup>();
  const controlColumns = useMemo(() => [
    controlCol.accessor('name', {
      header: 'Security Control',
      cell: (info) => (
        <div>
          <div className="cell-primary">{info.getValue()}</div>
          <div className="cell-sub-text">Across {info.row.original.subscription_count} subscription{info.row.original.subscription_count !== 1 ? 's' : ''}</div>
        </div>
      ),
    }),
    controlCol.accessor('health_pct', {
      header: 'Resource Health',
      cell: (info) => {
        const row = info.row.original;
        const pct = info.getValue();
        return (
          <div className="score-cell">
            <span className={tierClass(pct)}>{fmtPct(pct)}</span>
            <MiniBar value={row.healthy_count} max={row.total_assessed} />
            <span className="cell-sub-text">{row.healthy_count} healthy, {row.unhealthy_count} unhealthy</span>
          </div>
        );
      },
    }),
    controlCol.accessor('defender_pct', {
      header: 'Defender Score',
      cell: (info) => {
        const pct = info.getValue();
        const row = info.row.original;
        return (
          <div className="score-cell">
            <span className={tierClass(pct)}>{fmtPct(pct)}</span>
            <span className="cell-sub-text">{fmtScore(row.current_score, row.max_score)}</span>
          </div>
        );
      },
    }),
  ], []);

  const recCol = createColumnHelper<AdvisorRecommendation>();
  const recColumns = useMemo(() => [
    recCol.accessor('category', { header: 'Category' }),
    recCol.accessor('impact', {
      header: 'Impact',
      cell: (info) => {
        const impact = info.getValue();
        const variant =
          impact === 'High' ? 'critical' : impact === 'Medium' ? 'warning' : 'secondary';
        return <Badge variant={variant}>{impact}</Badge>;
      },
    }),
    recCol.accessor('description', { header: 'Finding' }),
    recCol.accessor('remediation', { header: 'Recommendation' }),
    recCol.accessor((row) => row.resource_name ?? row.resource_id?.split('/').pop() ?? '—', {
      id: 'resource',
      header: 'Resource',
    }),
    recCol.accessor((row) => row.subscription_name ?? row.subscription_id ?? '—', {
      id: 'subscription',
      header: 'Subscription',
    }),
  ], []);

  const advisorBySubCol = createColumnHelper<AdvisorScore>();
  const advisorBySubColumns = useMemo(() => [
    advisorBySubCol.accessor((row) => row.subscription_name ?? row.subscription_id ?? 'Unknown subscription', {
      id: 'subscription',
      header: 'Subscription',
    }),
    advisorBySubCol.accessor((row) => row.category ?? row.pillar ?? 'Unknown category', {
      id: 'category',
      header: 'Category',
    }),
    advisorBySubCol.accessor('score', {
      header: 'Score',
      cell: (info) => {
        const val = info.getValue();
        return (
          <div className="score-cell">
            <span className={tierClass(val)}>{val.toFixed(1)}%</span>
            <MiniBar value={val} max={100} />
          </div>
        );
      },
    }),
    advisorBySubCol.accessor('potential_score_increase', {
      header: 'Potential Uplift',
      cell: (info) => {
        const v = info.getValue() ?? 0;
        return v > 0 ? <span className="uplift-badge">+{v.toFixed(1)}%</span> : '—';
      },
    }),
  ], []);

  const cspmAssessmentSubCol = createColumnHelper<CspmAssessmentSubscription>();
  const cspmAssessmentSubColumns = useMemo(() => [
    cspmAssessmentSubCol.accessor('subscription_name', { header: 'Subscription' }),
    cspmAssessmentSubCol.accessor('unhealthy', { header: 'Unhealthy assessments' }),
    cspmAssessmentSubCol.accessor('total', { header: 'Total assessments' }),
    cspmAssessmentSubCol.accessor((row) => `${row.high}/${row.medium}/${row.low}`, {
      id: 'severity_mix',
      header: 'High / medium / low',
    }),
  ], []);

  const cspmAssessmentFindingCol = createColumnHelper<CspmAssessmentFinding>();
  const cspmAssessmentFindingColumns = useMemo(() => [
    cspmAssessmentFindingCol.accessor('name', { header: 'Assessment' }),
    cspmAssessmentFindingCol.accessor('severity', {
      header: 'Severity',
      cell: (info) => {
        const sev = info.getValue() ?? '';
        const variant =
          sev === 'High' ? 'critical' : sev === 'Medium' ? 'warning' : sev === 'Low' ? 'info' : 'secondary';
        return sev ? <Badge variant={variant}>{sev}</Badge> : <>—</>;
      },
    }),
    cspmAssessmentFindingCol.accessor('unhealthy', { header: 'Unhealthy count' }),
    cspmAssessmentFindingCol.accessor('subscriptions', { header: 'Subscriptions impacted' }),
  ], []);

  const cspmAttackPathSubCol = createColumnHelper<CspmAttackPathSubscription>();
  const cspmAttackPathSubColumns = useMemo(() => [
    cspmAttackPathSubCol.accessor('subscription_name', { header: 'Subscription' }),
    cspmAttackPathSubCol.accessor('total', { header: 'Attack paths' }),
    cspmAttackPathSubCol.accessor((row) => `${row.critical}/${row.high}/${row.medium}/${row.low}`, {
      id: 'risk_mix',
      header: 'Critical / high / medium / low',
    }),
  ], []);

  const cspmAttackPathCol = createColumnHelper<CspmAttackPath>();
  const cspmAttackPathColumns = useMemo(() => [
    cspmAttackPathCol.accessor('name', { header: 'Attack path' }),
    cspmAttackPathCol.accessor('risk_level', {
      header: 'Risk level',
      cell: (info) => {
        const risk = info.getValue() ?? '';
        const variant =
          risk === 'Critical' || risk === 'High' ? 'critical' : risk === 'Medium' ? 'warning' : risk === 'Low' ? 'info' : 'secondary';
        return risk ? <Badge variant={variant}>{risk}</Badge> : <>—</>;
      },
    }),
    cspmAttackPathCol.accessor('subscription_name', { header: 'Subscription' }),
    cspmAttackPathCol.accessor((row) => row.entry_point || '—', { id: 'entry_point', header: 'Entry point' }),
    cspmAttackPathCol.accessor((row) => row.target || '—', { id: 'target', header: 'Target' }),
  ], []);

  const unavailableSignalCol = createColumnHelper<CspmUnavailableSignal>();
  const unavailableSignalColumns = useMemo(() => [
    unavailableSignalCol.accessor('title', { header: 'Signal' }),
    unavailableSignalCol.accessor('status', { header: 'Status' }),
    unavailableSignalCol.accessor('detail', { header: 'Note' }),
    unavailableSignalCol.accessor('remediation', { header: 'Next step' }),
  ], []);

  const cspmAssessmentChartData = useMemo(
    () => (cspmInsights.data?.assessment_summary.by_subscription ?? [])
      .slice(0, 10)
      .map((row) => ({ name: row.subscription_name, value: row.unhealthy })),
    [cspmInsights.data?.assessment_summary.by_subscription]
  );

  const cspmAttackPathChartData = useMemo(
    () => (cspmInsights.data?.attack_path_summary.by_subscription ?? [])
      .slice(0, 10)
      .map((row) => ({ name: row.subscription_name, value: row.total })),
    [cspmInsights.data?.attack_path_summary.by_subscription]
  );

  /* ── Render ── */
  const dd = defenderScores.data;
  const overallPct = dd?.overall_percentage ?? 0;
  const cspm = cspmInsights.data;
  const assessmentTotals = cspm?.assessment_summary.totals ?? {};
  const attackPathTotals = cspm?.attack_path_summary.totals ?? {};

  return (
    <PageLayout title="Security & Health" exportId="security-page">

      {/* ═══════ 1. Security Posture at a Glance ═══════ */}
      <section className="security-section">
        <div className="section-header">
          <h3>Security Posture</h3>
          <span className="section-source">
            Microsoft Defender for Cloud — weighted secure score + resource health across all subscriptions
          </span>
        </div>

        {defenderScores.status === 'success' && dd ? (
          <>
            {/* Hero: ring + stat tiles */}
            <div className="posture-hero">
              <div className={`secure-score-ring ${overallPct >= 80 ? 'ring--good' : overallPct >= 50 ? 'ring--fair' : 'ring--poor'}`}>
                <svg viewBox="0 0 120 120" className="score-ring-svg">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-2)" strokeWidth="10" />
                  <circle cx="60" cy="60" r="52" fill="none" className="score-ring-fill" strokeWidth="10"
                    strokeDasharray={`${(overallPct / 100) * 327} 327`} strokeLinecap="round" transform="rotate(-90 60 60)" />
                </svg>
                <div className="score-ring-label">
                  <span className="score-ring-value">{Math.round(overallPct)}%</span>
                  <span className="score-ring-caption">Secure Score</span>
                </div>
              </div>

              <div className="posture-tiles">
                <div className="posture-tile">
                  <span className="posture-tile-value">{(dd.overall_current ?? 0) % 1 === 0 ? dd.overall_current : (dd.overall_current ?? 0).toFixed(1)}</span>
                  <span className="posture-tile-sub">/ {(dd.overall_max ?? 0) % 1 === 0 ? dd.overall_max : (dd.overall_max ?? 0).toFixed(0)} pts</span>
                  <span className="posture-tile-label">Defender Score Points</span>
                  <span className="posture-tile-help">Azure's weighted score across all controls</span>
                </div>
                <div className="posture-tile posture-tile--good">
                  <span className="posture-tile-value">{postureTotals.healthy}</span>
                  <span className="posture-tile-label">Healthy Resources</span>
                  <span className="posture-tile-help">Passed all applicable security checks</span>
                </div>
                <div className="posture-tile posture-tile--bad">
                  <span className="posture-tile-value">{postureTotals.unhealthy}</span>
                  <span className="posture-tile-label">Unhealthy Resources</span>
                  <span className="posture-tile-help">Failed one or more security checks</span>
                </div>
                <div className="posture-tile">
                  <span className="posture-tile-value">{postureTotals.healthPct}%</span>
                  <span className="posture-tile-label">Overall Resource Health</span>
                  <span className="posture-tile-help">Healthy ÷ total assessed resources</span>
                </div>
              </div>
            </div>

            {/* Subscription breakdown */}
            <div className="security-sub-section">
              <h4>Secure Score by Subscription</h4>
              <p className="section-note">
                Each subscription's <strong>Secure Score</strong> is Azure Defender's weighted assessment of your security posture.
                The percentage reflects how many available security points you've earned.
              </p>
              <DataTable data={defenderRows} columns={defenderColumns} exportFileName="defender secure score by subscription" />
            </div>
          </>
        ) : defenderScores.status === 'error' ? (
          <p className="error-text">Failed to load secure scores: {defenderScores.error}</p>
        ) : (
          <p className="loading-text">Loading secure scores…</p>
        )}
      </section>

      {/* ═══════ 2. Insights ═══════ */}
      {securityInsights.length > 0 && (
        <section className="security-section">
          <div className="section-header">
            <h3>Key Findings</h3>
            <span className="section-source">Auto-generated from your Defender and Advisor data</span>
          </div>
          <div className="insights-list">
            {securityInsights.map((insight, idx) => (
              <div key={idx} className={`insight-card severity-${insight.severity}`}>
                <div className="insight-header">
                  <span className={`insight-severity severity-${insight.severity}`}>{insight.severity}</span>
                </div>
                <h4>{insight.title}</h4>
                <p className="insight-detail">{insight.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════ 3. Secure Score Controls ═══════ */}
      <section className="security-section">
        <div className="section-header">
          <h3>Security Controls Breakdown</h3>
          <span className="section-source">
            Top 15 controls sorted by unhealthy resource count — your highest-impact remediation targets
          </span>
        </div>

        <p className="section-note">
          <strong>Resource Health</strong> = percentage of assessed resources that passed all security checks for this control (healthy ÷ total). &nbsp;
          <strong>Defender Score</strong> = Azure's weighted score points for this control — it factors in control importance, so a control with many unhealthy resources may still have a low Defender Score if the control carries less weight.
        </p>

        {defenderControlRollups.length > 0 ? (
          <DataTable data={defenderControlRollups} columns={controlColumns} exportFileName="defender control rollups" />
        ) : (
          <p className="empty-state">No Defender control data available yet.</p>
        )}
      </section>

      {/* ═══════ 4. Azure Advisor Scores ═══════ */}
      <section className="security-section">
        <div className="section-header">
          <h3>Azure Advisor Scores</h3>
          <span className="section-source">
            Azure Advisor — operational excellence across five pillars
          </span>
        </div>

        {advisorScores.status === 'success' ? (
          <>
            <p className="section-note">
              Advisor evaluates your resources against five Well-Architected pillars.
              Each score (0–100) reflects how well you follow Azure best practices for that pillar.
            </p>
            <div className="dashboard-grid">
              {aggregateAdvisorScores
                .filter((score) => {
                  const label = (score.category ?? score.pillar ?? '').toString();
                  const hasIdLike = /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label);
                  // Hide tiles that are just an id (GUID-like label)
                  if (hasIdLike) return false;
                  return true;
                })
                .map((score) => (
                <ScoreCard
                  key={`agg-${score.category ?? score.pillar}`}
                  label={score.category ?? score.pillar}
                  value={score.score}
                  maxValue={100}
                />
              ))}
              {aggregateAdvisorScores.length === 0 && <p className="empty-state">No aggregate advisor scores returned yet.</p>}
            </div>

            {aggregateAdvisorScores.length > 0 && (
              <AdvisorRadar scores={aggregateAdvisorScores.map((s) => ({ category: s.category ?? s.pillar, score: s.score, max_score: s.max_score }))} />
            )}

            <h4>By Subscription &amp; Pillar</h4>
            {advisorScoresBySubscriptionFiltered.length > 0 ? (
              <DataTable data={advisorScoresBySubscriptionFiltered} columns={advisorBySubColumns} exportFileName="advisor scores by subscription" />
            ) : (
              <p className="empty-state">No per-subscription advisor scores returned yet.</p>
            )}
          </>
        ) : advisorScores.status === 'error' ? (
          <p className="error-text">Failed to load advisor scores: {advisorScores.error}</p>
        ) : (
          <p className="loading-text">Loading advisor scores…</p>
        )}
      </section>

      {/* ═══════ 5. Advisor Recommendations ═══════ */}
      <section className="security-section">
        <div className="section-header">
          <h3>Advisor Recommendations</h3>
          <span className="section-source">
            Actionable findings from Azure Advisor across all subscriptions
          </span>
        </div>

        {recommendations.status === 'success' && recommendations.data ? (
          <>
            <div className="rec-summary-row">
              <span className="rec-summary-badge rec-summary-high">{recSummary.high} High</span>
              <span className="rec-summary-badge rec-summary-medium">{recSummary.medium} Medium</span>
              <span className="rec-summary-badge rec-summary-low">{recSummary.low} Low</span>
              <span className="rec-summary-total">{recSummary.total} total findings</span>
            </div>

            <div className="security-filter-row">
              <select className="inventory-filter-select" title="Filter by impact" value={impactFilter} onChange={(e) => setImpactFilter(e.target.value)}>
                <option value="">All impacts</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <select className="inventory-filter-select" title="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {recommendationCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select className="inventory-filter-select" title="Filter by subscription" value={subscriptionFilter} onChange={(e) => setSubscriptionFilter(e.target.value)}>
                <option value="">All subscriptions</option>
                {recommendationSubscriptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <p className="cost-chart-note">{filteredRecommendations.length} of {recSummary.total} recommendations shown.</p>
            <DataTable data={filteredRecommendations} columns={recColumns} exportFileName="advisor recommendations" />
          </>
        ) : recommendations.status === 'error' ? (
          <p className="error-text">Failed to load recommendations: {recommendations.error}</p>
        ) : (
          <p className="loading-text">Loading recommendations…</p>
        )}
      </section>

      {/* ═══════ 6. CSPM Coverage & Extended Signals ═══════ */}
      <section className="security-section">
        <div className="section-header">
          <h3>CSPM coverage and extended signals</h3>
          <span className="section-source">
            Microsoft Defender for Cloud + Azure Resource Graph across enabled subscriptions
          </span>
        </div>

        <p className="section-note">
          This section separates three things: what Cloud Assessment Workbench already covers today, what extra CSPM telemetry we could
          pull now, and which CSPM signals still returned no data or do not yet have a dedicated collector.
        </p>

        {cspmInsights.status === 'success' && cspm ? (
          <>
            <div className="security-sub-section">
              <h4>1. Already covered in Cloud Assessment Workbench</h4>
              <div className="cspm-covered-grid">
                {cspm.already_covered.map((item) => (
                  <div key={item.id} className="cspm-covered-card">
                    <span className="cspm-covered-badge">{item.coverage}</span>
                    <h5>{item.title}</h5>
                    <p>{item.detail}</p>
                    <span className="cell-sub-text">Source: {item.source}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="security-sub-section">
              <h4>2. Additional CSPM telemetry pulled</h4>
              <div className="posture-tiles cspm-kpi-grid">
                <div className="posture-tile">
                  <span className="posture-tile-value">{cspm.subscription_count}</span>
                  <span className="posture-tile-label">Subscriptions evaluated</span>
                </div>
                <div className="posture-tile posture-tile--bad">
                  <span className="posture-tile-value">{assessmentTotals.unhealthy ?? 0}</span>
                  <span className="posture-tile-label">Unhealthy assessments</span>
                </div>
                <div className="posture-tile">
                  <span className="posture-tile-value">{assessmentTotals.total ?? 0}</span>
                  <span className="posture-tile-label">Assessment rows</span>
                </div>
                <div className={`posture-tile${(attackPathTotals.total ?? 0) > 0 ? ' posture-tile--bad' : ''}`}>
                  <span className="posture-tile-value">{attackPathTotals.total ?? 0}</span>
                  <span className="posture-tile-label">Attack paths</span>
                </div>
              </div>

              <div className="dashboard-grid dashboard-grid--two-up">
                <ChartCard
                  title="Unhealthy assessments by subscription"
                  subtitle="Defender assessment findings returned via Resource Graph"
                  data={cspmAssessmentChartData}
                  xKey="name"
                  yKey="value"
                  chartType="bar"
                  height={320}
                  barLabelMode="inside"
                />
                <ChartCard
                  title="Attack paths by subscription"
                  subtitle="Defender attack-path records returned via Resource Graph"
                  data={cspmAttackPathChartData}
                  xKey="name"
                  yKey="value"
                  chartType="bar"
                  height={320}
                  barLabelMode="inside"
                />
              </div>

              {cspm.assessment_summary.by_subscription.length > 0 ? (
                <>
                  <h4>Assessment posture by subscription</h4>
                  <DataTable data={cspm.assessment_summary.by_subscription} columns={cspmAssessmentSubColumns} exportFileName="cspm assessments by subscription" />
                </>
              ) : (
                <p className="empty-state">No data pulled for Defender assessment posture.</p>
              )}

              {cspm.assessment_summary.top_findings.length > 0 ? (
                <>
                  <h4>Top unhealthy assessments</h4>
                  <DataTable data={cspm.assessment_summary.top_findings} columns={cspmAssessmentFindingColumns} exportFileName="cspm top findings" />
                </>
              ) : (
                <p className="section-note">No data pulled for top unhealthy assessment detail.</p>
              )}

              {cspm.attack_path_summary.by_subscription.length > 0 ? (
                <>
                  <h4>Attack paths by subscription</h4>
                  <DataTable data={cspm.attack_path_summary.by_subscription} columns={cspmAttackPathSubColumns} exportFileName="attack paths by subscription" />
                </>
              ) : (
                <p className="section-note">No data pulled for attack-path counts by subscription.</p>
              )}

              {cspm.attack_path_summary.top_paths.length > 0 ? (
                <>
                  <h4>Top attack paths</h4>
                  <DataTable data={cspm.attack_path_summary.top_paths} columns={cspmAttackPathColumns} exportFileName="top attack paths" />
                </>
              ) : (
                <p className="section-note">No data pulled for attack-path detail records.</p>
              )}
            </div>

            <div className="security-sub-section">
              <h4>3. Signals with no data pulled yet</h4>
              <p className="section-note">
                The following CSPM areas are not yet collected in Cloud Assessment Workbench. Each one is also written into the Data gaps
                module so it remains visible in the wider assessment workflow.
              </p>
              <DataTable data={cspm.unavailable_signals} columns={unavailableSignalColumns} exportFileName="unavailable cspm signals" />
            </div>
          </>
        ) : cspmInsights.status === 'error' ? (
          <p className="error-text">Failed to load CSPM insights: {cspmInsights.error}</p>
        ) : (
          <p className="loading-text">Loading CSPM insights…</p>
        )}
      </section>
    </PageLayout>
  );
}
