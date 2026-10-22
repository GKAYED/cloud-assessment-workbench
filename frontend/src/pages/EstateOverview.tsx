/**
 * EstateOverview.tsx — Azure estate command centre.
 *
 * Answers three questions at a glance:
 *   1. What do you have?   → Azure Inventory panel
 *   2. What does it cost?  → Azure Cost panel
 *   3. How healthy is it?  → Posture & Compliance panel
 *
 * Five critical highlights surface the most actionable signals from across
 * the estate — tagging gaps, cost trends, security posture, orphaned
 * resources and policy compliance.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { useModuleData } from '../hooks/useModuleData';
import { inventoryApi } from '../api/inventory';
import { costsApi } from '../api/costs';
import { securityApi } from '../api/security';
import { governanceApi } from '../api/governance';
import { frameworkApi } from '../api/framework';
import type { FrameworkInsightsResponse } from '../api/framework';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { formatCurrency, formatCompact } from '../utils/formatters';
import { normalizeResourceTypeName } from '../utils/resourceNaming';
import type {
  InventorySummary,
  CostSummary,
  CostRollup,
  DefenderScoreResponse,
  AdvisorScoresResponse,
  PolicyComplianceResponse,
  OrphanedResourcesResponse,
  RoleAssignmentsResponse,
} from '../types';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  DollarSign,
  Layers,
  Minus,
  ShieldCheck,
  Tag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../components/ui/button';

// ── Design tokens (page-exclusive) ───────────────────────────────────────────
const BLUE    = '#60a5fa';
const AMBER   = '#fbbf24';
const EMERALD = '#34d399';
const RED     = '#f87171';

// ── ScoreRing ─────────────────────────────────────────────────────────────────
/** SVG arc ring that shows a 0-100% score with a centred number label. */
function ScoreRing({
  pct,
  color,
  label,
  size = 82,
}: {
  pct: number;
  color: string;
  label: string;
  size?: number;
}) {
  const r        = size / 2 - 8;
  const circ     = 2 * Math.PI * r;
  const safePct  = Math.min(100, Math.max(0, pct));
  const filled   = (safePct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="absolute inset-0"
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden="true"
        >
          {/* track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={7}
            className="opacity-10"
          />
          {/* fill */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-[20px] font-bold tabular-nums leading-none"
            style={{ color }}
          >
            {`${Math.round(safePct)}%`}
          </span>
        </div>
      </div>
      <span className="text-[14px] uppercase tracking-widest text-center leading-tight opacity-55">
        {label}
      </span>
    </div>
  );
}

function ScorePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-[82px] w-[82px] items-center justify-center rounded-full border border-dashed border-white/10">
        <span className="text-[20px] font-bold leading-none opacity-45">—</span>
      </div>
      <span className="text-[14px] uppercase tracking-widest text-center leading-tight opacity-55">
        {label}
      </span>
    </div>
  );
}

// ── HBar ──────────────────────────────────────────────────────────────────────
/** Labelled horizontal bar for proportional comparisons. */
function HBar({
  pct,
  color,
  label,
  amount,
}: {
  pct: number;
  color: string;
  label: string;
  amount: string;
}) {
  return (
      <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline text-[1rem]">
        <span className="truncate max-w-[65%] opacity-75">{label}</span>
        <span className="tabular-nums opacity-55 shrink-0 ml-2">{amount}</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(128,128,128,0.15)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// ── StatCell ──────────────────────────────────────────────────────────────────
/** Large number + micro label for key metrics. */
function StatCell({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[1.65rem] font-bold tabular-nums tracking-tight leading-none"
        style={{ color: accent }}
      >
        {value}
      </span>
      <span className="text-[12px] uppercase tracking-wider opacity-45 mt-0.5">
        {label}
      </span>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
/** Framed intelligence panel with a coloured accent and live-pulse dot. */
function Panel({
  accentColor,
  label,
  icon,
  status,
  className = '',
  children,
}: {
  accentColor: string;
  label: string;
  icon: ReactNode;
  status: string;
  className?: string;
  children: ReactNode;
}) {
  const isLoaded = status === 'success';
  const isError = status === 'error';
  return (
    <div
      className={`estate-panel flex flex-col gap-7 rounded-2xl border ${className}`}
      style={{
        borderColor: `${accentColor}22`,
        background: `linear-gradient(150deg, ${accentColor}07 0%, transparent 55%)`,
        padding: '42px 42px 38px',
      }}
    >
      {/* panel header */}
      <div className="flex items-center gap-2">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] opacity-60">
          {label}
        </span>
        {/* live status indicator */}
        <div
          className={`ml-auto h-1.5 w-1.5 rounded-full ${isLoaded ? 'animate-pulse' : ''}`}
          style={{
            backgroundColor: isLoaded ? accentColor : isError ? '#f87171' : 'rgba(255,255,255,0.28)',
          }}
          title={
            isLoaded
              ? 'Data loaded from snapshot'
              : isError
                ? 'Data unavailable'
                : 'Data loading'
          }
        />
      </div>
      {/* divider */}
      <div
        className="h-px opacity-15"
        style={{ backgroundColor: accentColor }}
      />
      {children}
    </div>
  );
}

// ── Highlight card ─────────────────────────────────────────────────────────────
type Severity = 'critical' | 'warning' | 'positive' | 'info';

interface Highlight {
  severity: Severity;
  icon: ReactNode;
  title: string;
  metric: string;
  detail: string;
  href: string;
  cta: string;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: RED,
  warning:  AMBER,
  positive: EMERALD,
  info:     BLUE,
};

function HighlightCard({ h }: { h: Highlight }) {
  const navigate = useNavigate();
  const c        = SEV_COLOR[h.severity];

  return (
    <button
      type="button"
      onClick={() => { void navigate(h.href); }}
      className="estate-highlight-card group relative flex flex-col gap-4 rounded-xl border text-left w-full transition-all duration-200 hover:scale-[1.018] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2"
      style={{
        borderColor:  `${c}28`,
        background:   `${c}07`,
        padding: '28px 30px 26px',
        // ring colour on focus
        '--tw-ring-color': c,
      } as CSSProperties}
    >
      {/* title row */}
      <div className="flex items-center gap-2">
        <span style={{ color: c }}>{h.icon}</span>
        <span className="text-[13px] font-semibold uppercase tracking-wider opacity-55">
          {h.title}
        </span>
      </div>

      {/* metric + detail */}
      <div>
        <div
          className="text-[2.6rem] font-bold tabular-nums leading-none"
          style={{ color: c }}
        >
          {h.metric}
        </div>
        <p className="mt-1.5 text-[1rem] opacity-50 leading-snug">{h.detail}</p>
      </div>

      {/* hover CTA */}
      <div
        className="flex items-center gap-1 text-[1rem] font-medium mt-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ color: c }}
      >
        {h.cta} <ArrowRight size={11} />
      </div>
    </button>
  );
}

// ── EstateOverview (main) ─────────────────────────────────────────────────────
export default function EstateOverview() {
  const navigate = useNavigate();

  // ── Data loads ─────────────────────────────────────────────────────────────
  const invState  = useModuleData<InventorySummary>(
    () => inventoryApi.summary(),
    { cacheKey: MODULE_CACHE_KEYS.inventorySummary },
  );
  const costState = useModuleData<CostSummary>(
    () => costsApi.summary(),
    { cacheKey: MODULE_CACHE_KEYS.costSummary },
  );
  const typeState = useModuleData<CostRollup[]>(
    () => costsApi.byResourceType(),
    { cacheKey: MODULE_CACHE_KEYS.costByResourceType },
  );
  const defState  = useModuleData<DefenderScoreResponse>(
    () => securityApi.defenderScores(),
    { cacheKey: MODULE_CACHE_KEYS.securityDefenderScores },
  );
  const advState  = useModuleData<AdvisorScoresResponse>(
    () => securityApi.advisorScores(),
    { cacheKey: MODULE_CACHE_KEYS.securityAdvisorScores },
  );
  const polState  = useModuleData<PolicyComplianceResponse>(
    () => governanceApi.policyCompliance(),
    { cacheKey: MODULE_CACHE_KEYS.governancePolicyCompliance },
  );
  const orphState = useModuleData<OrphanedResourcesResponse>(
    () => governanceApi.orphanedResources(),
    { cacheKey: MODULE_CACHE_KEYS.governanceOrphanedResources },
  );
  const rbacState = useModuleData<RoleAssignmentsResponse>(
    () => governanceApi.roleAssignments(),
    { cacheKey: MODULE_CACHE_KEYS.governanceRoleAssignments },
  );
  const fwState   = useModuleData<FrameworkInsightsResponse>(
    () => frameworkApi.insights(),
    { cacheKey: MODULE_CACHE_KEYS.frameworkInsights },
  );

  // ── Convenience aliases ────────────────────────────────────────────────────
  const inv         = invState.data;
  const cost        = costState.data;
  const typeRollups = typeState.data ?? [];
  const def         = defState.data;
  const adv         = advState.data;
  const pol         = polState.data;
  const orph        = orphState.data;
  const rbac        = rbacState.data;
  const fw          = fwState.data;
  const defenderHasData = defState.status === 'success' && (def?.scores?.length ?? 0) > 0;
  const advisorHasData = advState.status === 'success' && (adv?.aggregated_scores?.length ?? 0) > 0;
  const frameworkHasData = fwState.status === 'success' && (fw?.scored_pillars_count ?? 0) > 0;
  const policyHasData = polState.status === 'success' && (pol?.by_subscription?.length ?? 0) > 0;
  const inventoryHasData = invState.status === 'success' && inv !== null;
  const costHasData = costState.status === 'success' && cost !== null;
  const orphanHasData = orphState.status === 'success' && orph !== null && (orph.data_gaps?.length ?? 0) === 0;
  const rbacHasData = rbacState.status === 'success' && rbac !== null && (rbac.data_gaps?.length ?? 0) === 0;

  // ── Derived values ─────────────────────────────────────────────────────────
  /** Top 4 inventory types by count */
  const topInvTypes = useMemo(() => {
    if (!inv?.resources_by_type) return [];
    return Object.entries(inv.resources_by_type)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([type, count]) => ({ type, count }));
  }, [inv]);

  /** Top 4 cost types by last-30-day spend */
  const topCostTypes = useMemo(() => {
    if (!typeRollups.length) return [];
    const sorted = [...typeRollups]
      .sort((a, b) => (b.cost_1m ?? 0) - (a.cost_1m ?? 0))
      .slice(0, 4);
    const total = sorted.reduce((s, r) => s + (r.cost_1m ?? 0), 0);
    return sorted.map((r) => ({
      label:  normalizeResourceTypeName(r.resource_type ?? r.group_key ?? ''),
      amount: r.cost_1m ?? 0,
      pct:    total > 0 ? ((r.cost_1m ?? 0) / total) * 100 : 0,
    }));
  }, [typeRollups]);

  /** Advisor health: average percentage across scored pillars */
  const advisorPct = useMemo(() => {
    const scores = adv?.aggregated_scores ?? [];
    const scored = scores.filter((s) => s.max_score > 0);
    if (!scored.length) return 0;
    return scored.reduce((s, r) => s + r.percentage, 0) / scored.length;
  }, [adv]);

  /** Average policy compliance rate across subscriptions */
  const policyCompliance = useMemo((): number | null => {
    const subs = pol?.by_subscription ?? [];
    if (!subs.length) return null;
    const rates = subs
      .map((s) => {
        if (s.compliance_rate !== undefined && s.compliance_rate !== null) {
          return s.compliance_rate;
        }
        if (s.total_resources > 0) {
          return ((s.total_resources - s.non_compliant_resources) / s.total_resources) * 100;
        }
        return null;
      })
      .filter((r): r is number => r !== null);
    return rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
  }, [pol]);

  const defPct      = def?.overall_percentage ?? 0;
  const wafPct      = fw?.waf_overall_score ?? 0;
  const cafMaturity = fw?.caf_average_maturity ?? 0;
  const trendDir    = cost?.overall_trend;
  const trendPct    = cost?.trend_percent;
  const monthly1m   = cost?.total_cost_1m ?? 0;

  // ── Five critical highlights ───────────────────────────────────────────────
  const highlights = useMemo((): Highlight[] => {
    const untaggedPct      = inv?.untagged_percentage ?? 0;
    const controlsAtRisk   = def?.posture_summary?.controls_at_risk ?? 0;
    const orphCount        = orph?.total_count ?? 0;
    const nonComplPolicies = pol?.total_non_compliant_policies ?? 0;
    const nonComplRes      = pol?.total_non_compliant_resources ?? 0;

    // severity helpers
    const tagSev: Severity =
      !inventoryHasData      ? 'info'
      : untaggedPct > 40      ? 'critical'
      : untaggedPct > 15      ? 'warning'
      : 'positive';

    const costSev: Severity =
      !costHasData             ? 'info'
      : trendDir === 'increasing' ? 'warning'
      : trendDir === 'decreasing' ? 'positive'
      : 'info';

    const secSev: Severity =
      !defenderHasData ? 'info'
      : defPct < 55     ? 'critical'
      : defPct < 75     ? 'warning'
      : 'positive';

    const orphSev: Severity =
      !orphanHasData      ? 'info'
      : orphCount > 30    ? 'warning'
      : orphCount > 0     ? 'info'
      : 'positive';

    const polSev: Severity =
      !policyHasData           ? 'info'
      : nonComplPolicies > 10   ? 'critical'
      : nonComplPolicies > 0    ? 'warning'
      : 'positive';

    // cost metric string
    const costMetric =
      !costHasData
        ? '—'
        : trendPct !== undefined && trendPct !== null
        ? `${trendDir === 'increasing' ? '+' : ''}${trendPct.toFixed(1)}% MoM`
        : trendDir === 'increasing' ? '↑ Rising'
        : trendDir === 'decreasing' ? '↓ Falling'
        : trendDir === 'stable'
        ? '— Stable'
        : '—';

    return [
      // 1 – Tag health
      {
        severity: tagSev,
        icon:     <Tag size={14} />,
        title:    'Resource tagging',
        metric:   inventoryHasData ? `${Math.round(untaggedPct)}%` : '—',
        detail:
          inventoryHasData
            ? `${formatCompact(inv?.untagged_count ?? 0)} resources lack tags — impacting cost attribution, chargeback accuracy and governance`
            : 'Tag coverage data not yet available',
        href: '/inventory',
        cta:  'Review inventory',
      },

      // 2 – Cost trend
      {
        severity: costSev,
        icon:
          trendDir === 'increasing' ? <TrendingUp size={14} />
          : trendDir === 'decreasing' ? <TrendingDown size={14} />
          : <Minus size={14} />,
        title:  'Cost trend',
        metric: costMetric,
        detail:
          costHasData
            ? `Last 30 days: ${formatCurrency(monthly1m)} · projected annual run rate ${formatCurrency(monthly1m * 12)}`
            : 'Cost data not yet available',
        href: '/costs',
        cta:  'Analyse costs',
      },

      // 3 – Security posture
      {
        severity: secSev,
        icon:     <ShieldCheck size={14} />,
        title:    'Security posture',
        metric:
          controlsAtRisk > 0 ? `${controlsAtRisk} At risk`
          : defenderHasData  ? `${Math.round(defPct)}%`
          : '—',
        detail:
          controlsAtRisk > 0
            ? `${controlsAtRisk} Defender control area${controlsAtRisk !== 1 ? 's' : ''} contain unhealthy resources · overall secure score ${Math.round(defPct)}%`
            : defenderHasData
            ? `Defender secure score ${Math.round(defPct)}% · open Security Centre for recommended actions`
            : 'Defender data not yet available',
        href: '/security',
        cta:  'Review security',
      },

      // 4 – Orphaned resources
      {
        severity: orphSev,
        icon:     <Layers size={14} />,
        title:    'Orphaned resources',
        metric:   orphanHasData ? formatCompact(orphCount) : '—',
        detail:
          orphanHasData && orphCount > 0
            ? `Unused disks, NICs, public IPs and empty resource groups accumulating cost with no active workload attached`
            : orphanHasData
            ? 'No orphaned resources detected across the estate'
            : 'Governance data not yet available',
        href: '/governance',
        cta:  'View governance',
      },

      // 5 – Policy compliance
      {
        severity: polSev,
        icon:
          nonComplPolicies > 0
            ? <AlertTriangle size={14} />
            : <CheckCircle2  size={14} />,
        title:  'Policy compliance',
        metric: policyHasData ? formatCompact(nonComplRes) : '—',
        detail:
          policyHasData
            ? `${formatCompact(nonComplRes)} non-compliant resource${nonComplRes !== 1 ? 's' : ''} across ${nonComplPolicies} policy assignment${nonComplPolicies !== 1 ? 's' : ''}`
            : 'Policy compliance data not yet available',
        href: '/governance',
        cta:  'View policies',
      },
    ];
  }, [inventoryHasData, costHasData, defenderHasData, advisorHasData, frameworkHasData, policyHasData, orphanHasData, rbacHasData, inv, cost, monthly1m, trendDir, trendPct, def, defPct, orph, pol]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PageLayout
      title="Estate Overview"
      subtitle="Azure estate at a glance: Inventory, cost and posture"
    >
      <div className="estate-overview-page flex flex-col gap-6">

        {/* ── Three intelligence panels ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── INVENTORY ─────────────────────────────────────────────── */}
          <Panel accentColor={BLUE} label="Azure Inventory" icon={<Database size={14} />} status={invState.status}>

            {/* headline stats 2×2 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <StatCell
                value={inventoryHasData ? formatCompact(inv?.total_subscriptions ?? 0) : '—'}
                label="Subscriptions"
                accent={BLUE}
              />
              <StatCell
                value={inventoryHasData ? formatCompact(inv?.total_resource_groups ?? 0) : '—'}
                label="Resource groups"
                accent={BLUE}
              />
              <StatCell
                value={inventoryHasData ? formatCompact(inv?.total_resources ?? 0) : '—'}
                label="Resources"
                accent={BLUE}
              />
              <StatCell
                value={
                  inventoryHasData
                    ? formatCompact(Object.keys(inv?.resources_by_location ?? {}).length)
                    : '—'
                }
                label="Locations"
                accent={BLUE}
              />
            </div>

            {/* top resource types */}
            {inventoryHasData && topInvTypes.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="text-[13px] uppercase tracking-widest opacity-40">
                  Top resource types
                </span>
                {topInvTypes.map(({ type, count }) => (
                  <HBar
                    key={type}
                    label={normalizeResourceTypeName(type)}
                    amount={formatCompact(count)}
                    pct={inv && inv.total_resources > 0 ? (count / inv.total_resources) * 100 : 0}
                    color={BLUE}
                  />
                ))}
              </div>
            )}

            {/* tag coverage bar */}
            {inventoryHasData && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[1rem]">
                  <span className="opacity-55">Tag coverage</span>
                  <span
                    className="tabular-nums font-semibold"
                    style={{ color: (inv?.untagged_percentage ?? 0) > 30 ? AMBER : BLUE }}
                  >
                    {Math.round(100 - (inv?.untagged_percentage ?? 0))}%
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'rgba(128,128,128,0.15)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, 100 - (inv?.untagged_percentage ?? 0))}%`,
                      backgroundColor: (inv?.untagged_percentage ?? 0) > 30 ? AMBER : BLUE,
                    }}
                  />
                </div>
                {(inv?.untagged_count ?? 0) > 0 && (
                  <span className="text-[13px] opacity-40">
                    {formatCompact(inv?.untagged_count ?? 0)} resources untagged
                  </span>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-[1rem] mt-auto"
              style={{ color: BLUE }}
              onClick={() => { void navigate('/inventory'); }}
            >
              View full inventory <ArrowRight size={12} />
            </Button>
          </Panel>

          {/* ── COST ──────────────────────────────────────────────────── */}
          <Panel accentColor={AMBER} label="Azure Cost" icon={<DollarSign size={14} />} status={costState.status}>

            {/* hero spend number */}
            <div className="flex flex-col items-center gap-1.5 py-2">
              <span
                className="text-[2.5rem] font-bold tabular-nums tracking-tight leading-none"
                style={{ color: AMBER }}
              >
                {costHasData ? formatCurrency(monthly1m) : '—'}
              </span>
              <span className="text-[12px] opacity-45 uppercase tracking-wider">Last 30 days</span>

              {/* trend indicator */}
              {costHasData && trendDir !== undefined && (
                <div className="flex items-center gap-1.5 mt-1">
                  {trendDir === 'increasing' ? (
                    <TrendingUp size={13} style={{ color: RED }} />
                  ) : trendDir === 'decreasing' ? (
                    <TrendingDown size={13} style={{ color: EMERALD }} />
                  ) : (
                    <Minus size={13} className="opacity-35" />
                  )}
                  <span
                    className="text-[1rem] font-medium"
                    style={{
                      color:
                        trendDir === 'increasing' ? RED
                        : trendDir === 'decreasing' ? EMERALD
                        : undefined,
                    }}
                  >
                    {trendPct !== undefined && trendPct !== null
                      ? `${trendDir === 'increasing' ? '+' : ''}${trendPct.toFixed(1)}% MoM`
                      : trendDir}
                  </span>
                </div>
              )}
            </div>

            {/* run rate + 90-day cards */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div
                className="rounded-xl border p-3"
                style={{ borderColor: `${AMBER}20` }}
              >
                <div className="text-[1.1rem] font-bold tabular-nums" style={{ color: AMBER }}>
                  {costHasData ? formatCurrency(monthly1m * 12) : '—'}
                </div>
                <div className="text-[12px] opacity-40 uppercase tracking-wider mt-0.5">
                  Annual run rate
                </div>
              </div>
              <div
                className="rounded-xl border p-3"
                style={{ borderColor: `${AMBER}20` }}
              >
                <div className="text-[1.1rem] font-bold tabular-nums" style={{ color: AMBER }}>
                  {costHasData ? formatCurrency(cost?.total_cost_3m ?? 0) : '—'}
                </div>
                <div className="text-[12px] opacity-40 uppercase tracking-wider mt-0.5">
                  Last 90 days
                </div>
              </div>
            </div>

            {/* spend by type */}
            {costHasData && topCostTypes.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="text-[12px] uppercase tracking-widest opacity-40">
                  Spend by resource type
                </span>
                {topCostTypes.map(({ label, amount, pct }) => (
                  <HBar
                    key={label}
                    label={label}
                    amount={formatCurrency(amount)}
                    pct={pct}
                    color={AMBER}
                  />
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs mt-auto"
              style={{ color: AMBER }}
              onClick={() => { void navigate('/costs'); }}
            >
              Full cost analysis <ArrowRight size={12} />
            </Button>
          </Panel>

          {/* ── POSTURE ───────────────────────────────────────────────── */}
          <Panel
            accentColor={EMERALD}
            label="Posture & Compliance"
            icon={<ShieldCheck size={14} />}
            status={
              [defState.status, advState.status, fwState.status, polState.status, orphState.status, rbacState.status].every((value) => value === 'success')
                ? 'success'
                : [defState.status, advState.status, fwState.status, polState.status, orphState.status, rbacState.status].some((value) => value === 'error')
                ? 'error'
                : 'loading'
            }
          >
            {/* three score rings */}
            <div className="grid grid-cols-3 gap-2 justify-items-center py-1">
              {defenderHasData ? (
                <ScoreRing
                  pct={defPct}
                  color={defPct >= 80 ? EMERALD : defPct >= 60 ? AMBER : RED}
                  label="Secure score"
                />
              ) : (
                <ScorePlaceholder label="Secure score" />
              )}
              {advisorHasData ? (
                <ScoreRing
                  pct={advisorPct}
                  color={
                    advisorPct >= 80 ? EMERALD
                    : advisorPct >= 60 ? AMBER
                    : RED
                  }
                  label="Advisor"
                />
              ) : (
                <ScorePlaceholder label="Advisor" />
              )}
              {frameworkHasData ? (
                <ScoreRing
                  pct={wafPct}
                  color={wafPct >= 70 ? EMERALD : wafPct >= 50 ? AMBER : RED}
                  label="WAF"
                />
              ) : (
                <ScorePlaceholder label="WAF" />
              )}
            </div>

            {/* policy compliance bar */}
            {policyCompliance !== null && (
              <HBar
                label="Policy compliance"
                amount={`${Math.round(policyCompliance)}%`}
                pct={policyCompliance}
                color={
                  policyCompliance >= 90 ? EMERALD
                  : policyCompliance >= 70 ? AMBER
                  : RED
                }
              />
            )}

            {/* supplemental KV rows */}
            <div className="flex flex-col">
              {([
                {
                  label: 'CAF maturity average',
                  value: cafMaturity > 0 ? `${cafMaturity.toFixed(1)} / 5` : '—',
                  color: cafMaturity >= 3 ? EMERALD : cafMaturity >= 2 ? AMBER : RED,
                },
                {
                  label: 'Owner role assignments',
                  value: rbacHasData ? String(rbac.owner_count) : '—',
                  color: rbacHasData && rbac.owner_count > 0 ? AMBER : EMERALD,
                },
                {
                  label: 'Orphaned resources',
                  value: orphanHasData && orph !== null ? formatCompact(orph.total_count) : '—',
                  color: orphanHasData && (orph?.total_count ?? 0) > 20 ? AMBER : EMERALD,
                },
                {
                  label: 'Policy violations',
                  value:
                    policyHasData && pol?.total_non_compliant_resources !== undefined
                      ? formatCompact(pol.total_non_compliant_resources)
                      : '—',
                  color: policyHasData && (pol?.total_non_compliant_resources ?? 0) > 0 ? AMBER : EMERALD,
                },
              ] as { label: string; value: string; color: string }[]).map(({ label, value, color }) => (
                <div
                  key={label}
                  className="flex justify-between items-center text-[1rem] py-2.5 border-b last:border-0"
                  style={{ borderColor: `${EMERALD}12` }}
                >
                  <span className="opacity-55">{label}</span>
                  <span className="tabular-nums font-semibold" style={{ color }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-[1rem] mt-auto"
              style={{ color: EMERALD }}
              onClick={() => { void navigate('/security'); }}
            >
              View security & posture <ArrowRight size={12} />
            </Button>
          </Panel>
        </div>

        {/* ── Critical highlights ──────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={13} className="opacity-35" />
            <span className="text-[13px] uppercase tracking-[0.18em] opacity-35 font-medium">
              Critical highlights
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {highlights.map((h) => (
              <HighlightCard key={`${h.href}:${h.title}`} h={h} />
            ))}
          </div>
        </div>

      </div>
    </PageLayout>
  );
}
