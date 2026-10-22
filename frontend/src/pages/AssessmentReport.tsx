/**
 * AssessmentReport.tsx — Auto-generated executive assessment report.
 *
 * Pulls data from every active module in the platform, generates narrative
 * descriptions, full data tables, and actionable insights. Designed as a
 * draft document an executive can read, annotate, and share.
 */

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout';
import { useModuleData } from '../hooks/useModuleData';
import { useProfile } from '../hooks/useProfile';
import { usePdfExport } from '../hooks/usePdfExport';
import { useWordExport } from '../hooks/useWordExport';
import { reportSettingsApi } from '../api/reportSettings';
import { downloadCsv, downloadCsvBundle, type CsvRow } from '../utils/csv';
import { CostTrendChart } from '../components/charts/CostTrendChart';
import { CostBarChart } from '../components/charts/CostBarChart';
import { AdvisorRadar } from '../components/charts/AdvisorRadar';
import { LicenseUsageChart } from '../components/charts/LicenseUsageChart';
import { ChartCard } from '../components/shared/ChartCard';
import { SectionNav } from '../components/shared/SectionNav';
import { InitiativesRoadmap } from '../components/InitiativesRoadmap';
import { ExecutiveSummaryContent } from '../components/report/assessment/ExecutiveSummaryContent';
import { SectionHeading } from '../components/report/assessment/SectionHeading';
import { FrameworkFuturePhaseOpportunities } from '../components/report/assessment/FrameworkFuturePhaseOpportunities';
import {
  AZURE_INVENTORY_COST_PRIMER,
  DYNAMICS_PLATFORM_PRIMER,
  SECURITY_COMPLIANCE_PRIMER,
} from '../components/report/assessment/reportPrimerContent';
import { ReportPrimer } from '../components/report/assessment/ReportPrimer';
import { profilesApi } from '../api/profiles';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

/* ── API clients ───────────────────────────────────────────────── */
import { costsApi } from '../api/costs';
import { securityApi } from '../api/security';
import { insightsApi } from '../api/insights';
import { inventoryApi } from '../api/inventory';
import { integrationsApi } from '../api/integrations';
import { dynamicsApi } from '../api/dynamics';
import { dynamicsContextApi } from '../api/dynamicsContext';
import { licensesApi } from '../api/licenses';
import { portfolioApi } from '../api/portfolio';
import { challengesApi } from '../api/challenges';
import { initiativesApi } from '../api/initiatives';
import { recommendationsApi } from '../api/recommendations';
import { stakeholdersApi } from '../api/stakeholders';
import { dataGapsApi } from '../api/dataGaps';
import {
  frameworkApi,
  type FrameworkInsightsResponse,
  type MethodologyManualRatings,
} from '../api/framework';
import { governanceApi } from '../api/governance';
import { organizationApi } from '../api/organization';
import { applicationDiscoveryApi } from '../api/applicationDiscovery';
import { integrationReviewApi } from '../api/integrationReview';

/* ── Utilities ─────────────────────────────────────────────────── */
import { formatCurrency, formatPercent, titleCase, formatDate } from '../utils/formatters';
import { normalizeResourceTypeName } from '../utils/resourceNaming';
import { tailorPresentationText, tailoringGuidance } from '../utils/organizationTailoring';
import { getEnrichedCafSignals } from '../utils/cafSignals';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { buildResourceGroupApplicationProfile } from '../utils/applicationDiscovery';
import { wafRefLink } from '../reporting/frameworkReferenceLinks';
import {
  buildCostExportRows,
  buildSubscriptionNameMap,
} from '../reporting/costShaping';
import {
  advisorResourceDisplay,
  looksLikeId,
  nameFromResourceId,
  readablePillar,
  replaceSubscriptionIdsInText,
  resolveSubscriptionName,
  shortType,
} from '../reporting/reportShaping';
import { deriveManualMethodology } from '../reporting/cafMaturityShaping';
import {
  narrativeChallenges,
  narrativeRecommendations,
  summarizeChallengeThemes,
  summarizeRecommendationThemes,
} from '../reporting/recommendationChallengeShaping';
import {
  buildDefaultReportAppendix,
  buildDefaultReportVisibility,
  REPORT_SETTINGS_CHANGED_EVENT,
  REPORT_VISIBILITY_ITEMS,
  type ReportReleaseMode,
  type ReportVisibilityId,
  type TopLevelReportSectionId,
} from '../reportSettings';

/* ── Types ─────────────────────────────────────────────────────── */
import type {
  CostSummary, CostRollup, CostRecord,
  DefenderScoreResponse, AdvisorScoresResponse, AdvisorRecommendation,
  CspmInsightsResponse,
  ExecutiveInsight,
  InventorySummary, Subscription, ResourceGroup, Resource, DatabaseOverview,
  IntegrationSummary, IntegrationPoint, IntegrationRecommendation,
  IntegrationReviewRecord,
  D365Environment, D365User, D365ModuleStats, D365WorkflowHealth, D365BCStats,
  LicenseSummary, LicenseSKU, UserLicense,
  AppPortfolioEntry, Challenge, Initiative, Recommendation, StakeholderNote, DataGap,
  PolicyComplianceResponse, PolicySubscription, RoleAssignmentsResponse, OrphanedResourcesResponse,
  OrganizationContext,
  ApplicationDiscoveryAnnotation,
  DynamicsManualContext,
} from '../types';

type InventoryValidationSummary = {
  azure_subscriptions: number;
  azure_resource_groups: number;
  azure_resources: number;
  snapshot_subscriptions: number;
  snapshot_resource_groups: number;
  snapshot_resources: number;
  extra_resource_groups: string[];
  extra_resource_type_breakdown: Array<{ type: string; count: number }>;
};

type InventoryValidationData = {
  summary?: InventoryValidationSummary | null;
  extra_resources?: CsvRow[];
};

/* ═══════════════════════════════════════════════════════════════════
   Local helpers
   ═══════════════════════════════════════════════════════════════════ */

/** Trend arrow helper */
function trendIcon(trend?: string): string {
  if (trend === 'increasing') return '▲';
  if (trend === 'decreasing') return '▼';
  return '—';
}

/** Severity badge class */
function sevClass(sev: string): string {
  switch (sev) {
    case 'critical': return 'rpt-badge rpt-badge--critical';
    case 'high': return 'rpt-badge rpt-badge--high';
    case 'medium': return 'rpt-badge rpt-badge--medium';
    case 'low': return 'rpt-badge rpt-badge--low';
    default: return 'rpt-badge';
  }
}

/** Simple pluraliser */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const ADVISOR_REPORT_PILLARS = [
  'Security',
  'Reliability',
  'Cost',
  'Operational Excellence',
  'Performance Efficiency',
] as const;

/** Safe lowercase for mixed API values */
function lowerSafe(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : String(value ?? '').toLowerCase();
}


function policyNamesForSubscription(policyRow: PolicySubscription): string {
  const names = Array.from(
    new Set(
      (policyRow.top_non_compliant ?? [])
        .map((item) => (item.policy_name ?? '').trim())
        .filter(Boolean),
    ),
  );
  return names.length > 0 ? names.join(', ') : '—';
}

function discoveryGroupKey(subscriptionId: string, resourceGroup: string): string {
  return `${subscriptionId.trim()}::${resourceGroup.trim().toLowerCase()}`;
}

function normalizeResourceGroupName(raw: string): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (value.includes('::')) {
    const [, groupPart = value] = value.split('::');
    return normalizeResourceGroupName(groupPart);
  }
  const rgMatch = value.match(/\/resourceGroups\/([^/]+)/i);
  if (rgMatch?.[1]) return rgMatch[1];
  if (/^(unknown|n\/a|na|null|none|unattributed charges?)$/i.test(value)) return '';
  return value;
}

function firstSentence(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const match = text.match(/^(.+?[.!?])(\s|$)/);
  return match?.[1] ?? text;
}

function ReportCsvButton({
  label,
  fileName,
  rows,
  compact = false,
}: {
  label: string;
  fileName: string;
  rows: CsvRow[];
  compact?: boolean;
}) {
  if (!rows.length) return null;
  const resolvedLabel = label === 'Export CSV' ? 'Export Excel' : label;
  return (
    <button
      type="button"
      className={`rpt-csv-btn${compact ? ' rpt-csv-btn--compact' : ''}`}
      onClick={() => downloadCsv(fileName, rows)}
    >
      <Download size={14} />
      {resolvedLabel}
    </button>
  );
}

function ReportCsvGroup({
  title,
  description,
  actions,
  onExportAll,
}: {
  title: string;
  description: string;
  actions: Array<{ label: string; fileName: string; rows: CsvRow[] }>;
  onExportAll: () => void;
}) {
  const available = actions.filter((item) => item.rows.length > 0);
  if (!available.length) return null;
  return (
    <div className="rpt-export-card">
      <div className="rpt-export-card__header">
        <div>
          <h3 className="rpt-export-card__title">{title}</h3>
          <p className="rpt-export-card__desc">{description}</p>
        </div>
        <button type="button" className="rpt-csv-btn" onClick={onExportAll}>
          <Download size={14} />
          Export all
        </button>
      </div>
      <div className="rpt-export-card__actions">
        {available.map((item) => (
          <ReportCsvButton
            key={item.fileName}
            label={item.label}
            fileName={item.fileName}
            rows={item.rows}
          />
        ))}
      </div>
    </div>
  );
}

function ReportAppendixTable({ rows }: { rows: CsvRow[] }) {
  if (!rows.length) return <p className="rpt-empty">No appendix data available for this subsection.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <>
    <p className="rpt-table-meta">{rows.length} rows</p>
    <table className="rpt-table rpt-table--compact">
      <thead>
        <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {columns.map((column) => <td key={column}>{String(row[column] ?? '—')}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Narrative generators — produce executive text from raw data
   ═══════════════════════════════════════════════════════════════════ */

function narrativeInventory(inv: InventorySummary | null, subs: Subscription[] | null, dbs: DatabaseOverview[] | null): string {
  if (!inv) return 'Inventory data is not yet available.';
  const parts: string[] = [];
  parts.push(`The Azure estate comprises ${plural(inv.total_subscriptions, 'subscription')}, ${plural(inv.total_resource_groups, 'resource group')}, and ${plural(inv.total_resources, 'deployed resource')}.`);
  if (inv.untagged_count > 0) {
    parts.push(`${plural(inv.untagged_count, 'resource')} (${formatPercent(inv.untagged_percentage, 0)}) lack tags, which limits cost attribution and operational tracing.`);
  }
  const topTypes = Object.entries(inv.resources_by_type ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topTypes.length > 0) {
    parts.push(`The dominant resource types are ${topTypes.map(([t, c]) => `${shortType(t)} (${c})`).join(', ')}.`);
  }
  if (dbs && dbs.length > 0) {
    parts.push(`${plural(dbs.length, 'database')} have been identified across the estate.`);
  }
  if (subs && subs.length > 0) {
    const activeSubs = subs.filter(s => lowerSafe(s.state) === 'enabled');
    if (activeSubs.length < subs.length) {
      parts.push(`Of the subscriptions, ${activeSubs.length} are active and ${subs.length - activeSubs.length} are in a non-active state.`);
    }
  }
  return parts.join(' ');
}

function narrativeSecurity(defender: DefenderScoreResponse | null, advisor: AdvisorScoresResponse | null, recs: AdvisorRecommendation[] | null): string {
  const parts: string[] = [];
  if (defender) {
    parts.push(`The organisation's Microsoft Defender Secure Score is ${formatPercent(defender.overall_percentage, 0)} (${defender.overall_current.toFixed(0)} / ${defender.overall_max.toFixed(0)}).`);
    if (defender.posture_summary) {
      const ps = defender.posture_summary;
      parts.push(`Of ${ps.total_controls} security controls, ${ps.total_healthy} are healthy, ${ps.total_unhealthy} are unhealthy, and ${ps.controls_at_risk} are at risk.`);
    }
  }
  if (advisor && advisor.aggregated_scores.length > 0) {
    const valid = advisor.aggregated_scores.filter(a => !looksLikeId(a.pillar));
    const lowest = [...valid].sort((a, b) => a.percentage - b.percentage)[0];
    if (lowest) parts.push(`The weakest Azure Advisor pillar is ${readablePillar(lowest.pillar)} at ${formatPercent(lowest.percentage, 0)}.`);
  }
  if (recs && recs.length > 0) {
    const highCount = recs.filter(r => r.impact === 'High').length;
    parts.push(`There are ${plural(recs.length, 'recommendation')} from Azure Advisor${highCount > 0 ? `, including ${highCount} high-impact items` : ''}.`);
  }
  if (parts.length === 0) return 'Security data is not yet available.';
  return parts.join(' ');
}

function narrativeGovernance(policy: PolicyComplianceResponse | null, rbac: RoleAssignmentsResponse | null, orphans: OrphanedResourcesResponse | null): string {
  const parts: string[] = [];
  if (policy) {
    parts.push(`Policy compliance monitoring covers ${plural(policy.subscription_count, 'subscription')} with ${plural(policy.total_policy_assignments, 'policy assignment')}.`);
    if (policy.total_non_compliant_resources > 0) {
      parts.push(`${plural(policy.total_non_compliant_resources, 'resource')} are currently non-compliant across ${plural(policy.total_non_compliant_policies, 'policy')}.`);
    } else {
      parts.push('All monitored resources are compliant with assigned policies.');
    }
  }
  if (rbac) {
    parts.push(`There are ${plural(rbac.total_count, 'role assignment')} across the estate, with ${plural(rbac.owner_count, 'Owner-level assignment')} and ${plural(rbac.contributor_count, 'Contributor-level assignment')}.`);
  }
  if (orphans && orphans.total_count > 0) {
    parts.push(`${plural(orphans.total_count, 'orphaned resource')} have been identified. These are resources with no active association and may represent unnecessary cost.`);
  }
  if (parts.length === 0) return 'Governance data is not yet available.';
  return parts.join(' ');
}

function narrativeIntegrations(summary: IntegrationSummary | null, list: IntegrationPoint[] | null): string {
  if (!summary) return 'Integration data is not yet available.';
  const parts: string[] = [];
  parts.push(`The integration landscape contains ${plural(summary.total_integrations, 'integration point')}.`);
  if (summary.deprecated_count > 0) {
    parts.push(`${plural(summary.deprecated_count, 'integration')} involve deprecated systems and should be assessed for migration.`);
  }
  if (summary.health_measured) {
    const statusParts: string[] = [];
    if (summary.healthy) statusParts.push(`${summary.healthy} healthy`);
    if (summary.degraded) statusParts.push(`${summary.degraded} degraded`);
    if (summary.failing) statusParts.push(`${summary.failing} failing`);
    if (statusParts.length > 0) parts.push(`Health status: ${statusParts.join(', ')}.`);
  }
  if (list && list.length > 0) {
    const types = new Set(list.map(i => i.integration_type));
    parts.push(`Integration types observed include ${[...types].slice(0, 5).join(', ')}.`);
  }
  return parts.join(' ');
}

function narrativeDynamics(envs: D365Environment[] | null, users: D365User[] | null, bc: D365BCStats[] | null): string {
  const parts: string[] = [];
  if (envs && envs.length > 0) {
    const running = envs.filter((e) => {
      const state = lowerSafe(e.state);
      return state === 'running' || state === 'active' || state === 'enabled';
    }).length;
    parts.push(`${plural(envs.length, 'Dynamics 365 environment')} discovered, ${running} active.`);
    const totalDbMb = envs.reduce((sum, e) => sum + (e.database_capacity_used_mb ?? 0), 0);
    if (totalDbMb > 0) parts.push(`Combined database usage is ${(totalDbMb / 1024).toFixed(1)} GB.`);
  }
  if (users && users.length > 0) {
    const active = users.filter(u => !u.is_disabled).length;
    const inactive30d = users.filter(u => u.is_active_30d === false).length;
    parts.push(`${plural(users.length, 'user')} are provisioned (${active} enabled).`);
    if (inactive30d > 0) parts.push(`${inactive30d} users have been inactive for 30+ days.`);
  }
  if (bc && bc.length > 0) {
    parts.push(`Business Central data is present across ${plural(bc.length, 'company')}.`);
  }
  if (parts.length === 0) return 'Dynamics 365 data is not yet available.';
  return parts.join(' ');
}

function narrativeLicenses(summary: LicenseSummary | null): string {
  if (!summary) return 'License data is not yet available.';
  const parts: string[] = [];
  parts.push(`The tenant has ${plural(summary.total_skus, 'license SKU')} with ${summary.total_purchased?.toLocaleString()} purchased seats and ${summary.total_consumed?.toLocaleString()} consumed (${formatPercent(summary.overall_utilization_pct, 0)} utilisation).`);
  if (summary.total_available > 0) {
    parts.push(`${plural(summary.total_available, 'seat')} are currently unassigned.`);
  }
  if (summary.estimated_waste_monthly != null && summary.estimated_waste_monthly > 0) {
    parts.push(`Estimated license waste is ${formatCurrency(summary.estimated_waste_monthly)}/month based on inactive or underutilised assignments.`);
  }
  if (summary.underutilized_skus.length > 0) {
    parts.push(`${plural(summary.underutilized_skus.length, 'SKU')} are flagged as underutilised.`);
  }
  return parts.join(' ');
}

function narrativeFramework(fw: FrameworkInsightsResponse | null): string {
  if (!fw) return 'Framework alignment data is not yet available.';
  const parts: string[] = [];
  parts.push(`The overall Well-Architected Framework (WAF) score is ${formatPercent(fw.waf_overall_score, 0)}, and the Cloud Adoption Framework (CAF) average maturity is ${fw.caf_average_maturity.toFixed(1)} / 5.`);
  const pillars = Object.values(fw.waf_pillars);
  if (pillars.length > 0) {
    const weakest = [...pillars].sort((a, b) => a.score - b.score)[0];
    const strongest = [...pillars].sort((a, b) => b.score - a.score)[0];
    if (weakest && strongest && weakest.code !== strongest.code) {
      parts.push(`The strongest pillar is ${strongest.name} (${formatPercent(strongest.score, 0)}), while ${weakest.name} (${formatPercent(weakest.score, 0)}) presents the greatest improvement opportunity.`);
    }
  }
  if (fw.phase2_count > 0) {
    parts.push(`${plural(fw.phase2_count, 'Phase 2 opportunity')} have been identified for deeper assessment.`);
  }
  return parts.join(' ');
}

function interpretInventorySection(inv: InventorySummary | null, groups: ResourceGroup[] | null, resources: Resource[] | null): string {
  if (!inv) return 'This section interprets the current Azure inventory baseline using the latest saved snapshot.';
  const largeGroups = (groups ?? [])
    .map((group) => ({ name: group.name, count: group.resource_count ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((item) => item.count > 0);
  const locationCount = new Set((resources ?? []).map((row) => row.location).filter(Boolean)).size;
  const parts = [
    `The current inventory establishes the baseline footprint of the Azure estate across ${inv.total_subscriptions} subscriptions and ${inv.total_resource_groups} resource groups.`,
    largeGroups.length > 0
      ? `Resource concentration is led by ${largeGroups.map((item) => `${item.name} (${item.count})`).join(', ')}, which helps show where operational load is likely to be clustered.`
      : 'The footprint is spread across multiple resource groups rather than being concentrated into one dominant landing zone.',
    `Resources are currently spread across ${locationCount || 0} Azure location${locationCount === 1 ? '' : 's'}, and tagging coverage should be read as a direct indicator of ownership and chargeback readiness.`,
  ];
  return parts.join(' ');
}

function interpretCostSection(summary: CostSummary | null, bySub: CostRollup[] | null, byType: CostRollup[] | null, subscriptionNames: Map<string, string>): string {
  if (!summary) return 'This section interprets the current Azure cost picture from the saved assessment snapshot.';
  const topSub = [...(bySub ?? [])].sort((a, b) => b.cost_1m - a.cost_1m)[0];
  const topTypes = [...(byType ?? [])].sort((a, b) => b.cost_1m - a.cost_1m).slice(0, 2);
  const parts = [
    'This section shows where Azure spend is concentrated, whether that spend is stabilising or drifting, and which parts of the estate warrant the strongest optimisation focus.',
    topSub
      ? `The current run rate is led by ${resolveSubscriptionName(topSub.subscription_name, topSub.group_key, subscriptionNames)}, which indicates where budget pressure and accountability are most likely to sit.`
      : 'Subscription-level cost concentration is still being established from the saved dataset.',
    topTypes.length > 0
      ? `Service-level spend is currently dominated by ${topTypes.map((item) => `${item.group_key} (${formatCurrency(item.cost_1m)})`).join(' and ')}, which helps distinguish structural platform costs from local workload inefficiencies.`
      : 'Resource-type mix should be used to separate structural platform costs from local workload inefficiencies.',
  ];
  return parts.join(' ');
}

function interpretSecuritySection(defender: DefenderScoreResponse | null, advisor: AdvisorScoresResponse | null, cspm: CspmInsightsResponse | null): string {
  const securePct = defender?.overall_percentage;
  const unhealthy = cspm?.assessment_summary.totals?.unhealthy ?? 0;
  const attackPaths = cspm?.attack_path_summary.totals?.total ?? 0;
  const weakest = advisor?.aggregated_scores?.filter((a) => !looksLikeId(a.pillar)).sort((a, b) => a.percentage - b.percentage)[0];
  const parts = [
    'This section should be read as the current security posture baseline rather than a complete measure of every control domain in the environment.',
    securePct != null
      ? `Defender secure score indicates the current broad posture level, while control health and recommendation volume help explain where the score is being dragged down.`
      : 'Security posture is partially visible, so low evidence should not be mistaken for low risk.',
    weakest
      ? `Azure Advisor currently points to ${readablePillar(weakest.pillar)} as the weakest pillar, which helps focus remediation on the most meaningful posture gaps.`
      : 'Advisor pillar coverage should be used alongside Defender posture to prioritise remediation.',
  ];
  if (unhealthy > 0 || attackPaths > 0) {
    parts.push(`Additional exposure signals currently show ${unhealthy} unhealthy assessment${unhealthy === 1 ? '' : 's'} and ${attackPaths} attack path${attackPaths === 1 ? '' : 's'}, which adds threat context beyond the score alone.`);
  }
  return parts.join(' ');
}

function interpretGovernanceSection(policy: PolicyComplianceResponse | null, rbac: RoleAssignmentsResponse | null, orphans: OrphanedResourcesResponse | null): string {
  const parts = [
    'This section shows whether the Azure estate is operating inside a controlled governance boundary or carrying avoidable policy, access, and hygiene debt.',
  ];
  if (policy) {
    parts.push(policy.total_non_compliant_resources > 0
      ? `Policy non-compliance is visible and should be interpreted as a governance debt backlog, not just a reporting statistic.`
      : 'Policy coverage is in place without currently recorded non-compliance, which suggests a stronger baseline for preventive control.');
  }
  if (rbac) {
    const ownerRatio = rbac.total_count > 0 ? (rbac.owner_count / rbac.total_count) * 100 : 0;
    parts.push(`RBAC assignment volume and owner-role concentration indicate how tightly privileged access is governed; the current owner ratio is ${ownerRatio.toFixed(1)}%.`);
  }
  if (orphans?.total_count) {
    parts.push(`Orphaned resources should be treated as both hygiene debt and potential waste because they often sit outside active ownership and lifecycle controls.`);
  }
  return parts.join(' ');
}

function interpretIntegrationSection(summary: IntegrationSummary | null, list: IntegrationPoint[] | null): string {
  if (!summary) return 'This section interprets the current integration estate and its operational dependency profile.';
  const unresolved = (list ?? []).filter((item) => !item.target_system || item.target_system === 'Unknown target').length;
  return [
    'This section describes how connected the estate is, how much integration dependency exists between platforms, and where the integration model remains ambiguous or operationally fragile.',
    summary.deprecated_count > 0
      ? `${summary.deprecated_count} deprecated integration path${summary.deprecated_count === 1 ? '' : 's'} indicate backlog pressure in the landscape and may point to modernization work that should be sequenced deliberately.`
      : 'No deprecated integration paths are currently highlighted in the saved integration dataset.',
    unresolved > 0
      ? `${unresolved} integration point${unresolved === 1 ? '' : 's'} still have unresolved or weak endpoint context, which means the map should be treated as directionally useful but not fully complete.`
      : 'The currently mapped endpoints provide a workable baseline for integration dependency analysis.',
  ].join(' ');
}

function isProductionLikeEnvironment(env: D365Environment): boolean {
  const text = [
    env.environment_type,
    env.type,
    env.display_name,
    env.name,
    env.domain_name,
    env.state,
    env.status,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return ['production', 'prod', 'prd', 'live', 'primary'].some((token) => text.includes(token));
}

function interpretDynamicsSection(envs: D365Environment[] | null, modules: D365ModuleStats[] | null, workflows: D365WorkflowHealth[] | null, context: DynamicsManualContext | null): string {
  const productionLike = (envs ?? []).filter(isProductionLikeEnvironment).length;
  const moduleCount = modules?.length ?? 0;
  const workflowCount = workflows?.length ?? 0;
  const manualFlags = [
    context?.extra_environments,
    context?.dataverse_capacity_notes,
    context?.dataverse_license_notes,
    context?.dataverse_cost_notes,
  ].filter((value) => (value ?? '').trim().length > 0).length;
  return [
    'This section should be read as a platform-footprint view of Dynamics 365 and Power Platform based on the evidence returned through the current APIs and linked Azure signals.',
    `The current footprint shows ${envs?.length ?? 0} discovered environment${(envs?.length ?? 0) === 1 ? '' : 's'}, including ${productionLike} production-like environment${productionLike === 1 ? '' : 's'}, with ${moduleCount.toLocaleString()} returned solution or module row${moduleCount === 1 ? '' : 's'} and ${workflowCount.toLocaleString()} workflow row${workflowCount === 1 ? '' : 's'}.`,
    manualFlags > 0
      ? `Customer-supplied manual context is also present for ${manualFlags} platform area${manualFlags === 1 ? '' : 's'}, which helps close known API visibility gaps without altering the underlying snapshot evidence.`
      : 'Where permissions or API visibility are incomplete, this footprint should be treated as a useful baseline rather than a full platform census.',
  ].join(' ');
}

function safePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function environmentLabel(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || 'Unknown environment';
}

function buildEnvironmentBreakdown<T>(
  rows: T[] | null | undefined,
  selector: (row: T) => string | null | undefined,
): Array<{ name: string; value: number; pct: number }> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const key = environmentLabel(selector(row));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? safePercent(value, total) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function renderEnvironmentDonutLabel(
  entryLabel: 'users' | 'workflows' | 'solutions',
  fill: string,
  stroke: string,
) {
  return ({
    name,
    value,
    x,
    y,
    textAnchor,
  }: {
    name?: string;
    value?: number;
    x?: number;
    y?: number;
    textAnchor?: 'end' | 'inherit' | 'start' | 'middle';
  }) => {
    if (!name || !value || x == null || y == null) return '';
    return (
      <text
        x={x}
        y={y}
        fill={fill}
        stroke={stroke}
        strokeWidth={3}
        paintOrder="stroke"
        fontSize={12}
        fontWeight={600}
        textAnchor={textAnchor ?? 'middle'}
        dominantBaseline="central"
      >
        {`${name} (${value} ${entryLabel})`}
      </text>
    );
  };
}

function extractFirstNumber(text: string | null | undefined, pattern: RegExp): string | null {
  if (!text) return null;
  const match = text.match(pattern);
  return match?.[1] ?? null;
}

function summarizeEnvironmentMix(text: string | null | undefined): string | null {
  const production = extractFirstNumber(text, /(\d+)\s+(?:Production|Prod|PRD|Live|Primary)/i);
  const sandbox = extractFirstNumber(text, /(\d+)\s+(?:Sandbox|Test|QA)/i);
  const developer = extractFirstNumber(text, /(\d+)\s+(?:Developer|Dev)/i);
  return [
    production ? `${production} production` : null,
    sandbox ? `${sandbox} sandbox` : null,
    developer ? `${developer} developer` : null,
  ].filter((value): value is string => Boolean(value)).join(' • ') || null;
}

function interpretLicenseSection(summary: LicenseSummary | null): string {
  if (!summary) return 'This section interprets current license utilisation, over-allocation risk, and reclaim opportunities.';
  return [
    'This section should be read as a license efficiency and waste review, not just a schedule of purchased and consumed seats.',
    summary.total_available > 0
      ? `${summary.total_available.toLocaleString()} unassigned seat${summary.total_available === 1 ? '' : 's'} show where paid capacity may be sitting idle or held for growth that should be confirmed.`
      : 'Assigned capacity is broadly consumed, so the review focus shifts toward inactive users and SKU mix rather than unused seat inventory.',
    summary.inactive_licensed_users > 0
      ? `${summary.inactive_licensed_users} inactive licensed user${summary.inactive_licensed_users === 1 ? '' : 's'} indicate the clearest immediate reclaim opportunity.`
      : 'Inactive-user reclaim signals are currently limited, so optimisation is more likely to come from SKU design and utilisation mix.',
  ].join(' ');
}

function interpretFrameworkSection(fw: FrameworkInsightsResponse | null): string {
  if (!fw) return 'This section interprets customer assessments against Microsoft guidance using the saved assessment evidence.';
  return [
    'This section is an evidence-based interpretation of alignment to Microsoft guidance, not a direct maturity score returned by Azure APIs.',
    `The current WAF and CAF results should be read together: WAF shows relative architectural posture across the five Azure pillars, while CAF shows delivery and operating maturity across broader adoption domains.`,
    fw.phase2_count > 0
      ? `${fw.phase2_count} future-phase opportunit${fw.phase2_count === 1 ? 'y has' : 'ies have'} already been flagged, which means the current assessment is strong enough to guide next-step deep dives as well as immediate actions.`
      : 'The current assessment is primarily a posture baseline rather than a future-phase work inventory.',
  ].join(' ');
}

function portfolioEvidenceBullets(challenges: Challenge[] | null): string[] {
  if (!challenges || challenges.length === 0) return [];

  const bullets: string[] = [];
  const normalizedTitles = challenges.map((item) => lowerSafe(item.title));

  if (normalizedTitles.some((title) => title.includes('support capacity is too thin'))) {
    bullets.push('Small-team dependency remains high.');
  }

  if (normalizedTitles.some((title) => title.includes('person-dependent'))) {
    bullets.push('Platform knowledge is still person-dependent.');
  }

  return bullets.slice(0, 2);
}

function interpretPortfolioSection(portfolio: AppPortfolioEntry[] | null): string {
  if (!portfolio || portfolio.length === 0) return 'This section summarises the current application portfolio picture and where it appears to need the most attention.';
  const futureStateKnown = portfolio.filter((item) => (item.future_state ?? '').trim().length > 0).length;
  const critical = portfolio.filter((item) => lowerSafe(item.criticality).includes('high') || lowerSafe(item.criticality).includes('critical')).length;
  return [
    'This section translates the discovered and curated application estate into a portfolio view of ownership, criticality, and future-state readiness.',
    `${portfolio.length} application record${portfolio.length === 1 ? '' : 's'} are currently tracked, with ${critical} marked as high-criticality and ${futureStateKnown} of ${portfolio.length} carrying an explicit future-state.`,
    'The detail below should be read as a management baseline for rationalisation, modernization, and dependency planning rather than just an inventory list.',
  ].join(' ');
}

function synthesizeStakeholders(notes: StakeholderNote[] | null): string {
  if (!notes || notes.length === 0) return 'This section consolidates the stakeholder themes captured during interviews and working sessions.';
  const validated = notes.filter((item) => lowerSafe(item.validation_status).includes('review') || lowerSafe(item.validation_status).includes('validated')).length;
  const withPain = notes.filter((item) => (item.pain_points ?? '').trim().length > 0).length;
  return [
    `Stakeholder evidence is currently drawn from ${notes.length} interview note${notes.length === 1 ? '' : 's'}, giving a cross-functional view of where operating friction, dependency, and decision gaps are being felt.`,
    withPain > 0
      ? `${withPain} note${withPain === 1 ? '' : 's'} explicitly document pain points, which means the themes below should be read as direct operating experience rather than purely analytical interpretation.`
      : 'The themes below are derived from the currently captured stakeholder evidence and should be validated further as more interviews are added.',
    validated > 0
      ? `${validated} note${validated === 1 ? '' : 's'} have already been marked for customer review or validation.`
      : 'Current notes are still best treated as emerging signals rather than fully validated findings.',
  ].join(' ');
}

function interpretInitiativesSection(initiatives: Initiative[] | null): string {
  if (!initiatives || initiatives.length === 0) return 'This section summarises the currently identified roadmap and initiative structure.';
  const planned = initiatives.filter((item) => lowerSafe(item.status) === 'planning').length;
  const inFlight = initiatives.filter((item) => lowerSafe(item.status) === 'in progress').length;
  return [
    `The initiative set currently includes ${initiatives.length} workstream${initiatives.length === 1 ? '' : 's'}, giving a starting roadmap for translating assessment findings into execution.`,
    `${planned} initiative${planned === 1 ? '' : 's'} are still in planning and ${inFlight} appear to be in flight or active, which helps indicate whether the organisation is already mobilising around the identified priorities.`,
  ].join(' ');
}

function licensePaygNote(summary: LicenseSummary | null): string {
  return summary?.payg_note
    ?? 'SKUs reported by Microsoft Graph with purchased quantities of 10,000, 100,000, or 1,000,000 are flagged as pay-as-you-go allocations for reporting clarity. For these SKUs, imported purchased, consumed, available, and utilisation values are preserved as returned by the source system, and the underutilised status is presented as not applicable.';
}

function matchesDynamicsKeyword(...values: Array<string | null | undefined>): boolean {
  const haystack = values.filter(Boolean).join(' ').toLowerCase();
  return ['dynamics', 'dataverse', 'businesscentral', 'business central', 'crm'].some((keyword) => haystack.includes(keyword));
}

function renderRecommendationSummary(recommendations: AdvisorRecommendation[] | null): React.ReactNode {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }
  const total = recommendations.length;
  const high = recommendations.filter((item) => item.impact === 'High').length;
  const medium = recommendations.filter((item) => item.impact === 'Medium').length;
  const cost = recommendations.filter((item) => lowerSafe(item.category).includes('cost')).length;
  const categories = [...new Set(recommendations.map((item) => item.category).filter(Boolean))].slice(0, 4);

  return (
    <>
      <p className="rpt-narrative">
        Azure Advisor recommendations are highlighting a mix of posture, reliability, cost, and operational improvement opportunities across the estate.
        The current set includes {plural(total, 'recommendation')}, with {high} high-impact items and {medium} medium-impact items requiring structured triage.
      </p>
      <p className="rpt-narrative">
        Most of the recommendations are clustering around {categories.join(', ') || 'core Azure platform'} concerns, which suggests the findings are not isolated one-offs but part of a broader optimisation and governance backlog.
        The detailed table is retained below as an appendix-style register for review and follow-up tracking.
      </p>
      {cost > 0 && (
        <p className="rpt-narrative">
          {cost} of the current recommendations are explicitly cost-related, which gives the team a concrete optimisation backlog that can be triaged separately from security and reliability remediation.
        </p>
      )}
    </>
  );
}

function normalizeInsightRows(data: unknown): ExecutiveInsight[] {
  if (Array.isArray(data)) return data as ExecutiveInsight[];
  if (data && typeof data === 'object') {
    const rows = (data as { insights?: unknown }).insights;
    if (Array.isArray(rows)) return rows as ExecutiveInsight[];
  }
  return [];
}

/* ═══════════════════════════════════════════════════════════════════
   Derive recommended actions from all data sources
   ═══════════════════════════════════════════════════════════════════ */

interface DerivedAction {
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  category: string;
  action: string;
  rationale: string;
}

function pushDerivedAction(actions: DerivedAction[], next: DerivedAction) {
  const key = `${next.category}::${next.action}`.trim().toLowerCase();
  if (!actions.some((item) => `${item.category}::${item.action}`.trim().toLowerCase() === key)) {
    actions.push(next);
  }
}

function deriveActions(
  costSummary: CostSummary | null,
  defender: DefenderScoreResponse | null,
  advisorRecs: AdvisorRecommendation[] | null,
  licSummary: LicenseSummary | null,
  orphans: OrphanedResourcesResponse | null,
  policy: PolicyComplianceResponse | null,
  invSummary: InventorySummary | null,
  intRecs: IntegrationRecommendation[] | null,
  fw: FrameworkInsightsResponse | null,
  recommendations: Recommendation[] | null,
  organizationContext: OrganizationContext | null,
  dynamicsContext: DynamicsManualContext | null,
  d365Envs: D365Environment[] | null,
  customerName: string,
): DerivedAction[] {
  const actions: DerivedAction[] = [];

  // Security
  if (defender && defender.overall_percentage < 70) {
    pushDerivedAction(actions, { priority: 'High', category: 'Security', action: 'Improve Defender Secure Score', rationale: `Current score is ${formatPercent(defender.overall_percentage, 0)}. Industry benchmark is >70%. Review unhealthy controls and remediate.` });
  }
  if (advisorRecs) {
    const highRecs = advisorRecs.filter(r => r.impact === 'High');
    if (highRecs.length > 0) {
      pushDerivedAction(actions, { priority: 'High', category: 'Security', action: `Address ${plural(highRecs.length, 'high-impact Advisor recommendation')}`, rationale: 'Azure Advisor has identified critical recommendations that should be prioritised.' });
    }
  }

  // Cost
  if (costSummary && costSummary.overall_trend === 'increasing' && (costSummary.trend_percent ?? 0) > 10) {
    pushDerivedAction(actions, { priority: 'High', category: 'Cost', action: 'Investigate rising costs', rationale: `Monthly spend is trending up ${(costSummary.trend_percent ?? 0).toFixed(1)}%. Identify and address cost drivers.` });
  }

  // Licenses
  if (licSummary && licSummary.estimated_waste_monthly != null && licSummary.estimated_waste_monthly > 100) {
    pushDerivedAction(actions, { priority: 'Medium', category: 'Licensing', action: 'Validate inactive users and reclaim unused licenses', rationale: `Estimated ${formatCurrency(licSummary.estimated_waste_monthly)}/month in waste from underutilised or inactive license assignments. Validate inactivity first, then reclaim or reassign the excess.` });
  }

  // Orphans
  if (orphans && orphans.total_count > 0) {
    pushDerivedAction(actions, { priority: 'Medium', category: 'Governance', action: `Clean up ${plural(orphans.total_count, 'orphaned resource')}`, rationale: 'Orphaned resources (unattached disks, NICs, IPs) add unnecessary cost and clutter.' });
  }

  // Policy compliance
  if (policy && policy.total_non_compliant_resources > 0) {
    pushDerivedAction(actions, { priority: 'Medium', category: 'Governance', action: `Remediate ${plural(policy.total_non_compliant_resources, 'non-compliant resource')}`, rationale: `${plural(policy.total_non_compliant_policies, 'policy')} have non-compliant resources.` });
  }

  // Tagging
  if (invSummary && invSummary.untagged_percentage > 20) {
    pushDerivedAction(actions, { priority: 'Medium', category: 'Governance', action: 'Complete resource and resource-group tagging uplift', rationale: `${formatPercent(invSummary.untagged_percentage, 0)} of resources lack tags, and incomplete business context at resource-group level still limits cost attribution and operational tracing.` });
  }

  // Integrations
  if (intRecs && intRecs.length > 0) {
    intRecs.forEach(r => {
      pushDerivedAction(actions, { priority: r.priority === 'critical' || r.priority === 'high' ? 'High' : 'Medium', category: 'Integrations', action: r.title, rationale: r.description });
    });
  }

  // Framework
  if (fw) {
    const weakPillars = Object.values(fw.waf_pillars).filter(p => p.score < 50);
    weakPillars.forEach(p => {
      pushDerivedAction(actions, { priority: 'Medium', category: 'Framework', action: `Improve WAF ${p.name} pillar`, rationale: `Score is ${formatPercent(p.score, 0)}. Consider Phase 2 deep-dive.` });
    });
  }

  const recommendationIds = new Set((recommendations ?? []).map((item) => item.recommendation_id));

  if (recommendationIds.has('R2')) {
    pushDerivedAction(actions, {
      priority: 'High',
      category: 'Capability',
      action: 'Increase platform support capacity for the current estate',
      rationale: 'The current change agenda is broader than the likely comfortable delivery capacity of the standing team, so additional support capacity should be treated as a practical enabler rather than an optional extra.',
    });
  }

  if (recommendationIds.has('R12')) {
    pushDerivedAction(actions, {
      priority: 'Medium',
      category: 'Capability',
      action: 'Run an AI-assisted learn-by-doing uplift across delivery and operations',
      rationale: 'A supervised capability stream would help the team use AI to accelerate documentation, reporting, governance, Azure hygiene, and portfolio management work on real follow-up tasks rather than through stand-alone experimentation.',
    });
  }

  if ((invSummary?.total_subscriptions ?? 0) > 1) {
    pushDerivedAction(actions, {
      priority: 'Medium',
      category: 'Governance',
      action: 'Review whether Azure Management Groups would improve policy and governance control',
      rationale: `${invSummary?.total_subscriptions ?? 0} subscriptions are currently in scope. A management-group design may provide a cleaner policy, hierarchy, and delegation boundary if ${customerName} wants stronger governance at scale.`,
    });
  }

  if ((d365Envs?.length ?? 0) > 0 || dynamicsContext) {
    pushDerivedAction(actions, {
      priority: 'Medium',
      category: 'Dynamics',
      action: 'Validate Dynamics environments, solutions, workflows, and users for cleanup',
      rationale: 'The Dynamics footprint is broader than the initial API view alone. Use the current environment, workflow, solution, and manual-context evidence to confirm what is still needed, what is duplicated, and where cleanup can reduce support overhead.',
    });
  }

  pushDerivedAction(actions, {
    priority: 'Medium',
    category: 'Delivery',
    action: 'Adopt Azure DevOps as the working system for portfolio and delivery reporting',
    rationale: 'Boards, stories, tasks, dashboards, and clearer work-management discipline would give leadership a more current picture of progress and reduce admin-heavy manual reporting.',
  });

  pushDerivedAction(actions, {
    priority: 'Medium',
    category: 'Capability',
    action: 'Provide targeted Azure architecture uplift for the Azure and network engineer',
    rationale: `The estate now behaves more like a ${organizationContext?.organisation_size?.toLowerCase() ?? 'medium-complexity'} platform footprint than a small stand-alone environment. Targeted Azure training would reduce dependence on external specialists and strengthen internal decision quality.`,
  });

  if (recommendationIds.has('R6')) {
    pushDerivedAction(actions, {
      priority: 'Medium',
      category: 'Migration',
      action: 'Finalise the remaining AWS-hosted web migration path',
      rationale: 'Completing the remaining externally hosted web migration decisions would reduce split-platform overhead, improve focus on Azure, and make future web-platform governance simpler.',
    });
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  actions.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  return actions;
}

/* ═══════════════════════════════════════════════════════════════════
   Table of Contents Item
   ═══════════════════════════════════════════════════════════════════ */
interface TocItem { num: string; title: string; id: string; }

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function AssessmentReport() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const customerName = activeProfile?.customer_name?.trim() || 'the organisation';
  const { exportToPdf, exporting } = usePdfExport();
  const { exportToWord, exporting: exportingWord } = useWordExport();
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<'none' | 'loading' | 'ready' | 'empty'>('none');
  const [reportReleaseMode, setReportReleaseMode] = useState<ReportReleaseMode>('draft');
  const [manualCafRatings, setManualCafRatings] = useState<MethodologyManualRatings>({});
  const reportSettingsRequestSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!profileId) {
      setSnapshotAt(null);
      setSnapshotStatus('none');
      return;
    }
    setSnapshotStatus('loading');
    profilesApi.loadSnapshot(profileId)
      .then((snapshot) => {
        if (!cancelled) {
          setSnapshotAt(snapshot.snapshot_at ?? null);
          setSnapshotStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSnapshotAt(null);
          setSnapshotStatus('empty');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    if (!profileId) {
      setManualCafRatings({});
      return;
    }
    frameworkApi.getManualCaf(profileId)
      .then((record) => {
        if (!cancelled) setManualCafRatings(record?.ratings ?? {});
      })
      .catch(() => {
        if (!cancelled) setManualCafRatings({});
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  /* ── Load ALL data sources ────────────────────────────────────── */

  // Insights
  const insights = useModuleData<ExecutiveInsight[]>(() => insightsApi.list(), [], { cacheKey: MODULE_CACHE_KEYS.insightsList });

  // Inventory
  const invSummary = useModuleData<InventorySummary>(() => inventoryApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.inventorySummary });
  const subscriptions = useModuleData<Subscription[]>(() => inventoryApi.subscriptions(), [], { cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions });
  const resourceGroups = useModuleData<ResourceGroup[]>(() => inventoryApi.resourceGroups(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryResourceGroups });
  const resources = useModuleData<Resource[]>(() => inventoryApi.resources(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryResources });
  const databases = useModuleData<DatabaseOverview[]>(() => inventoryApi.databases(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryDatabases });

  // Costs
  const costSummary = useModuleData<CostSummary>(() => costsApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.costSummary });
  const costBySub = useModuleData<CostRollup[]>(() => costsApi.bySubscription(), [], { cacheKey: MODULE_CACHE_KEYS.costBySubscription });
  const costByRG = useModuleData<CostRollup[]>(() => costsApi.byResourceGroup(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceGroup });
  const costByType = useModuleData<CostRollup[]>(() => costsApi.byResourceType(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceType });
  const costByResource = useModuleData<CostRecord[]>(() => costsApi.byResource(), [], { cacheKey: MODULE_CACHE_KEYS.costByResource });

  // Security
  const defender = useModuleData<DefenderScoreResponse>(() => securityApi.defenderScores(), [], { cacheKey: MODULE_CACHE_KEYS.securityDefenderScores });
  const advisorScores = useModuleData<AdvisorScoresResponse>(() => securityApi.advisorScores(), [], { cacheKey: MODULE_CACHE_KEYS.securityAdvisorScores });
  const advisorRecs = useModuleData<AdvisorRecommendation[]>(() => securityApi.advisorRecommendations(), [], { cacheKey: MODULE_CACHE_KEYS.securityAdvisorRecommendations });
  const cspmInsights = useModuleData<CspmInsightsResponse>(() => securityApi.cspmInsights(), [], { cacheKey: MODULE_CACHE_KEYS.securityCspmInsights });

  // Governance
  const govPolicy = useModuleData<PolicyComplianceResponse>(() => governanceApi.policyCompliance(), [], { cacheKey: MODULE_CACHE_KEYS.governancePolicyCompliance });
  const govRbac = useModuleData<RoleAssignmentsResponse>(() => governanceApi.roleAssignments(), [], { cacheKey: MODULE_CACHE_KEYS.governanceRoleAssignments });
  const govOrphans = useModuleData<OrphanedResourcesResponse>(() => governanceApi.orphanedResources(), [], { cacheKey: MODULE_CACHE_KEYS.governanceOrphanedResources });

  // Integrations
  const intSummary = useModuleData<IntegrationSummary>(() => integrationsApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.integrationsSummary });
  const intList = useModuleData<IntegrationPoint[]>(() => integrationsApi.list(), [], { cacheKey: MODULE_CACHE_KEYS.integrationsList });
  const intRecs = useModuleData<IntegrationRecommendation[]>(() => integrationsApi.recommendations(), [], { cacheKey: MODULE_CACHE_KEYS.integrationsRecommendations });
  const integrationReview = useModuleData<IntegrationReviewRecord | null>(
    () => profileId ? integrationReviewApi.get(profileId) : Promise.resolve(null),
    [profileId],
  );

  // Dynamics 365
  const d365Envs = useModuleData<D365Environment[]>(() => dynamicsApi.environments(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsEnvironments });
  const d365Users = useModuleData<D365User[]>(() => dynamicsApi.users(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsUsers });
  const d365Modules = useModuleData<D365ModuleStats[]>(() => dynamicsApi.moduleStats(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsModuleStats });
  const d365Workflows = useModuleData<D365WorkflowHealth[]>(() => dynamicsApi.workflowHealth(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsWorkflowHealth });
  const d365BC = useModuleData<D365BCStats[]>(() => dynamicsApi.bcStats(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsBcStats });

  // Licenses
  const licSummary = useModuleData<LicenseSummary>(() => licensesApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.licensesSummary });
  const licSkus = useModuleData<LicenseSKU[]>(() => licensesApi.skus(), [], { cacheKey: MODULE_CACHE_KEYS.licensesSkus });
  const licUsers = useModuleData<UserLicense[]>(() => licensesApi.users(), [], { cacheKey: MODULE_CACHE_KEYS.licensesUsers });

  // Portfolio & Initiatives
  const portfolio = useModuleData<AppPortfolioEntry[]>(() => profileId ? portfolioApi.list(profileId) : Promise.resolve([]), [profileId]);
  const appDiscoveryAnnotations = useModuleData<ApplicationDiscoveryAnnotation[]>(
    () => profileId ? applicationDiscoveryApi.listAnnotations(profileId) : Promise.resolve([]),
    [profileId],
  );
  const challenges = useModuleData<Challenge[]>(() => profileId ? challengesApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: MODULE_CACHE_KEYS.challengesList });
  const recommendations = useModuleData<Recommendation[]>(() => profileId ? recommendationsApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: MODULE_CACHE_KEYS.recommendationsList });
  const initiatives = useModuleData<Initiative[]>(() => profileId ? initiativesApi.list(profileId) : Promise.resolve([]), [profileId]);
  const organizationContext = useModuleData<OrganizationContext | null>(
    () => profileId ? organizationApi.get(profileId) : Promise.resolve(null),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.organizationContext },
  );
  const inventoryValidation = useModuleData<InventoryValidationData | null>(
    () => Promise.resolve(null),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.reportInventoryValidation },
  );

  // Stakeholders
  const stakeholders = useModuleData<StakeholderNote[]>(() => profileId ? stakeholdersApi.list(profileId) : Promise.resolve([]), [profileId]);
  const dynamicsManualContext = useModuleData<DynamicsManualContext | null>(
    () => profileId ? dynamicsContextApi.get(profileId) : Promise.resolve(null),
    [profileId],
  );

  // Data Gaps
  const gaps = useModuleData<DataGap[]>(() => dataGapsApi.list(), [], { cacheKey: MODULE_CACHE_KEYS.dataGaps });

  // Framework
  const framework = useModuleData<FrameworkInsightsResponse>(() => frameworkApi.insights(), [], { cacheKey: MODULE_CACHE_KEYS.frameworkInsights });

  /* ── Derived data ─────────────────────────────────────────────── */

  const now = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
  const DYNAMICS_ENV_TYPE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#e0e7ff'];
  const DYNAMICS_ENV_BREAKDOWN_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb7185', '#818cf8'];
  const dynamicsChartTheme = {
    text: '#cbd5e1',
    muted: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.35)',
    halo: 'rgba(15, 23, 42, 0.65)',
  };
  const reportReleaseLabel = reportReleaseMode === 'major' ? 'MAJOR VERSION' : 'DRAFT. For Review';
  const insightRows = useMemo(() => normalizeInsightRows(insights.data), [insights.data]);
  const executiveInsightRows = useMemo(() => {
    const seen = new Set<string>();
    return insightRows.filter((item) => {
      const key = [
        item.severity,
        item.title?.trim().toLowerCase(),
        (item.recommendation ?? item.message ?? '').trim().toLowerCase(),
      ].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [insightRows]);
  const orgGuidance = useMemo(() => tailoringGuidance(organizationContext.data), [organizationContext.data]);
  const dynamicsEnvTypeChartData = useMemo(() => {
    const rows = d365Envs.data ?? [];
    const map = new Map<string, number>();
    for (const row of rows) {
      const type = row.environment_type || row.type || 'Unknown';
      map.set(type, (map.get(type) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [d365Envs.data]);
  const dynamicsUserEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(d365Users.data, (row) => row.environment),
    [d365Users.data],
  );
  const dynamicsWorkflowEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(d365Workflows.data, (row) => row.environment_id),
    [d365Workflows.data],
  );
  const dynamicsModuleEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(d365Modules.data, (row) => row.environment_id),
    [d365Modules.data],
  );
  const manualContextHighlights = useMemo(() => {
    const ctx = dynamicsManualContext.data;
    if (!ctx) return [] as Array<{ label: string; value: string; note?: string }>;
    const envTotal = extractFirstNumber(ctx.extra_environments, /shows\s+(\d+)\s+Power Platform/i);
    const environmentMix = summarizeEnvironmentMix(ctx.extra_environments);
    const dbUsage = extractFirstNumber(ctx.dataverse_capacity_notes, /approx\.\s+([\d.]+)\s+GB database usage/i);
    const fileUsage = extractFirstNumber(ctx.dataverse_capacity_notes, /([\d.]+)\s+GB file usage/i);
    const logUsage = extractFirstNumber(ctx.dataverse_capacity_notes, /([\d.]+)\s+GB log usage/i);
    const salesPurchased = extractFirstNumber(ctx.dataverse_license_notes, /Sales Enterprise Edition\s+\((\d+)\s+purchased/i);
    const salesUsed = extractFirstNumber(ctx.dataverse_license_notes, /Sales Enterprise Edition\s+\(\d+\s+purchased\s+\/\s+\d+\s+assigned\s+\/\s+(\d+)\s+used\)/i);
    const tiles = [
      envTotal ? { label: 'Workbook environments', value: envTotal, note: environmentMix ?? undefined } : null,
      dbUsage ? { label: 'Dataverse DB usage', value: `${dbUsage} GB`, note: fileUsage ? `Files ${fileUsage} GB${logUsage ? ` • Logs ${logUsage} GB` : ''}` : undefined } : null,
      salesPurchased ? { label: 'Sales Enterprise', value: `${salesPurchased} purchased`, note: salesUsed ? `${salesUsed} used` : undefined } : null,
      ctx.dataverse_cost_notes ? { label: 'Billing visibility', value: 'Portal incomplete', note: 'Dynamics and M365 procured externally' } : null,
    ].filter(Boolean) as Array<{ label: string; value: string; note?: string }>;
    return tiles;
  }, [dynamicsManualContext.data]);
  const recommendedActions = useMemo(
    () => deriveActions(
      costSummary.data,
      defender.data,
      advisorRecs.data,
      licSummary.data,
      govOrphans.data,
      govPolicy.data,
      invSummary.data,
      intRecs.data,
      framework.data,
      recommendations.data,
      organizationContext.data,
      dynamicsManualContext.data,
      d365Envs.data,
      customerName,
    ),
    [
      costSummary.data,
      defender.data,
      advisorRecs.data,
      licSummary.data,
      govOrphans.data,
      govPolicy.data,
      invSummary.data,
      intRecs.data,
      framework.data,
      recommendations.data,
      organizationContext.data,
      dynamicsManualContext.data,
      d365Envs.data,
      customerName,
    ],
  );

  const tailoredChallenges = useMemo(
    () => (challenges.data ?? []).map((item) => ({
      ...item,
      tailored_capability_opportunities: (item.capability_opportunities ?? []).map((entry) => tailorPresentationText(entry, organizationContext.data)),
      tailored_why_it_matters: tailorPresentationText(item.why_it_matters, organizationContext.data),
      tailored_description: tailorPresentationText(item.description, organizationContext.data),
    })),
    [challenges.data, organizationContext.data],
  );

  const tailoredRecommendations = useMemo(
    () => (recommendations.data ?? []).map((item) => ({
      ...item,
      tailored_description: tailorPresentationText(item.description, organizationContext.data),
      tailored_why_it_matters: tailorPresentationText(item.why_it_matters, organizationContext.data),
      tailored_practical_next_step: tailorPresentationText(item.practical_next_step, organizationContext.data),
    })),
    [organizationContext.data, recommendations.data],
  );

  // Resource type aggregation
  const resourcesByType = useMemo(() => {
    if (!resources.data) return [];
    const map = new Map<string, number>();
    resources.data.forEach(r => map.set(r.type, (map.get(r.type) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [resources.data]);

  const inventoryResourceCountBySubscription = useMemo(() => {
    const map = new Map<string, number>();
    for (const resource of resources.data ?? []) {
      map.set(resource.subscription_id, (map.get(resource.subscription_id) ?? 0) + 1);
    }
    return map;
  }, [resources.data]);

  const portfolioHasMonthlyCost = useMemo(
    () => (portfolio.data ?? []).some((item) => {
      if (item.monthly_cost == null) return false;
      const value = typeof item.monthly_cost === 'number' ? item.monthly_cost : Number(item.monthly_cost);
      return Number.isFinite(value);
    }),
    [portfolio.data],
  );

  // Subscription name lookup: id → display_name
  const subNameMap = useMemo(() => buildSubscriptionNameMap(subscriptions.data ?? []), [subscriptions.data]);

  const snapshotHasFieldColumn = useMemo(
    () => (gaps.data ?? []).some((gap) => String(gap.field ?? '').trim().length > 0),
    [gaps.data],
  );

  const subscriptionTableRows = useMemo(
    () =>
      (subscriptions.data ?? [])
        .map((sub) => {
          const subResources = (resources.data ?? []).filter((row) => row.subscription_id === sub.subscription_id);
          const subGroups = (resourceGroups.data ?? []).filter((row) => row.subscription_id === sub.subscription_id);
          const locations = new Set(subResources.map((row) => row.location).filter(Boolean));
          const taggedCount = subResources.filter((row) => row.is_tagged).length;
          return {
            ...sub,
            resource_group_count: subGroups.length,
            resource_count: subResources.length,
            locations_count: locations.size,
            tagged_percent: subResources.length > 0 ? (taggedCount / subResources.length) * 100 : 0,
          };
        })
        .sort((a, b) => b.resource_count - a.resource_count || a.display_name.localeCompare(b.display_name)),
    [resourceGroups.data, resources.data, subscriptions.data],
  );

  const resourceGroupTableRows = useMemo(
    () =>
      (resourceGroups.data ?? [])
        .map((group) => {
          const groupResources = (resources.data ?? []).filter(
            (row) => row.subscription_id === group.subscription_id && row.resource_group === group.name,
          );
          const taggedResources = groupResources.filter((row) => row.is_tagged).length;
          return {
            ...group,
            subscription_label: subNameMap.get(group.subscription_id) ?? group.subscription_id,
            tags_count: Object.keys(group.tags ?? {}).length,
            tagged_resources: taggedResources,
            untagged_resources: Math.max(0, groupResources.length - taggedResources),
          };
        })
        .sort((a, b) => b.resource_count - a.resource_count || a.name.localeCompare(b.name)),
    [resourceGroups.data, resources.data, subNameMap],
  );

  const topResourceGroups = useMemo(
    () => resourceGroupTableRows.slice(0, 10).map((row) => ({ name: row.name, value: row.resource_count })),
    [resourceGroupTableRows],
  );

  const topLocations = useMemo(
    () =>
      Object.entries(invSummary.data?.resources_by_location ?? {})
        .map(([name, value]) => ({ name: name || 'Unknown', value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [invSummary.data?.resources_by_location],
  );

  const taggingSplit = useMemo(() => {
    if (!invSummary.data) return [];
    const tagged = Math.max(0, invSummary.data.total_resources - invSummary.data.untagged_count);
    return [
      { name: 'Tagged', value: tagged },
      { name: 'Untagged', value: invSummary.data.untagged_count },
    ];
  }, [invSummary.data]);

  const topResources = useMemo(
    () =>
      [...(resources.data ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20),
    [resources.data],
  );

  const allResourcesExportRows = useMemo<CsvRow[]>(
    () =>
      (resources.data ?? []).map((row) => ({
        Name: row.name,
        Type: shortType(row.type),
        'Resource Group': row.resource_group,
        Location: row.location,
        Subscription: resolveSubscriptionName(row.subscription_name, row.subscription_id, subNameMap),
        Tagged: row.is_tagged ? 'Yes' : 'No',
      })),
    [resources.data, subNameMap],
  );

  const monthlyAverageSpend = useMemo(() => {
    const months = costSummary.data?.by_month ?? [];
    if (!months.length) return 0;
    const total = months.reduce((sum, item) => sum + item.amount, 0);
    return total / months.length;
  }, [costSummary.data?.by_month]);

  const subscriptionPctBase = costSummary.data?.total_cost_1m ?? costSummary.data?.total ?? 0;
  const costBySubscriptionHasCostedResources = useMemo(
    () => (costBySub.data ?? []).some((row) => (row.resource_count ?? 0) > 0),
    [costBySub.data],
  );
  const costByResourceGroupHasCostedResources = useMemo(
    () => (costByRG.data ?? []).some((row) => (row.resource_count ?? 0) > 0),
    [costByRG.data],
  );

  const orphanCostByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of costByResource.data ?? []) {
      const key = item.resource_name?.trim().toLowerCase();
      if (!key) continue;
      map.set(key, item.cost_1m);
    }
    return map;
  }, [costByResource.data]);

  const effectiveCafMethodologies = useMemo(() => {
    return Object.entries(framework.data?.caf_methodologies ?? {}).map(([key, methodology]) => {
      const derived = deriveManualMethodology(methodology, manualCafRatings[key]);
      return {
        ...methodology,
        key,
        display_signals: getEnrichedCafSignals(key, methodology),
        engine_maturity: methodology.maturity,
        engine_label: methodology.maturity_label,
        effective_maturity: derived ? derived.level : methodology.maturity,
        effective_label: derived ? derived.label : methodology.maturity_label,
        manual_rated_count: derived?.ratedCount ?? 0,
        manual_total_count: derived?.totalCount ?? (methodology.sub_dimensions?.length ?? 0),
        manual_override_active: Boolean(derived),
      };
    });
  }, [framework.data?.caf_methodologies, manualCafRatings]);

  const effectiveCafAverageScore = useMemo(() => {
    if (!effectiveCafMethodologies.length) return framework.data?.caf_average_maturity ?? null;
    const total = effectiveCafMethodologies.reduce((sum, item) => sum + item.effective_maturity, 0);
    return total / effectiveCafMethodologies.length;
  }, [effectiveCafMethodologies, framework.data?.caf_average_maturity]);

  const snapshotGapSummary = useMemo(() => {
    const allGaps = gaps.data ?? [];
    const byModule = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    for (const gap of allGaps) {
      byModule.set(gap.module, (byModule.get(gap.module) ?? 0) + 1);
      bySeverity.set(gap.severity, (bySeverity.get(gap.severity) ?? 0) + 1);
    }
    return {
      total: allGaps.length,
      byModule: [...byModule.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      bySeverity: [...bySeverity.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [gaps.data]);

  const dynamicsIntegrationRows = useMemo(
    () =>
      (intList.data ?? [])
        .filter((row) => matchesDynamicsKeyword(
          row.name,
          row.source_system,
          row.source_resource_name,
          row.target_system,
          row.target_name,
          row.integration_type,
        ))
        .slice(0, 10),
    [intList.data],
  );

  const dynamicsCostRows = useMemo(
    () =>
      (costByResource.data ?? [])
        .filter((row) => matchesDynamicsKeyword(row.resource_name, row.resource_type, row.resource_id))
        .sort((a, b) => (b.cost_1m ?? 0) - (a.cost_1m ?? 0))
        .slice(0, 10),
    [costByResource.data],
  );

  const dynamicsLinkedMonthlySpend = useMemo(
    () => dynamicsCostRows.reduce((sum, row) => sum + (row.cost_1m ?? 0), 0),
    [dynamicsCostRows],
  );

  const securityExposureAssessmentData = useMemo(
    () =>
      (cspmInsights.data?.assessment_summary.by_subscription ?? [])
        .map((row) => ({
          name: resolveSubscriptionName(row.subscription_name, row.subscription_id, subNameMap),
          value: row.unhealthy,
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [cspmInsights.data?.assessment_summary.by_subscription, subNameMap],
  );

  const securityExposureAttackPathData = useMemo(
    () =>
      (cspmInsights.data?.attack_path_summary.by_subscription ?? [])
        .map((row) => ({
          name: resolveSubscriptionName(row.subscription_name, row.subscription_id, subNameMap),
          value: row.total,
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [cspmInsights.data?.attack_path_summary.by_subscription, subNameMap],
  );

  const applicationDiscoverySummary = useMemo(() => {
    const grouped = new Map<string, { subscriptionId: string; resourceGroup: string; resources: Resource[] }>();
    for (const resource of resources.data ?? []) {
      const subscriptionId = (resource.subscription_id ?? '').trim();
      const resourceGroup = (resource.resource_group ?? '').trim();
      if (!subscriptionId || !resourceGroup) continue;
      const key = discoveryGroupKey(subscriptionId, resourceGroup);
      const existing = grouped.get(key);
      if (existing) {
        existing.resources.push(resource);
      } else {
        grouped.set(key, { subscriptionId, resourceGroup, resources: [resource] });
      }
    }

    const annotationsByKey = new Map(
      (appDiscoveryAnnotations.data ?? []).map((item) => [
        discoveryGroupKey(item.subscription_id, item.resource_group),
        item,
      ]),
    );
    const costByGroupKey = new Map(
      (costByRG.data ?? []).flatMap((row) => {
        const rg = normalizeResourceGroupName(String(row.group_key || (row as { resource_group?: string }).resource_group || ''));
        const sub = String(row.subscription_id || '');
        if (!rg || !sub) return [];
        return [[discoveryGroupKey(sub, rg), row] as const];
      }),
    );

    const rows = [...grouped.values()].map((group) => {
      const profile = buildResourceGroupApplicationProfile(group.resourceGroup, group.subscriptionId, group.resources);
      const key = discoveryGroupKey(group.subscriptionId, group.resourceGroup);
      const annotation = annotationsByKey.get(key) ?? null;
      const costRow = costByGroupKey.get(key);
      const monthly = costRow?.cost_1m ?? 0;
      return {
        subscriptionId: group.subscriptionId,
        subscriptionName: subNameMap.get(group.subscriptionId) ?? group.subscriptionId,
        resourceGroup: group.resourceGroup,
        profile,
        annotation,
        avgMonthly: monthly,
      };
    });
    const totalMonthly = rows.reduce((sum, row) => sum + row.avgMonthly, 0);
    const sorted = rows
      .map((row) => ({
        ...row,
        spendSharePct: totalMonthly > 0 ? (row.avgMonthly / totalMonthly) * 100 : 0,
      }))
      .sort((a, b) => b.avgMonthly - a.avgMonthly || b.profile.confidence - a.profile.confidence);
    const archetypes = new Map<string, number>();
    for (const row of sorted) {
      archetypes.set(row.profile.archetype, (archetypes.get(row.profile.archetype) ?? 0) + 1);
    }
    return {
      totalGroups: sorted.length,
      allRows: sorted,
      topRows: sorted.slice(0, 8),
      topArchetypes: [...archetypes.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5),
    };
  }, [appDiscoveryAnnotations.data, costByRG.data, resources.data, subNameMap]);

  const defenderBySubscription = useMemo(
    () =>
      (defender.data?.scores ?? [])
        .map((row) => ({
          name: resolveSubscriptionName(row.subscription_name, row.subscription_id, subNameMap),
          value: Number((row.percentage ?? 0).toFixed(1)),
        }))
        .sort((a, b) => b.value - a.value)
        ,
    [defender.data?.scores, subNameMap],
  );

  const policyBySubscriptionChartData = useMemo(
    () =>
      (govPolicy.data?.by_subscription ?? [])
        .map((row) => ({
          name: resolveSubscriptionName(row.subscription_name, row.subscription_id, subNameMap),
          value: row.non_compliant_resources,
        }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [govPolicy.data?.by_subscription, subNameMap],
  );

  const orphanedByCategoryChartData = useMemo(
    () =>
      Object.entries(govOrphans.data?.by_type ?? {})
        .map(([name, value]) => ({ name, value }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value),
    [govOrphans.data?.by_type],
  );

  const rbacBySubscriptionChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const assignment of govRbac.data?.assignments ?? []) {
      const name = resolveSubscriptionName(assignment.subscription_name, assignment.subscription_id, subNameMap);
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [govRbac.data?.assignments, subNameMap]);

  const advisorRecommendationCategoryData = useMemo(() => {
    const map = new Map<string, number>(ADVISOR_REPORT_PILLARS.map((pillar) => [pillar, 0]));
    for (const recommendation of advisorRecs.data ?? []) {
      const category = readablePillar(recommendation.category);
      map.set(category, (map.get(category) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }, [advisorRecs.data]);

  const frameworkWafChartData = useMemo(
    () =>
      Object.values(framework.data?.waf_pillars ?? {})
        .map((pillar) => ({
          name: pillar.name,
          value: Number(pillar.score.toFixed(0)),
        }))
        .sort((a, b) => b.value - a.value),
    [framework.data?.waf_pillars],
  );

  const frameworkCafChartData = useMemo(
    () =>
      effectiveCafMethodologies
        .map((methodology) => ({
          name: methodology.name,
          value: Number(methodology.effective_maturity.toFixed(1)),
        }))
        .sort((a, b) => b.value - a.value),
    [effectiveCafMethodologies],
  );

  // Loading state for overall readiness indicator
  const allModules = [
    insights, invSummary, subscriptions, resourceGroups, resources, databases,
    costSummary, costBySub, costByRG, costByType,
    defender, advisorScores, advisorRecs, cspmInsights,
    govPolicy, govRbac, govOrphans,
    intSummary, intList, intRecs,
    d365Envs, d365Users, d365Modules, d365Workflows, d365BC, dynamicsManualContext,
    licSummary, licSkus, licUsers,
    portfolio, appDiscoveryAnnotations, challenges, recommendations, initiatives, stakeholders, gaps, framework, organizationContext,
  ];
  const loadedModules = allModules.filter(m => m.status === 'success').length;
  const totalModules = allModules.length;

  const executiveSummaryNarrativePoints = useMemo(
    () => [
      firstSentence(organizationContext.data?.organisation_overview),
      firstSentence(organizationContext.data?.it_team_summary),
      firstSentence(organizationContext.data?.operating_model_notes),
      challenges.data?.length
        ? 'Ownership and accountability appear to be uneven across the estate and emerge as leading challenge themes.'
        : null,
      recommendations.data?.some((item) => item.recommendation_id === 'R12')
        ? 'The next phase should combine capacity uplift with AI-assisted working methods rather than relying on headcount alone.'
        : null,
      costSummary.data && (costSummary.data.overall_trend ?? '').toLowerCase() === 'flat'
        ? 'Cloud spend appears broadly flat, which is positive from a control perspective but may also indicate that the portfolio is still weighted more toward maintenance and migration than toward new business-value delivery.'
        : null,
    ].filter(Boolean) as string[],
    [
      challenges.data,
      costSummary.data,
      organizationContext.data?.it_team_summary,
      organizationContext.data?.operating_model_notes,
      organizationContext.data?.organisation_overview,
      recommendations.data,
    ],
  );

  const organizationContextSummary =
    firstSentence(organizationContext.data?.organisation_overview) ??
    'Organisation context has been captured and reflected in the report narrative.';
  const inventoryValidationSummary = inventoryValidation.data?.summary ?? null;
  const inventoryValidationExtraResources = inventoryValidation.data?.extra_resources ?? [];

  const executiveFindingRows = useMemo(
    () => [
      {
        area: 'Azure estate',
        current: `${invSummary.data?.total_subscriptions ?? 0} subscriptions, ${invSummary.data?.total_resources?.toLocaleString() ?? '0'} resources, ${invSummary.data?.total_resource_groups ?? 0} resource groups.`,
        why: 'This establishes the scale and structure of the current estate baseline.',
      },
      {
        area: 'Cost and spend',
        current: `${costSummary.data ? formatCurrency(costSummary.data.total_cost_1m ?? costSummary.data.total ?? 0) : 'N/A'} latest month and ${costSummary.data ? formatCurrency(costSummary.data.total_cost_6m ?? 0) : 'N/A'} across six months.`,
        why: `${costSummary.data?.top_cost_drivers?.[0] ? normalizeResourceTypeName(costSummary.data.top_cost_drivers[0].resource_type) : 'The leading resource family'} is currently the largest visible cost driver.`,
      },
      {
        area: 'Security posture',
        current: `${defender.data ? formatPercent(defender.data.overall_percentage, 0) : 'N/A'} secure score across the assessed subscriptions.`,
        why: 'This indicates the current maturity of the visible security control picture.',
      },
      {
        area: 'Governance',
        current: `${govPolicy.data?.total_non_compliant_resources ?? 0} non-compliant resources and ${govRbac.data?.total_count ?? 0} role assignments.`,
        why: 'This shows how consistently governance controls are being applied today.',
      },
      {
        area: 'Integration landscape',
        current: `${intSummary.data?.total_integrations ?? 0} discovered integration points in the current baseline.`,
        why: `This gives ${customerName} a technical starting point for a maintained integration register.`,
      },
      {
        area: 'Dynamics 365',
        current: `${d365Envs.data?.length ?? 0} environments currently visible to the assessment.`,
        why: 'This indicates the current application platform footprint and spread.',
      },
      {
        area: 'Applications and portfolio',
        current: `${portfolio.data?.length ?? 0} portfolio entries and ${applicationDiscoverySummary.totalGroups ?? 0} discovered application groups.`,
        why: 'This informs ownership, future-state planning, and rationalisation activity.',
      },
    ],
    [
      applicationDiscoverySummary.totalGroups,
      costSummary.data,
      d365Envs.data,
      defender.data,
      govPolicy.data?.total_non_compliant_resources,
      govRbac.data?.total_count,
      intSummary.data?.total_integrations,
      invSummary.data?.total_resource_groups,
      invSummary.data?.total_resources,
      invSummary.data?.total_subscriptions,
      portfolio.data?.length,
      costSummary.data?.top_cost_drivers,
      customerName,
    ],
  );

  /* ── Table of Contents ────────────────────────────────────────── */

  const toc = useMemo<TocItem[]>(() => [
    { num: '1', title: 'Executive summary', id: 'rpt-exec-summary' },
    { num: '1.1', title: 'Organisation context', id: 'rpt-organization-context' },
    { num: '1.2', title: 'Cross-organisation challenges', id: 'rpt-challenges' },
    { num: '1.3', title: 'Strategic recommendations', id: 'rpt-recommendations' },
    { num: '1.4', title: 'Snapshot information', id: 'rpt-snapshot' },
    { num: '2', title: 'Application inventory and ownership', id: 'rpt-portfolio' },
    { num: '3', title: 'Azure estate overview', id: 'rpt-inventory' },
    { num: '4', title: 'Cost analysis', id: 'rpt-costs' },
    { num: '5', title: 'Security and compliance posture', id: 'rpt-security' },
    { num: '6', title: 'Governance', id: 'rpt-governance' },
    { num: '7', title: 'Integration landscape', id: 'rpt-integrations' },
    { num: '7.5', title: 'Integration map', id: 'rpt-integrationmap' },
    { num: '8', title: 'Dynamics 365 platform', id: 'rpt-dynamics' },
    { num: '9', title: 'License utilisation', id: 'rpt-licenses' },
    { num: '10', title: 'Strategic initiatives and roadmap', id: 'rpt-initiatives' },
    { num: '11', title: 'Stakeholder interview summary', id: 'rpt-stakeholders' },
    { num: '12', title: 'Framework alignment (WAF / CAF)', id: 'rpt-framework' },
    { num: '13', title: 'Recommended actions', id: 'rpt-actions' },
  ], []);

  const defaultSectionState = useMemo(() => buildDefaultReportVisibility(), []);
  const [visibleSections, setVisibleSections] = useState<Record<ReportVisibilityId, boolean>>(defaultSectionState);
  const defaultAppendixState = useMemo(() => buildDefaultReportAppendix(), []);
  const [appendixSections, setAppendixSections] = useState<Record<ReportVisibilityId, boolean>>(defaultAppendixState);

  // Fetches and applies report settings without resetting to defaults first.
  // Used by settings-changed events to avoid flickering back to defaults.
  const fetchReportSettings = useCallback(() => {
    const requestSeq = ++reportSettingsRequestSeqRef.current;
    if (!profileId) return;
    reportSettingsApi
      .get(profileId)
      .then((settings) => {
        if (reportSettingsRequestSeqRef.current !== requestSeq) return;
        setVisibleSections({ ...defaultSectionState, ...settings.visible_sections });
        setAppendixSections({ ...defaultAppendixState, ...settings.appendix_sections });
        setReportReleaseMode(settings.release_mode ?? 'draft');
      })
      .catch(() => {
        if (reportSettingsRequestSeqRef.current !== requestSeq) return;
        setVisibleSections(defaultSectionState);
        setAppendixSections(defaultAppendixState);
        setReportReleaseMode('draft');
      });
  }, [defaultAppendixState, defaultSectionState, profileId]);

  // Reset to defaults and re-fetch when the active profile changes.
  useEffect(() => {
    reportSettingsRequestSeqRef.current += 1;
    setVisibleSections(defaultSectionState);
    setAppendixSections(defaultAppendixState);
    setReportReleaseMode('draft');
    if (profileId) {
      fetchReportSettings();
    }
  }, [defaultSectionState, defaultAppendixState, profileId, fetchReportSettings]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ profileId?: number | null }>).detail;
      if ((detail?.profileId ?? profileId) !== profileId) return;
      fetchReportSettings();
    };
    const handleStorage = () => {
      fetchReportSettings();
    };
    window.addEventListener(REPORT_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(REPORT_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [profileId, fetchReportSettings]);

  const appendixSectionIds = useMemo(
    () =>
      toc
        .map((item) => item.id as TopLevelReportSectionId)
        .filter((id) => visibleSections[id] && appendixSections[id]),
    [appendixSections, toc, visibleSections],
  );

  const appendixSubsectionGroups = useMemo(
    () =>
      REPORT_VISIBILITY_ITEMS
        .filter((item) => item.children && item.children.length > 0)
        .map((item) => ({
          id: item.id as TopLevelReportSectionId,
          title: item.title,
          children: (item.children ?? []).filter(
            (child) =>
              visibleSections[child.id] &&
              appendixSections[child.id] &&
              !appendixSections[item.id],
          ),
        }))
        .filter((item) => item.children.length > 0),
    [appendixSections, visibleSections],
  );

  const visibleToc = useMemo(
    () => {
      const mainItems = toc.filter((item) => visibleSections[item.id as ReportVisibilityId] && !appendixSections[item.id as TopLevelReportSectionId]);
      const appendixNumber = String(toc.filter((item) => !item.num.includes('.')).length + 1);
      if (appendixSectionIds.length > 0 || appendixSubsectionGroups.length > 0) {
        return [...mainItems, { num: appendixNumber, title: 'Appendix', id: 'rpt-appendix' }];
      }
      return mainItems;
    },
    [appendixSectionIds.length, appendixSections, appendixSubsectionGroups.length, toc, visibleSections],
  );

  const reportNavSections = useMemo(
    () => visibleToc.map((item) => ({ id: item.id, label: `${item.num}. ${item.title}` })),
    [visibleToc],
  );

  const sectionOrder = useCallback(
    (id: TopLevelReportSectionId, baseOrder: number) => (appendixSections[id] ? 200 + baseOrder : baseOrder),
    [appendixSections],
  );

  const filePrefix = useMemo(
    () => `${activeProfile?.customer_name ?? 'assessment'}-assessment`,
    [activeProfile?.customer_name],
  );

  const advisorRecommendationExportRows = useMemo<CsvRow[]>(
    () => (advisorRecs.data ?? []).map((item) => {
      const resource = advisorResourceDisplay(item, subNameMap);
      return {
        Impact: item.impact,
        Category: readablePillar(item.category),
        Resource: resource.name,
        Subscription: resource.subscription,
        Description: replaceSubscriptionIdsInText(item.description, subNameMap),
        Remediation: replaceSubscriptionIdsInText(item.remediation, subNameMap),
      };
    }),
    [advisorRecs.data, subNameMap],
  );

  const governancePolicyExportRows = useMemo<CsvRow[]>(
    () => (govPolicy.data?.by_subscription ?? []).map((item) => ({
      Subscription: resolveSubscriptionName(item.subscription_name, item.subscription_id, subNameMap),
      'Total Resources': item.total_resources,
      Compliant: item.compliant,
      'Non-Compliant Resources': item.non_compliant_resources,
      'Non-Compliant Policies': item.non_compliant_policies,
      'Non-Compliant Policy Names': policyNamesForSubscription(item),
      Assignments: item.policy_assignments,
    })),
    [govPolicy.data?.by_subscription, subNameMap],
  );

  const orphanedResourceExportRows = useMemo<CsvRow[]>(
    () => (govOrphans.data?.orphans ?? []).map((item) => ({
      Name: item.resource_name,
      Category: item.category,
      Type: shortType(item.resource_type),
      Location: item.location,
      'Resource Group': item.resource_group,
      Subscription: resolveSubscriptionName(item.subscription_name, item.subscription_id, subNameMap),
      'Size (GB)': item.size_gb?.toFixed(1) ?? '',
      IP: item.ip ?? '',
    })),
    [govOrphans.data?.orphans, subNameMap],
  );

  const integrationRegisterExportRows = useMemo<CsvRow[]>(
    () => (intList.data ?? []).map((item) => ({
      Name: item.name ?? '',
      Source: item.source_resource_name || item.source_system || nameFromResourceId(item.source_resource_id, 'Unknown'),
      Target: item.target_name && !looksLikeId(item.target_name) ? item.target_name : item.target_system || nameFromResourceId(item.target_resource_id, item.target_name || '—'),
      Type: item.integration_type,
      Protocol: item.protocol ?? '',
      Direction: titleCase(item.direction),
      Health: item.health_status ?? 'Not monitored',
      Deprecated: item.is_deprecated_source || item.is_deprecated_target ? 'Yes' : 'No',
    })),
    [intList.data],
  );
  const reviewedIntegrationItems = useMemo(
    () => (integrationReview.data?.is_seeded ? [] : integrationReview.data?.items ?? []),
    [integrationReview.data],
  );
  const integrationReviewExportRows = useMemo<CsvRow[]>(
    () => reviewedIntegrationItems.map((item) => ({
      ID: item.id,
      Priority: item.priority,
      Integration: item.integration,
      'Integration Method': item.integration_method,
      'Current Understanding': item.current_understanding,
      'To Confirm': item.to_confirm,
      Status: item.status,
      'Meeting Notes': item.meeting_notes,
    })),
    [reviewedIntegrationItems],
  );
  const reviewedIntegrationCounts = useMemo(() => {
    return {
      total: reviewedIntegrationItems.length,
      confirmed: reviewedIntegrationItems.filter((item) => item.status === 'Confirmed').length,
      legacy: reviewedIntegrationItems.filter((item) => lowerSafe(item.status).includes('legacy')).length,
      temporary: reviewedIntegrationItems.filter((item) => lowerSafe(item.status).includes('temporary')).length,
    };
  }, [reviewedIntegrationItems]);

  const licenseSkuExportRows = useMemo<CsvRow[]>(
    () => (licSkus.data ?? []).map((item) => ({
      SKU: item.sku_display_name || item.sku_part_number,
      Purchased: item.purchased,
      Consumed: item.consumed,
      Available: item.available,
      Utilisation: `${formatPercent(item.utilization_pct, 0)}${item.is_payg ? ' PAYG' : ''}`,
      Underutilised: item.is_payg ? 'N/A PAYG' : item.is_underutilized ? 'Yes' : 'No',
    })),
    [licSkus.data],
  );

  const portfolioExportRows = useMemo<CsvRow[]>(
    () => (portfolio.data ?? []).map((item) => ({
      Application: item.app_name,
      Purpose: item.purpose ?? '',
      'Business Owner': item.business_owner ?? '',
      'Technical Owner': item.technical_owner ?? '',
      Criticality: item.criticality ?? '',
      Status: item.status ?? '',
      'Future State': item.future_state ?? '',
      'Monthly Cost': item.monthly_cost != null ? formatCurrency(item.monthly_cost) : '',
      'Known Risks': item.known_risks ?? '',
    })),
    [portfolio.data],
  );

  const challengeExportRows = useMemo<CsvRow[]>(
    () => (challenges.data ?? []).map((item) => ({
      ID: item.challenge_id ?? '',
      Challenge: item.title,
      Impact: item.impact_level,
      Category: item.category ?? '',
      'Primary Effect': item.primary_effect ?? '',
      'Evidence Sources': item.evidence_sources?.join('; ') ?? '',
      'Capability Opportunities': item.capability_opportunities?.join('; ') ?? '',
      Description: item.description ?? '',
    })),
    [challenges.data],
  );

  const recommendationExportRows = useMemo<CsvRow[]>(
    () => tailoredRecommendations.map((item) => ({
      ID: item.recommendation_id ?? '',
      Recommendation: item.title,
      Priority: item.priority,
      Type: item.recommendation_type ?? '',
      Category: item.category ?? '',
      'Primary Outcome': item.primary_outcome ?? '',
      'Evidence Sources': item.evidence_sources?.join('; ') ?? '',
      Validation: item.validation_status ?? '',
      Manual: item.manual_entry ? 'Yes' : 'No',
      'Why it matters': item.tailored_why_it_matters ?? item.why_it_matters ?? '',
      'Practical next step': item.tailored_practical_next_step ?? item.practical_next_step ?? '',
    })),
    [tailoredRecommendations],
  );

  const initiativeExportRows = useMemo<CsvRow[]>(
    () => (initiatives.data ?? []).map((item) => ({
      Initiative: item.name,
      Description: item.description ?? '',
      Priority: item.priority,
      Status: item.status,
      Category: item.category ?? '',
      'Target Quarter': item.target_quarter ?? '',
      'Effort (weeks)': item.estimated_effort_weeks ?? '',
      'Est. Saving': item.estimated_cost_saving != null ? formatCurrency(item.estimated_cost_saving) : '',
      'Deprecation aligned': item.deprecation_aligned ? 'Yes' : 'No',
    })),
    [initiatives.data],
  );

  const applicationsDiscoveryExportRows = useMemo<CsvRow[]>(
    () => applicationDiscoverySummary.allRows.map((item) => ({
      Subscription: item.subscriptionName,
      'Subscription ID': item.subscriptionId,
      'Resource Group': item.resourceGroup,
      Archetype: item.profile.archetype,
      Confidence: `${item.profile.confidence}%`,
      'Avg Monthly Spend': formatCurrency(item.avgMonthly),
      'Spend Share': `${item.spendSharePct.toFixed(1)}%`,
      'Purpose Summary': item.profile.purposeSummary,
      'Business Description': item.annotation?.business_description ?? '',
      'Owning Department': item.annotation?.owning_department ?? '',
    })),
    [applicationDiscoverySummary.allRows],
  );

  const subscriptionExportRows = useMemo<CsvRow[]>(
    () => (subscriptions.data ?? []).map((item) => ({
      'Subscription Name': item.display_name,
      'Subscription ID': item.subscription_id,
      State: item.state,
      'Tenant ID': item.tenant_id,
    })),
    [subscriptions.data],
  );

  const resourceGroupExportRows = useMemo<CsvRow[]>(
    () => (resourceGroups.data ?? []).map((item) => ({
      'Resource Group': item.name,
      Location: item.location,
      Resources: item.resource_count,
      Subscription: resolveSubscriptionName(undefined, item.subscription_id, subNameMap),
      State: item.provisioning_state || 'Succeeded',
    })),
    [resourceGroups.data, subNameMap],
  );

  const resourceTypeExportRows = useMemo<CsvRow[]>(
    () => resourcesByType.map(([type, count]) => ({
      'Resource Type': shortType(type),
      Count: count,
      '% of Total': invSummary.data ? formatPercent((count / invSummary.data.total_resources) * 100, 1) : '',
    })),
    [invSummary.data, resourcesByType],
  );

  const databaseExportRows = useMemo<CsvRow[]>(
    () => (databases.data ?? []).map((item) => ({
      Name: item.resource_name,
      Type: item.database_type,
      'SKU Tier': item.sku_tier ?? '',
      'Size (GB)': item.current_size_gb?.toFixed(1) ?? item.max_size_gb?.toFixed(1) ?? '',
      Status: item.status,
      'Resource Group': item.resource_group,
    })),
    [databases.data],
  );

  const costTrendExportRows = useMemo<CsvRow[]>(
    () => (costSummary.data?.by_month ?? []).map((item) => ({
      Month: item.month,
      Spend: formatCurrency(item.amount),
    })),
    [costSummary.data?.by_month],
  );

  const costExportRows = useMemo(
    () => buildCostExportRows({
      costBySubscription: costBySub.data ?? [],
      costByResourceGroup: costByRG.data ?? [],
      costByResourceType: costByType.data ?? [],
      costByResource: costByResource.data ?? [],
      subscriptionNames: subNameMap,
      inventoryResourceCountBySubscription,
      resourceGroups: resourceGroups.data ?? [],
      subscriptions: subscriptions.data ?? [],
    }, {
      byResource: false,
      allResourcesWithCost: false,
    }),
    [
      costByRG.data,
      costByResource.data,
      costBySub.data,
      costByType.data,
      inventoryResourceCountBySubscription,
      resourceGroups.data,
      subNameMap,
      subscriptions.data,
    ],
  );

  const costBySubscriptionExportRows = costExportRows.bySubscription;
  const costByResourceGroupExportRows = costExportRows.byResourceGroup;
  const costByResourceTypeExportRows = costExportRows.byResourceType;
  const topCostDriverExportRows = costExportRows.topCostDrivers;

  const defenderScoreExportRows = useMemo<CsvRow[]>(
    () => (defender.data?.scores ?? []).map((item) => ({
      Subscription: resolveSubscriptionName(item.subscription_name, undefined, subNameMap),
      'Current Score': item.current_score.toFixed(1),
      'Max Score': item.max_score.toFixed(1),
      Percentage: formatPercent(item.percentage, 0),
    })),
    [defender.data?.scores, subNameMap],
  );

  const advisorScoreExportRows = useMemo<CsvRow[]>(
    () => (advisorScores.data?.aggregated_scores ?? [])
      .filter((item) => !looksLikeId(item.pillar))
      .map((item) => ({
        Pillar: readablePillar(item.pillar),
        Score: item.score.toFixed(1),
        Percentage: formatPercent(item.percentage, 0),
        'Potential Improvement': item.potential_score_increase != null && item.potential_score_increase > 0 ? `+${item.potential_score_increase.toFixed(1)}` : '',
      })),
    [advisorScores.data?.aggregated_scores],
  );

  const rbacByRoleExportRows = useMemo<CsvRow[]>(
    () => Object.entries(govRbac.data?.by_role ?? {}).sort((a, b) => b[1] - a[1]).map(([role, count]) => ({
      Role: role,
      Count: count,
    })),
    [govRbac.data?.by_role],
  );

  const rbacByPrincipalTypeExportRows = useMemo<CsvRow[]>(
    () => Object.entries(govRbac.data?.by_principal_type ?? {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({
      'Principal Type': type,
      Count: count,
    })),
    [govRbac.data?.by_principal_type],
  );

  const dynamicsEnvironmentExportRows = useMemo<CsvRow[]>(
    () => (d365Envs.data ?? []).map((item) => ({
      Name: item.display_name,
      'Environment Type': item.environment_type,
      Region: item.region,
      State: item.state,
      'DB Used (MB)': item.database_capacity_used_mb?.toLocaleString() ?? '',
      'DB Allocated (MB)': item.database_capacity_allocated_mb?.toLocaleString() ?? '',
      URL: item.url ?? '',
    })),
    [d365Envs.data],
  );

  const dynamicsUsersExportRows = useMemo<CsvRow[]>(
    () => (d365Users.data ?? []).map((item) => ({
      Name: item.display_name ?? item.full_name ?? '',
      Email: item.email ?? '',
      Environment: environmentLabel(item.environment),
      Roles: (item.roles ?? item.security_roles ?? []).join('; '),
      'Business Unit': item.business_unit ?? '',
      Disabled: item.is_disabled ? 'Yes' : 'No',
      'Active 30d': item.is_active_30d == null ? 'Unknown' : item.is_active_30d ? 'Yes' : 'No',
    })),
    [d365Users.data],
  );

  const dynamicsModulesExportRows = useMemo<CsvRow[]>(
    () => (d365Modules.data ?? []).map((item) => ({
      Module: item.module,
      Entity: item.entity_name,
      'Record Count': item.record_count?.toLocaleString() ?? '',
      Environment: item.environment_id,
    })),
    [d365Modules.data],
  );

  const dynamicsWorkflowExportRows = useMemo<CsvRow[]>(
    () => (d365Workflows.data ?? []).map((item) => ({
      Workflow: item.workflow_name ?? item.name,
      State: item.state,
      Status: item.status,
      'Success Rate': item.success_rate != null ? formatPercent(item.success_rate, 0) : '',
      'Total Runs': item.total_runs ?? '',
      Environment: item.environment_id,
    })),
    [d365Workflows.data],
  );

  const dynamicsBusinessCentralExportRows = useMemo<CsvRow[]>(
    () => (d365BC.data ?? []).map((item) => ({
      Company: item.company_name,
      Customers: item.customers_count?.toLocaleString() ?? '',
      Vendors: item.vendors_count?.toLocaleString() ?? '',
      Items: item.items_count?.toLocaleString() ?? '',
      'GL Entries': item.gl_entries_count?.toLocaleString() ?? '',
      Environment: item.environment_id,
    })),
    [d365BC.data],
  );

  const dynamicsLinkIntegrationExportRows = useMemo<CsvRow[]>(
    () => dynamicsIntegrationRows.map((item) => ({
      Integration: item.name,
      Source: item.source_system ?? item.source_resource_name ?? '',
      Target: item.target_system ?? item.target_name ?? '',
      Type: item.integration_type,
      Status: item.health_status ?? 'Not monitored',
    })),
    [dynamicsIntegrationRows],
  );

  const dynamicsLinkCostExportRows = useMemo<CsvRow[]>(
    () => dynamicsCostRows.map((item) => ({
      Resource: item.resource_name,
      Type: shortType(item.resource_type),
      '1-Month': formatCurrency(item.cost_1m ?? 0),
      '3-Month': formatCurrency(item.cost_3m ?? 0),
      '6-Month': formatCurrency(item.cost_6m ?? 0),
    })),
    [dynamicsCostRows],
  );

  const stakeholderExportRows = useMemo<CsvRow[]>(
    () => (stakeholders.data ?? []).map((item) => ({
      Stakeholder: item.stakeholder_name,
      Role: item.role ?? '',
      Department: item.department ?? '',
      Date: item.interview_date ? formatDate(item.interview_date) : '',
      'Key Findings': item.key_findings ?? '',
      'Pain Points': item.pain_points ?? '',
      Notes: item.notes ?? '',
      Validation: item.validation_status ?? '',
    })),
    [stakeholders.data],
  );

  const frameworkWafExportRows = useMemo<CsvRow[]>(
    () => Object.values(framework.data?.waf_pillars ?? {}).sort((a, b) => a.score - b.score).map((item) => ({
      Pillar: item.name,
      Score: formatPercent(item.score, 0),
      Findings: item.findings.length,
      'Future-phase Opportunities': item.phase2_opportunities.length,
      Description: item.description,
    })),
    [framework.data?.waf_pillars],
  );

  const frameworkFindingExportRows = useMemo<CsvRow[]>(
    () => Object.values(framework.data?.waf_pillars ?? {})
      .flatMap((pillar) => pillar.findings.map((finding) => ({
        Pillar: pillar.name,
        Source: finding.source,
        Subscription: finding.subscription_name ?? '',
        Detail: finding.detail,
        'Checklist Ref': finding.checklist_ref,
      }))),
    [framework.data?.waf_pillars],
  );

  const frameworkCafExportRows = useMemo<CsvRow[]>(
    () => Object.values(framework.data?.caf_methodologies ?? {}).sort((a, b) => a.maturity - b.maturity).map((item) => ({
      Methodology: item.name,
      Maturity: `${item.maturity.toFixed(1)} / 5`,
      Label: item.maturity_label,
      Signals: item.signals.join('; '),
      Description: item.description,
    })),
    [framework.data?.caf_methodologies],
  );

  const phase2OpportunityExportRows = useMemo<CsvRow[]>(
    () => (framework.data?.phase2_summary ?? []).map((item) => ({
      Title: item.title,
      Description: item.description,
      Pillar: item.pillar ?? '',
      Reference: item.ref,
    })),
    [framework.data?.phase2_summary],
  );

  const costSummaryExportRows = useMemo<CsvRow[]>(
    () =>
      costSummary.data
        ? [{
            '1-Month Total': formatCurrency(costSummary.data.total_cost_1m ?? costSummary.data.total ?? 0),
            '3-Month Total': formatCurrency(costSummary.data.total_cost_3m ?? 0),
            '6-Month Total': formatCurrency(costSummary.data.total_cost_6m ?? 0),
            Trend: `${trendIcon(costSummary.data.overall_trend)} ${titleCase(costSummary.data.overall_trend)}${costSummary.data.trend_percent != null ? ` (${costSummary.data.trend_percent > 0 ? '+' : ''}${costSummary.data.trend_percent.toFixed(1)}%)` : ''}`,
          }]
        : [],
    [costSummary.data],
  );

  const defenderControlsExportRows = useMemo<CsvRow[]>(
    () => (defender.data?.controls ?? []).map((item) => ({
      Control: looksLikeId(item.name) ? titleCase(item.name.split('/').pop() ?? item.name) : item.name,
      Subscription: resolveSubscriptionName(undefined, item.subscription_id, subNameMap),
      Score: item.current_score.toFixed(1),
      Max: item.max_score.toFixed(1),
      Percentage: formatPercent(item.percentage, 0),
      Healthy: item.healthy_count,
      Unhealthy: item.unhealthy_count,
      'Not Applicable': item.not_applicable_count,
    })),
    [defender.data?.controls, subNameMap],
  );

  const challengeCapabilityExportRows = useMemo<CsvRow[]>(
    () =>
      tailoredChallenges
        .filter((item) => (item.capability_opportunities?.length ?? 0) > 0)
        .map((item) => ({
          Challenge: [item.challenge_id, item.title].filter(Boolean).join(' '),
          'Capability Opportunities': item.tailored_capability_opportunities?.join('; ') ?? '',
          'Why it matters': item.tailored_why_it_matters ?? '',
          Description: item.tailored_description ?? '',
        })),
    [tailoredChallenges],
  );

  const recommendationDetailExportRows = useMemo<CsvRow[]>(
    () =>
      tailoredRecommendations.map((item) => ({
        Recommendation: [item.recommendation_id, item.title].filter(Boolean).join(' '),
        Priority: item.priority,
        Category: item.category ?? '',
        'Evidence Breadth': item.reinforcement_level ?? '',
        Description: item.tailored_description ?? '',
        'Why it matters': item.tailored_why_it_matters ?? '',
        'Practical next step': item.tailored_practical_next_step ?? '',
        Notes: item.notes ?? '',
      })),
    [tailoredRecommendations],
  );

  const appendixSubsectionRows = useMemo<Partial<Record<ReportVisibilityId, CsvRow[]>>>(() => ({
    'rpt-inventory-interpretation': [{ Summary: interpretInventorySection(invSummary.data, resourceGroups.data, resources.data) }],
    'rpt-inventory-subscriptions': subscriptionExportRows,
    'rpt-inventory-resource-groups': resourceGroupExportRows,
    'rpt-inventory-resource-types': resourceTypeExportRows,
    'rpt-inventory-databases': databaseExportRows,
    'rpt-costs-interpretation': [{ Summary: interpretCostSection(costSummary.data, costBySub.data, costByType.data, subNameMap) }],
    'rpt-costs-summary': costSummaryExportRows,
    'rpt-costs-monthly-trend': costTrendExportRows,
    'rpt-costs-subscription': costBySubscriptionExportRows,
    'rpt-costs-resource-group': costByResourceGroupExportRows,
    'rpt-costs-resource-type': costByResourceTypeExportRows,
    'rpt-costs-drivers': topCostDriverExportRows,
    'rpt-security-interpretation': [{ Summary: interpretSecuritySection(defender.data, advisorScores.data, cspmInsights.data) }],
    'rpt-security-defender': defenderScoreExportRows,
    'rpt-security-controls': defenderControlsExportRows,
    'rpt-security-advisor-scores': advisorScoreExportRows,
    'rpt-security-advisor-recommendations': advisorRecommendationExportRows,
    'rpt-security-exposure-signals': [
      ...securityExposureAssessmentData.map((item) => ({ 'Signal Type': 'Unhealthy assessments', Subscription: item.name, Count: item.value })),
      ...securityExposureAttackPathData.map((item) => ({ 'Signal Type': 'Attack paths', Subscription: item.name, Count: item.value })),
    ],
    'rpt-governance-interpretation': [{ Summary: interpretGovernanceSection(govPolicy.data, govRbac.data, govOrphans.data) }],
    'rpt-governance-policy': governancePolicyExportRows,
    'rpt-governance-rbac': rbacByRoleExportRows,
    'rpt-governance-orphans': orphanedResourceExportRows,
    'rpt-governance-actions': recommendedActions
      .filter((item) => item.category === 'Governance')
      .map((item) => ({ Priority: item.priority, Action: item.action, Rationale: item.rationale })),
    'rpt-integrations-interpretation': [{ Summary: interpretIntegrationSection(intSummary.data, intList.data) }],
    'rpt-integrations-by-type': Object.entries(intSummary.data?.by_type ?? {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ 'Integration Type': type, Count: count })),
    'rpt-integrations-register': integrationRegisterExportRows,
    'rpt-integrations-recommendations': (intRecs.data ?? []).map((item) => ({ Priority: item.priority, Title: item.title, Description: item.description })),
    'rpt-integrations-complexity': [
      { Metric: 'Mapped integrations', Value: intSummary.data?.total_integrations ?? 0 },
      { Metric: 'Deprecated paths', Value: intSummary.data?.deprecated_count ?? 0 },
      { Metric: 'Unresolved endpoints', Value: (intList.data ?? []).filter((item) => !item.target_system || item.target_system === 'Unknown target').length },
    ],
    'rpt-integrationmap-diagram': [],
    'rpt-integrationmap-shortlist': integrationReviewExportRows,
    'rpt-dynamics-interpretation': [{ Summary: interpretDynamicsSection(d365Envs.data, d365Modules.data, d365Workflows.data, dynamicsManualContext.data) }],
    'rpt-dynamics-footprint': [
      { Metric: 'Discovered environments', Value: d365Envs.data?.length ?? 0 },
      { Metric: 'Returned users', Value: d365Users.data?.length ?? 0 },
      { Metric: 'Returned solutions/modules', Value: d365Modules.data?.length ?? 0 },
      { Metric: 'Returned workflows', Value: d365Workflows.data?.length ?? 0 },
      { Metric: 'Likely Dynamics integrations', Value: dynamicsIntegrationRows.length },
      { Metric: 'Matched monthly spend', Value: formatCurrency(dynamicsLinkedMonthlySpend) },
    ],
    'rpt-dynamics-environments': dynamicsEnvironmentExportRows,
    'rpt-dynamics-users': dynamicsUsersExportRows,
    'rpt-dynamics-modules': dynamicsModulesExportRows,
    'rpt-dynamics-workflows': dynamicsWorkflowExportRows,
    'rpt-dynamics-bc': dynamicsBusinessCentralExportRows,
    'rpt-dynamics-linkage': [...dynamicsLinkIntegrationExportRows, ...dynamicsLinkCostExportRows],
    'rpt-licenses-interpretation': [{ Summary: interpretLicenseSection(licSummary.data) }],
    'rpt-licenses-sku': licenseSkuExportRows,
    'rpt-licenses-users': licUsers.data ? licUsers.data.map((u) => ({
      User: u.display_name,
      UPN: u.user_principal_name,
      Licenses: u.assigned_licenses.length,
      'Last Sign-In': u.last_sign_in ? formatDate(u.last_sign_in) : '—',
      'Inactive 30d': u.is_inactive_30d == null ? '—' : u.is_inactive_30d ? 'Yes' : 'No',
      'Est. Monthly Cost': u.estimated_monthly_cost != null ? formatCurrency(u.estimated_monthly_cost) : '—',
    })) : [],
    'rpt-portfolio-interpretation': [{ Summary: interpretPortfolioSection(portfolio.data) }],
    'rpt-applications-discovery': applicationDiscoverySummary.topRows.map((item) => ({
      Subscription: item.subscriptionName,
      'Resource Group': item.resourceGroup,
      Archetype: item.profile.archetype,
      Confidence: `${item.profile.confidence}%`,
      'Avg Monthly Spend': formatCurrency(item.avgMonthly),
      'Business Description': item.annotation?.business_description ?? '',
      'Owning Department': item.annotation?.owning_department ?? '',
    })),
    'rpt-applications-discovery-register': applicationsDiscoveryExportRows,
    'rpt-challenges-themes': [{ Summary: summarizeChallengeThemes(challenges.data) }],
    'rpt-challenges-capabilities': challengeCapabilityExportRows,
    'rpt-recommendations-themes': [{ Summary: summarizeRecommendationThemes(recommendations.data) }],
    'rpt-recommendations-detail': recommendationDetailExportRows,
    'rpt-initiatives-interpretation': [{ Summary: interpretInitiativesSection(initiatives.data) }],
    'rpt-stakeholders-synthesis': [{ Summary: synthesizeStakeholders(stakeholders.data) }],
    'rpt-framework-interpretation': [{ Summary: interpretFrameworkSection(framework.data) }],
    'rpt-framework-waf': frameworkWafExportRows,
    'rpt-framework-findings': frameworkFindingExportRows,
    'rpt-framework-caf': frameworkCafExportRows,
    'rpt-framework-phase2': phase2OpportunityExportRows,
  }), [
    applicationDiscoverySummary.topRows,
    applicationsDiscoveryExportRows,
    challenges.data,
    costByRG.data,
    cspmInsights.data,
    d365Envs.data,
    d365Modules.data,
    d365Users.data,
    d365Workflows.data,
    dynamicsIntegrationRows.length,
    dynamicsLinkedMonthlySpend,
    dynamicsManualContext.data,
    framework.data,
    govOrphans.data,
    govPolicy.data,
    govRbac.data,
    initiatives.data,
    intList.data,
    licSummary.data,
    portfolio.data,
    recommendations.data,
    resources.data,
    securityExposureAssessmentData,
    securityExposureAttackPathData,
    stakeholders.data,
    subscriptionExportRows,
    resourceGroupExportRows,
    resourceTypeExportRows,
    databaseExportRows,
    costSummaryExportRows,
    costTrendExportRows,
    costBySubscriptionExportRows,
    costByResourceGroupExportRows,
    costByResourceTypeExportRows,
    topCostDriverExportRows,
    defenderScoreExportRows,
    defenderControlsExportRows,
    advisorScoreExportRows,
    advisorRecommendationExportRows,
    governancePolicyExportRows,
    rbacByRoleExportRows,
    orphanedResourceExportRows,
    intSummary.data?.by_type,
    integrationRegisterExportRows,
    intRecs.data,
    dynamicsEnvironmentExportRows,
    dynamicsUsersExportRows,
    dynamicsModulesExportRows,
    dynamicsWorkflowExportRows,
    dynamicsBusinessCentralExportRows,
    dynamicsLinkIntegrationExportRows,
    dynamicsLinkCostExportRows,
    licenseSkuExportRows,
    licUsers.data,
    challengeCapabilityExportRows,
    recommendationDetailExportRows,
    frameworkWafExportRows,
    frameworkFindingExportRows,
    frameworkCafExportRows,
    phase2OpportunityExportRows,
  ]);

  const recommendedActionExportRows = useMemo<CsvRow[]>(
    () => recommendedActions.map((item, index) => ({
      '#': index + 1,
      Priority: item.priority,
      Category: item.category,
      Action: replaceSubscriptionIdsInText(item.action, subNameMap),
      Rationale: replaceSubscriptionIdsInText(item.rationale, subNameMap),
    })),
    [recommendedActions, subNameMap],
  );

  const actionCsvExports = useMemo(
    () => [
      { label: 'Recommendations', fileName: `${filePrefix}-strategic-recommendations`, rows: recommendationExportRows },
      { label: 'Challenges', fileName: `${filePrefix}-cross-organisation-challenges`, rows: challengeExportRows },
      { label: 'Initiatives', fileName: `${filePrefix}-strategic-initiatives`, rows: initiativeExportRows },
      { label: 'Advisor recommendations', fileName: `${filePrefix}-azure-advisor-recommendations`, rows: advisorRecommendationExportRows },
      { label: 'Policy compliance', fileName: `${filePrefix}-governance-policy-compliance`, rows: governancePolicyExportRows },
      { label: 'Orphaned resources', fileName: `${filePrefix}-orphaned-resources`, rows: orphanedResourceExportRows },
      { label: 'Integration register', fileName: `${filePrefix}-integration-register`, rows: integrationRegisterExportRows },
      { label: 'License SKU detail', fileName: `${filePrefix}-license-sku-detail`, rows: licenseSkuExportRows },
      { label: 'Application portfolio', fileName: `${filePrefix}-application-portfolio`, rows: portfolioExportRows },
      { label: 'Recommended actions', fileName: `${filePrefix}-recommended-actions`, rows: recommendedActionExportRows },
    ],
    [
      advisorRecommendationExportRows,
      challengeExportRows,
      filePrefix,
      governancePolicyExportRows,
      initiativeExportRows,
      integrationRegisterExportRows,
      licenseSkuExportRows,
      orphanedResourceExportRows,
      portfolioExportRows,
      recommendedActionExportRows,
      recommendationExportRows,
    ],
  );

  const referenceCsvExports = useMemo(
    () => [
      { label: 'Subscriptions', fileName: `${filePrefix}-subscriptions`, rows: subscriptionExportRows },
      { label: 'Resource groups', fileName: `${filePrefix}-resource-groups`, rows: resourceGroupExportRows },
      { label: 'Resources by type', fileName: `${filePrefix}-resources-by-type`, rows: resourceTypeExportRows },
      { label: 'Databases', fileName: `${filePrefix}-databases`, rows: databaseExportRows },
      { label: 'Cost trend', fileName: `${filePrefix}-monthly-cost-trend`, rows: costTrendExportRows },
      { label: 'Cost by subscription', fileName: `${filePrefix}-cost-by-subscription`, rows: costBySubscriptionExportRows },
      { label: 'Cost by resource group', fileName: `${filePrefix}-cost-by-resource-group`, rows: costByResourceGroupExportRows },
      { label: 'Cost by resource type', fileName: `${filePrefix}-cost-by-resource-type`, rows: costByResourceTypeExportRows },
      { label: 'Top cost drivers', fileName: `${filePrefix}-top-cost-drivers`, rows: topCostDriverExportRows },
      { label: 'Defender scores', fileName: `${filePrefix}-defender-scores`, rows: defenderScoreExportRows },
      {
        label: 'Defender controls',
        fileName: `${filePrefix}-defender-control-breakdown`,
        rows: (defender.data?.controls ?? []).map((item) => ({
          Control: looksLikeId(item.name) ? titleCase(item.name.split('/').pop() ?? item.name) : item.name,
          Subscription: resolveSubscriptionName(undefined, item.subscription_id, subNameMap),
          Score: item.current_score.toFixed(1),
          Max: item.max_score.toFixed(1),
          Percentage: formatPercent(item.percentage, 0),
          Healthy: item.healthy_count,
          Unhealthy: item.unhealthy_count,
          'Not Applicable': item.not_applicable_count,
        })),
      },
      { label: 'Advisor scores', fileName: `${filePrefix}-advisor-scores`, rows: advisorScoreExportRows },
      { label: 'RBAC by role', fileName: `${filePrefix}-rbac-by-role`, rows: rbacByRoleExportRows },
      { label: 'RBAC by principal type', fileName: `${filePrefix}-rbac-by-principal-type`, rows: rbacByPrincipalTypeExportRows },
      { label: 'Dynamics environments', fileName: `${filePrefix}-dynamics-environments`, rows: dynamicsEnvironmentExportRows },
      { label: 'Dynamics users', fileName: `${filePrefix}-dynamics-users`, rows: dynamicsUsersExportRows },
      { label: 'Dynamics modules', fileName: `${filePrefix}-dynamics-modules`, rows: dynamicsModulesExportRows },
      { label: 'Dynamics workflows', fileName: `${filePrefix}-dynamics-workflows`, rows: dynamicsWorkflowExportRows },
      { label: 'Business Central', fileName: `${filePrefix}-business-central`, rows: dynamicsBusinessCentralExportRows },
      { label: 'Dynamics linkage integrations', fileName: `${filePrefix}-dynamics-linked-integrations`, rows: dynamicsLinkIntegrationExportRows },
      { label: 'Dynamics linkage costs', fileName: `${filePrefix}-dynamics-linked-costs`, rows: dynamicsLinkCostExportRows },
      {
        label: 'License users',
        fileName: `${filePrefix}-licensed-users`,
        rows: (licUsers.data ?? []).map((item) => ({
          User: item.display_name,
          UPN: item.user_principal_name,
          Licenses: item.assigned_licenses.length,
          'Last Sign-In': item.last_sign_in ? formatDate(item.last_sign_in) : '',
          'Inactive 30d': item.is_inactive_30d == null ? '' : item.is_inactive_30d ? 'Yes' : 'No',
          'Est. Monthly Cost': item.estimated_monthly_cost != null ? formatCurrency(item.estimated_monthly_cost) : '',
        })),
      },
      { label: 'Stakeholder interviews', fileName: `${filePrefix}-stakeholder-interviews`, rows: stakeholderExportRows },
      { label: 'WAF pillars', fileName: `${filePrefix}-waf-pillars`, rows: frameworkWafExportRows },
      { label: 'WAF findings', fileName: `${filePrefix}-waf-findings`, rows: frameworkFindingExportRows },
      { label: 'CAF maturity', fileName: `${filePrefix}-caf-maturity`, rows: frameworkCafExportRows },
      { label: 'Future-phase opportunities', fileName: `${filePrefix}-future-phase-opportunities`, rows: phase2OpportunityExportRows },
    ],
    [
      advisorScoreExportRows,
      costByResourceGroupExportRows,
      costByResourceTypeExportRows,
      costBySubscriptionExportRows,
      costTrendExportRows,
      databaseExportRows,
      defender.data?.controls,
      defenderScoreExportRows,
      dynamicsBusinessCentralExportRows,
      dynamicsEnvironmentExportRows,
      dynamicsLinkCostExportRows,
      dynamicsLinkIntegrationExportRows,
      dynamicsModulesExportRows,
      dynamicsUsersExportRows,
      dynamicsWorkflowExportRows,
      filePrefix,
      frameworkCafExportRows,
      frameworkFindingExportRows,
      frameworkWafExportRows,
      licUsers.data,
      phase2OpportunityExportRows,
      rbacByPrincipalTypeExportRows,
      rbacByRoleExportRows,
      resourceGroupExportRows,
      resourceTypeExportRows,
      stakeholderExportRows,
      subNameMap,
      subscriptionExportRows,
      topCostDriverExportRows,
    ],
  );

  const executiveDeliverableRows = useMemo(
    () => [
      {
        name: 'Deliverable 1. Azure Inventory and Estate Baseline',
        picture: `${invSummary.data?.total_subscriptions ?? 0} subscriptions, ${invSummary.data?.total_resources?.toLocaleString() ?? '0'} resources, ${databases.data?.length ?? 0} databases.`,
        exportRows: referenceCsvExports.filter((item) =>
          ['Subscriptions', 'Resource groups', 'Resources by type', 'Databases'].includes(item.label),
        ),
      },
      {
        name: 'Deliverable 2. Cost Analysis',
        picture: `${costSummary.data ? formatCurrency(costSummary.data.total_cost_1m ?? costSummary.data.total ?? 0) : 'N/A'} latest month and ${costSummary.data ? formatCurrency(costSummary.data.total_cost_6m ?? 0) : 'N/A'} across six months.`,
        exportRows: referenceCsvExports.filter((item) =>
          ['Cost trend', 'Cost by subscription', 'Cost by resource group', 'Cost by resource type', 'Top cost drivers'].includes(item.label),
        ),
      },
      {
        name: 'Deliverable 3. Dynamics 365 Platform',
        picture: `${d365Envs.data?.length ?? 0} environments currently visible to the assessment.`,
        exportRows: referenceCsvExports.filter((item) =>
          ['Dynamics environments', 'Dynamics users', 'Dynamics modules', 'Dynamics workflows', 'Business Central', 'Dynamics linkage integrations', 'Dynamics linkage costs'].includes(item.label),
        ),
      },
      {
        name: 'Deliverable 4. Integration Landscape',
        picture: `${intSummary.data?.total_integrations ?? 0} discovered integration points in the current baseline.`,
        exportRows: actionCsvExports.filter((item) => item.label === 'Integration register'),
      },
      {
        name: 'Deliverable 5. Security Posture',
        picture: `${defender.data ? formatPercent(defender.data.overall_percentage, 0) : 'N/A'} secure score across the assessed subscriptions.`,
        exportRows: [
          ...actionCsvExports.filter((item) => item.label === 'Advisor recommendations'),
          ...referenceCsvExports.filter((item) =>
            ['Defender scores', 'Defender controls', 'Advisor scores'].includes(item.label),
          ),
        ],
      },
      {
        name: 'Deliverable 6. Governance and Operational Control',
        picture: `${govPolicy.data?.total_non_compliant_resources ?? 0} non-compliant resources and ${govRbac.data?.total_count ?? 0} role assignments.`,
        exportRows: [
          ...actionCsvExports.filter((item) =>
            ['Policy compliance', 'Orphaned resources'].includes(item.label),
          ),
          ...referenceCsvExports.filter((item) =>
            ['RBAC by role', 'RBAC by principal type'].includes(item.label),
          ),
        ],
      },
      {
        name: 'Deliverable 7. Applications and Portfolio',
        picture: `${portfolio.data?.length ?? 0} portfolio entries and ${applicationDiscoverySummary.totalGroups ?? 0} discovered application groups.`,
        exportRows: actionCsvExports.filter((item) => item.label === 'Application portfolio'),
      },
    ],
    [
      actionCsvExports,
      applicationDiscoverySummary.totalGroups,
      costSummary.data,
      d365Envs.data?.length,
      databases.data?.length,
      defender.data,
      govPolicy.data?.total_non_compliant_resources,
      govRbac.data?.total_count,
      intSummary.data?.total_integrations,
      invSummary.data?.total_resources,
      invSummary.data?.total_subscriptions,
      portfolio.data?.length,
      referenceCsvExports,
    ],
  );

  const executiveConcentratedSubscriptions = useMemo(
    () =>
      (subscriptions.data ?? [])
        .map((item) => {
          const subscriptionId = item.subscription_id?.trim() ?? '';
          const groups = (resourceGroups.data ?? []).filter((group) => group.subscription_id?.trim() === subscriptionId);
          const resourcesCount = groups.reduce((sum, group) => sum + (group.resource_count ?? 0), 0);
          return {
            Subscription: item.display_name,
            'Resource Groups': groups.length,
            Resources: resourcesCount,
          };
        })
        .filter((item) => item.Resources > 0 || item['Resource Groups'] > 0)
        .sort((a, b) => {
          if (b.Resources !== a.Resources) return b.Resources - a.Resources;
          return b['Resource Groups'] - a['Resource Groups'];
        })
        .slice(0, 8),
    [resourceGroups.data, subscriptions.data],
  );

  const executiveHighestSpendSubscriptions = useMemo(
    () =>
      (costBySub.data ?? [])
        .map((item) => ({
          Subscription: resolveSubscriptionName(item.subscription_name, item.group_key, subNameMap),
          'Last Month': formatCurrency(item.cost_1m ?? 0),
          Trend: titleCase(item.trend ?? 'Unknown'),
          _sort: item.cost_1m ?? 0,
        }))
        .sort((a, b) => b._sort - a._sort)
        .slice(0, 6)
        .map(({ _sort, ...row }) => row),
    [costBySub.data, subNameMap],
  );

  const executiveRoleSummaryRows = useMemo(
    () =>
      Object.entries(govRbac.data?.by_role ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([role, count]) => ({
          Role: role,
          Assignments: count,
        })),
    [govRbac.data?.by_role],
  );

  const executiveSecurityCategoryRows = useMemo(
    () =>
      Object.entries(
        (advisorRecs.data ?? []).reduce<Record<string, number>>((acc, item) => {
          const key = readablePillar(item.category ?? 'Other');
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([category, count]) => ({
          Category: category,
          Recommendations: count,
        })),
    [advisorRecs.data],
  );

  const executivePriorityRecommendationRows = useMemo(
    () =>
      (recommendations.data ?? [])
        .slice(0, 5)
        .map((item) => ({
          Recommendation: item.title,
          Priority: item.priority,
          Outcome: item.primary_outcome ?? '-',
        })),
    [recommendations.data],
  );

  const executiveInitiativeRows = useMemo(
    () =>
      (initiatives.data ?? [])
        .slice(0, 5)
        .map((item) => ({
          Initiative: item.name,
          Priority: item.priority,
          Status: item.status,
        })),
    [initiatives.data],
  );

  const executiveAnnualRunRate = useMemo(
    () => (costSummary.data ? (costSummary.data.total_cost_1m ?? costSummary.data.total ?? 0) * 12 : 0),
    [costSummary.data],
  );

  const executiveSecurityRecommendationSummary = useMemo(
    () => ({
      high: (advisorRecs.data ?? []).filter((item) => item.impact === 'High').length,
      medium: (advisorRecs.data ?? []).filter((item) => item.impact === 'Medium').length,
      low: (advisorRecs.data ?? []).filter((item) => item.impact === 'Low').length,
    }),
    [advisorRecs.data],
  );

  const executiveTopSubscriptionDrivers = useMemo(
    () => {
      const baseline = costSummary.data?.total_cost_1m ?? costSummary.data?.total ?? 0;
      return (costBySub.data ?? [])
        .map((item) => ({
          id: item.group_key || item.subscription_id || item.subscription_name || 'unknown',
          name: resolveSubscriptionName(item.subscription_name, item.group_key, subNameMap),
          amount: item.cost_1m ?? 0,
        }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((item) => ({
          ...item,
          share: baseline > 0 ? (item.amount / baseline) * 100 : 0,
        }));
    },
    [costBySub.data, costSummary.data, subNameMap],
  );

  const executiveTopTypeDrivers = useMemo(
    () => {
      const baseline = costSummary.data?.total_cost_1m ?? costSummary.data?.total ?? 0;
      return (costByType.data ?? [])
        .map((item) => ({
          name: normalizeResourceTypeName(item.group_key || 'Unknown resource type'),
          amount: item.cost_1m ?? 0,
        }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((item) => ({
          ...item,
          share: baseline > 0 ? (item.amount / baseline) * 100 : 0,
        }));
    },
    [costByType.data, costSummary.data],
  );

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <PageLayout title="Assessment Report">
      {/* Export bar */}
      <div className="rpt-toolbar">
        <button className="btn btn-primary" disabled={exporting || snapshotStatus !== 'ready'} onClick={() => exportToPdf('consolidated-report', `Cloud Assessment Workbench-Assessment-Report-${activeProfile?.customer_name ?? 'Report'}`)}>
          {exporting ? 'Opening print dialog…' : 'Print / Export PDF'}
        </button>
        <button className="btn btn-secondary" disabled={exportingWord || snapshotStatus !== 'ready'} onClick={() => exportToWord('consolidated-report', `Cloud Assessment Workbench-Assessment-Report-${activeProfile?.customer_name ?? 'Report'}`)}>
          {exportingWord ? 'Building Word document…' : 'Export to Word'}
        </button>
        <span className="rpt-ready-badge">{loadedModules} / {totalModules} modules loaded</span>
      </div>

      {snapshotStatus === 'loading' && (
        <div className="dashboard-card">
          <h3>Checking assessment snapshot</h3>
          <p className="section-note">Looking for saved assessment data for {activeProfile?.customer_name ?? 'the selected profile'}.</p>
        </div>
      )}

      {snapshotStatus === 'empty' && (
        <div className="dashboard-card">
          <h3>No assessment data for this profile yet</h3>
          <p className="section-note">
            {activeProfile?.customer_name ?? 'This profile'} does not have a saved data-pull snapshot yet, so the assessment report is intentionally hidden.
            Run a data pull for this profile before generating report narrative, metrics, findings, or recommended actions.
          </p>
          <p className="section-note">
            This prevents static report template language or another profile's evidence from being mistaken for current profile data.
          </p>
        </div>
      )}

      {snapshotStatus === 'ready' && (
      <>
      <div className="rpt-export-grid">
        <ReportCsvGroup
          title="Working deliverables"
          description="Action-oriented workbook exports aligned to the assessment scope, intended for customer teams to track remediation, planning, and follow-up work."
          actions={actionCsvExports}
          onExportAll={() => downloadCsvBundle(actionCsvExports.filter((item) => item.rows.length > 0))}
        />
        <ReportCsvGroup
          title="Reference schedules"
          description="Supporting exports for analysts and customer teams who need the underlying evidence in a spreadsheet-friendly format."
          actions={referenceCsvExports}
          onExportAll={() => downloadCsvBundle(referenceCsvExports.filter((item) => item.rows.length > 0))}
        />
      </div>

      <div key={profileId ?? 'no-profile'} id="consolidated-report" className="rpt">

        {/* ═══════════════════════════ COVER PAGE ═══════════════════════════ */}
        <section className="rpt-cover">
          <div className="rpt-cover__inner">
            <h1 className="rpt-cover__title">Azure assessment report</h1>
            <p className="rpt-cover__client">{activeProfile?.customer_name ?? 'Client Name'}</p>
            <p className="rpt-cover__phase">Discovery & Baseline</p>
            <p className="rpt-cover__date">{now}</p>
            <p className="rpt-cover__label">{reportReleaseLabel}</p>
          </div>
        </section>

        {/* ═══════════════════════════ TABLE OF CONTENTS ═══════════════════ */}
        <section className="rpt-toc">
          <h2 className="rpt-toc__heading">Table of contents</h2>
          <ol className="rpt-toc__list">
            {visibleToc.map(item => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="rpt-toc__link">
                  <span className="rpt-toc__num">{item.num}.</span>
                  <span className="rpt-toc__text">{item.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        {reportNavSections.length > 0 && <SectionNav sections={reportNavSections} />}

        {/* ═══════════════════════════ 1. EXECUTIVE SUMMARY ════════════════ */}
        {visibleSections['rpt-exec-summary'] && (
        <section className={`rpt-section${appendixSections['rpt-exec-summary'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-exec-summary" style={{ order: sectionOrder('rpt-exec-summary', 10) }}>
          <SectionHeading num="1" title="Executive summary" sectionId="rpt-exec-summary" />
          <ExecutiveSummaryContent
            customerName={customerName}
            invSummary={invSummary.data ?? null}
            costSummary={costSummary.data ?? null}
            defender={defender.data ?? null}
            licSummary={licSummary.data ?? null}
            framework={framework.data ?? null}
            snapshotAt={snapshotAt}
            recommendedActionsCount={recommendedActions.length}
            executiveSummaryNarrativePoints={executiveSummaryNarrativePoints}
            executiveFindingRows={executiveFindingRows}
            executiveDeliverableRows={executiveDeliverableRows}
            executiveConcentratedSubscriptions={executiveConcentratedSubscriptions}
            executiveHighestSpendSubscriptions={executiveHighestSpendSubscriptions}
            executiveRoleSummaryRows={executiveRoleSummaryRows}
            executiveSecurityCategoryRows={executiveSecurityCategoryRows}
            executivePriorityRecommendationRows={executivePriorityRecommendationRows}
            executiveInitiativeRows={executiveInitiativeRows}
            executiveInsightRows={executiveInsightRows}
            executiveAnnualRunRate={executiveAnnualRunRate}
            executiveSecurityRecommendationSummary={executiveSecurityRecommendationSummary}
            executiveTopSubscriptionDrivers={executiveTopSubscriptionDrivers}
            executiveTopTypeDrivers={executiveTopTypeDrivers}
            subNameMap={subNameMap}
            organizationContextSummary={organizationContextSummary}
            assessmentScopeNotes={organizationContext.data?.assessment_scope_notes}
            assessmentBoundaryNotes={organizationContext.data?.assessment_boundary_notes}
            leadershipContextNotes={organizationContext.data?.leadership_context_notes}
          />
        </section>
        )}

        {/* ═══════════════════════════ 1.1 ORGANISATION CONTEXT ═══════════ */}
        {visibleSections['rpt-organization-context'] && (
        <section className={`rpt-section${appendixSections['rpt-organization-context'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-organization-context" style={{ order: sectionOrder('rpt-organization-context', 15) }}>
          <SectionHeading num="1.1" title="Organisation context" sectionId="rpt-organization-context" />
          <p className="rpt-narrative">
            This section captures the customer context used to frame findings and presentation tone in this report.
            The assessment evidence remains unchanged, but recommendations and capability opportunities can be presented in language that better fits the organisation's operating reality.
          </p>
          {organizationContext.data ? (
            <>
              <div className="rpt-hero-grid">
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{organizationContext.data.organisation_size ?? 'Not set'}</span>
                  <span className="rpt-hero-card__label">Organisation size</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{organizationContext.data.org_structure_image_data ? 'Yes' : 'No'}</span>
                  <span className="rpt-hero-card__label">Org structure added</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{organizationContext.data.it_team_structure_images?.length ?? (organizationContext.data.it_team_structure_image_data ? 1 : 0)}</span>
                  <span className="rpt-hero-card__label">IT team structure images</span>
                </div>
              </div>
              <div className="rpt-context-grid">
                {organizationContext.data.organisation_overview && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Organisation overview</h3>
                    <p>{organizationContext.data.organisation_overview}</p>
                  </div>
                )}
                {organizationContext.data.assessment_scope_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Assessment scope notes</h3>
                    <p>{organizationContext.data.assessment_scope_notes}</p>
                  </div>
                )}
                {organizationContext.data.assessment_boundary_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Assessment boundary notes</h3>
                    <p>{organizationContext.data.assessment_boundary_notes}</p>
                  </div>
                )}
                {organizationContext.data.leadership_context_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Leadership context</h3>
                    <p>{organizationContext.data.leadership_context_notes}</p>
                  </div>
                )}
                {organizationContext.data.it_team_summary && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">IT team summary</h3>
                    <p>{organizationContext.data.it_team_summary}</p>
                  </div>
                )}
                {organizationContext.data.operating_model_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Operating model notes</h3>
                    <p>{organizationContext.data.operating_model_notes}</p>
                  </div>
                )}
                {organizationContext.data.vendor_dependency_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Vendor dependency notes</h3>
                    <p>{organizationContext.data.vendor_dependency_notes}</p>
                  </div>
                )}
                {organizationContext.data.tailoring_notes && (
                  <div className="rpt-context-card">
                    <h3 className="rpt-sub-heading">Additional notes</h3>
                    <p>{organizationContext.data.tailoring_notes}</p>
                  </div>
                )}
              </div>
              {(organizationContext.data.org_structure_image_data || (organizationContext.data.it_team_structure_images?.length ?? 0) > 0 || organizationContext.data.it_team_structure_image_data) && (
                <div className="rpt-context-images">
                  {organizationContext.data.org_structure_image_data && (
                    <figure className="rpt-context-image-card">
                      <img
                        src={organizationContext.data.org_structure_image_data}
                        alt={organizationContext.data.org_structure_image_name ?? 'Organisation structure'}
                        className="rpt-context-image"
                      />
                      <figcaption>{organizationContext.data.org_structure_image_name || 'Organisation structure'}</figcaption>
                    </figure>
                  )}
                  {(organizationContext.data.it_team_structure_images && organizationContext.data.it_team_structure_images.length > 0
                    ? organizationContext.data.it_team_structure_images
                    : organizationContext.data.it_team_structure_image_data
                      ? [{ name: organizationContext.data.it_team_structure_image_name, data: organizationContext.data.it_team_structure_image_data }]
                      : []
                  ).map((image, index) => (
                    image.data ? (
                      <figure key={`${image.name ?? 'it-team-structure'}-${index}`} className="rpt-context-image-card">
                        <img
                          src={image.data}
                          alt={image.name ?? `IT team structure ${index + 1}`}
                          className="rpt-context-image"
                        />
                        <figcaption>{image.name || `IT team structure ${index + 1}`}</figcaption>
                      </figure>
                    ) : null
                  ))}
                </div>
              )}
            </>
          ) : <p className="rpt-empty">No organisation context has been saved yet.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 1.2 CHALLENGES ═════════════════════ */}
        {visibleSections['rpt-challenges'] && (
        <section className={`rpt-section${appendixSections['rpt-challenges'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-challenges" style={{ order: sectionOrder('rpt-challenges', 16) }}>
          <SectionHeading num="1.2" title="Cross-organisation challenges" sectionId="rpt-challenges" />
          <p className="rpt-narrative">{narrativeChallenges(challenges.data)}</p>
          <p className="rpt-narrative">
            These challenges should not be read as isolated defects in individual teams or systems. The pattern is more structural: platform growth, legacy overlap, blended roles, and inconsistent delivery disciplines are combining to create a level of friction that is now visible across support, governance, security, reporting, integration understanding, and future-state change.
          </p>
          {challenges.data && challenges.data.length > 0 ? (
            <>
              {visibleSections['rpt-challenges-themes'] && !appendixSections['rpt-challenges-themes'] && (
                <>
                  <h3 className="rpt-sub-heading">1.2.0 Challenge themes</h3>
                  <p className="rpt-desc">{summarizeChallengeThemes(challenges.data)}</p>
                </>
              )}
              <div className="rpt-hero-grid">
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{challenges.data.length}</span>
                  <span className="rpt-hero-card__label">Challenges</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{challenges.data.filter((item) => item.impact_level === 'High' || item.impact_level === 'Critical').length}</span>
                  <span className="rpt-hero-card__label">High impact</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{challenges.data.filter((item) => (item.capability_opportunities?.length ?? 0) > 0).length}</span>
                  <span className="rpt-hero-card__label">Capability-linked</span>
                </div>
              </div>
              <p className="rpt-table-meta">{challenges.data.length} rows</p>
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Challenge</th><th>Impact</th><th>Category</th>
                    <th>Primary Effect</th><th>Evidence Sources</th><th>Capability Links</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.data.map((item) => (
                    <tr key={item.id}>
                      <td>{item.challenge_id ?? '—'}</td>
                      <td><strong>{item.title}</strong></td>
                      <td>{item.impact_level}</td>
                      <td>{item.category ?? '—'}</td>
                      <td>{item.primary_effect ?? '—'}</td>
                      <td>{item.evidence_sources?.join(', ') ?? '—'}</td>
                      <td>{item.capability_opportunities?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-cross-organisation-challenges`} rows={challengeExportRows} />
              <p className="rpt-desc">
                <strong>Evidence source legend:</strong> `KICK` = assessment kickoff, `AZ` = Azure environments and infrastructure review, `WEB` = website overview, `DYN` = Dynamics overview, `RPT` = data warehouse and reporting review, `INT` = integration architecture review, `INIT` = initiatives and delivery discussions.
              </p>

              {visibleSections['rpt-challenges-capabilities'] && !appendixSections['rpt-challenges-capabilities'] && challenges.data.some((item) => (item.capability_opportunities?.length ?? 0) > 0) && (
                <>
                  <h3 className="rpt-sub-heading">1.2.1 Capability opportunities linked to challenges</h3>
                  <p className="rpt-desc">
                    {orgGuidance.capabilityLeadIn}
                    {organizationContext.data?.organisation_size ? ` This wording is currently tailored for a ${organizationContext.data.organisation_size.toLowerCase()} organisation context.` : ''}
                  </p>
                  <div className="rpt-stakeholder-list">
                    {tailoredChallenges
                      .filter((item) => (item.capability_opportunities?.length ?? 0) > 0)
                      .map((item) => (
                        <div key={`capability-${item.id}`} className="rpt-stakeholder-card">
                          <h4>{[item.challenge_id, item.title].filter(Boolean).join(' ')}</h4>
                          {item.tailored_description && <p>{item.tailored_description}</p>}
                          <p><strong>Capability opportunities:</strong> {item.tailored_capability_opportunities?.join('; ')}</p>
                          {item.tailored_why_it_matters && <p><strong>Why it matters:</strong> {item.tailored_why_it_matters}</p>}
                        </div>
                      ))}
                  </div>
                </>
              )}
            </>
          ) : <p className="rpt-empty">No challenges recorded.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 1.3 RECOMMENDATIONS ════════════════ */}
        {visibleSections['rpt-recommendations'] && (
        <section className={`rpt-section${appendixSections['rpt-recommendations'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-recommendations" style={{ order: sectionOrder('rpt-recommendations', 17) }}>
          <SectionHeading num="1.3" title="Strategic recommendations" sectionId="rpt-recommendations" />
          <p className="rpt-narrative">{narrativeRecommendations(recommendations.data)}</p>
          <p className="rpt-narrative">
            The recommendations are intentionally weighted toward practical control, supportability, and execution capacity before deeper redesign. This reflects the view that {customerName} is more likely to create value by strengthening the way the estate is managed and delivered than by launching too many transformation streams before the basics are under firmer control.
          </p>
          {recommendations.data && recommendations.data.length > 0 ? (
            <>
              {visibleSections['rpt-recommendations-themes'] && !appendixSections['rpt-recommendations-themes'] && (
                <>
                  <h3 className="rpt-sub-heading">1.3.0 Recommendation themes</h3>
                  <p className="rpt-desc">{summarizeRecommendationThemes(recommendations.data)}</p>
                </>
              )}
              <div className="rpt-hero-grid">
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{recommendations.data.length}</span>
                  <span className="rpt-hero-card__label">Recommendations</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{recommendations.data.filter((item) => item.priority === 'P1').length}</span>
                  <span className="rpt-hero-card__label">Priority 1</span>
                </div>
                <div className="rpt-hero-card">
                  <span className="rpt-hero-card__value">{recommendations.data.filter((item) => item.reinforcement_level === 'Strong cross-transcript').length}</span>
                  <span className="rpt-hero-card__label">Cross-transcript</span>
                </div>
              </div>
              <p className="rpt-table-meta">{recommendations.data.length} rows</p>
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Recommendation</th><th>Priority</th><th>Type</th>
                    <th>Primary Outcome</th><th>Evidence Sources</th><th>Validation</th><th>Manual</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.data.map((item) => (
                    <tr key={item.id}>
                      <td>{item.recommendation_id ?? '—'}</td>
                      <td><strong>{item.title}</strong></td>
                      <td>{item.priority}</td>
                      <td>{item.recommendation_type ?? '—'}</td>
                      <td>{item.primary_outcome ?? '—'}</td>
                      <td>{item.evidence_sources?.join(', ') ?? '—'}</td>
                      <td>{item.validation_status ?? '—'}</td>
                      <td>{item.manual_entry ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-strategic-recommendations`} rows={recommendationExportRows} />

              {visibleSections['rpt-recommendations-detail'] && !appendixSections['rpt-recommendations-detail'] && recommendations.data.some((item) => item.why_it_matters || item.practical_next_step) && (
                <>
                  <h3 className="rpt-sub-heading">1.3.1 Recommendation detail</h3>
                  <p className="rpt-desc">
                    {orgGuidance.recommendationLeadIn}
                    {organizationContext.data?.organisation_size ? ` This wording is currently tailored for a ${organizationContext.data.organisation_size.toLowerCase()} organisation context.` : ''}
                  </p>
                  <div className="rpt-stakeholder-list rpt-recommendation-detail-grid">
                    {tailoredRecommendations.map((item) => (
                      <div key={`detail-${item.id}`} className="rpt-stakeholder-card">
                        <h4>{[item.recommendation_id, item.title].filter(Boolean).join(' ')}</h4>
                        <div className="rpt-kv-grid rpt-kv-grid--3col rpt-kv-grid--tight">
                          <div className="rpt-kv"><span className="rpt-kv__label">Priority</span><span className="rpt-kv__value">{item.priority}</span></div>
                          <div className="rpt-kv"><span className="rpt-kv__label">Category</span><span className="rpt-kv__value">{item.category ?? '—'}</span></div>
                          <div className="rpt-kv"><span className="rpt-kv__label">Evidence Breadth</span><span className="rpt-kv__value">{item.reinforcement_level ?? '—'}</span></div>
                        </div>
                        {item.tailored_description && <p>{item.tailored_description}</p>}
                        {item.tailored_why_it_matters && <p><strong>Why it matters:</strong> {item.tailored_why_it_matters}</p>}
                        {item.tailored_practical_next_step && <p><strong>Practical next step:</strong> {item.tailored_practical_next_step}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : <p className="rpt-empty">No recommendations recorded.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 1.4 SNAPSHOT ═══════════════════════ */}
        {visibleSections['rpt-snapshot'] && (
        <section className={`rpt-section${appendixSections['rpt-snapshot'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-snapshot" style={{ order: sectionOrder('rpt-snapshot', 18) }}>
          <SectionHeading num="1.4" title="Snapshot information" sectionId="rpt-snapshot" />
          <p className="rpt-narrative">
            This section records when the current assessment snapshot was taken and summarises any data gaps captured during the pull. Snapshot metadata is shown as recorded evidence and is not recalculated in the report.
          </p>
          <div className="rpt-kv-grid rpt-kv-grid--4col">
            <div className="rpt-kv"><span className="rpt-kv__label">Snapshot Taken</span><span className="rpt-kv__value">{snapshotAt ? formatDate(snapshotAt) : 'Unavailable'}</span></div>
            <div className="rpt-kv"><span className="rpt-kv__label">Report Generated</span><span className="rpt-kv__value">{now}</span></div>
            <div className="rpt-kv"><span className="rpt-kv__label">Recorded Data Gaps</span><span className="rpt-kv__value">{snapshotGapSummary.total}</span></div>
            <div className="rpt-kv"><span className="rpt-kv__label">Release Mode</span><span className="rpt-kv__value">{reportReleaseMode === 'major' ? 'Major version' : 'Draft'}</span></div>
          </div>
          {snapshotGapSummary.bySeverity.length > 0 && (
            <div className="rpt-visual-grid">
              <table className="rpt-table">
                <thead><tr><th>Severity</th><th>Count</th></tr></thead>
                <tbody>
                  {snapshotGapSummary.bySeverity.map(([severity, count]) => (
                    <tr key={severity}>
                      <td>{titleCase(severity)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="rpt-table">
                <thead><tr><th>Module</th><th>Recorded Gaps</th></tr></thead>
                <tbody>
                  {snapshotGapSummary.byModule.map(([module, count]) => (
                    <tr key={module}>
                      <td>{module}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {inventoryValidationSummary && (
            <div className="rpt-callout rpt-callout--note">
              <strong>Why the counts differ.</strong> The Azure CSV has <strong>{inventoryValidationSummary.azure_subscriptions} subscriptions</strong>,
              <strong> {inventoryValidationSummary.azure_resource_groups} resource groups</strong>, and
              <strong> {inventoryValidationSummary.azure_resources} resources</strong>. The Cloud Assessment Workbench snapshot has
              <strong> {inventoryValidationSummary.snapshot_subscriptions} subscriptions</strong>,
              <strong> {inventoryValidationSummary.snapshot_resource_groups} resource groups</strong>, and
              <strong> {inventoryValidationSummary.snapshot_resources} resources</strong>. That means Cloud Assessment Workbench has
              <strong> {inventoryValidationSummary.snapshot_resource_groups - inventoryValidationSummary.azure_resource_groups} extra resource groups</strong> and
              <strong> {inventoryValidationSummary.snapshot_resources - inventoryValidationSummary.azure_resources} extra resources</strong>. These differences are explainable.
              <ul className="rpt-list">
                <li>
                  The extra resource groups are in the profile-scoped validation evidence: {inventoryValidationSummary.extra_resource_groups.join(', ')}.
                </li>
                <li>
                  These look like empty or system-managed groups, shell/workspace-managed groups, or groups not surfaced in the CSV export the same way.
                </li>
                <li>
                  Some groups have 0 resources in the snapshot, which strongly suggests the Azure CSV is focused on resource-bearing groups only.
                </li>
                <li>
                  The extra resources are mostly child or sub-resources that Azure&apos;s export appears not to include consistently. Biggest categories:
                  {' '}
                  {inventoryValidationSummary.extra_resource_type_breakdown
                    .map((item) => `${item.count} ${item.type}`)
                    .join('; ')}.
                </li>
              </ul>
              {inventoryValidationExtraResources.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.82rem', marginTop: '0.4rem' }}
                  onClick={() => downloadCsv('inventory-validation-extra-resources', inventoryValidationExtraResources)}
                >
                  Download extra resources workbook
                </button>
              )}
            </div>
          )}
          {gaps.data && gaps.data.length > 0 && <p className="rpt-table-meta">{gaps.data.length} gaps</p>}
          {gaps.data && gaps.data.length > 0 ? (
            <table className="rpt-table rpt-table--compact">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Severity</th>
                  {snapshotHasFieldColumn && <th>Field</th>}
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {gaps.data.map((gap, index) => (
                  <tr key={`${gap.module}-${gap.field}-${index}`}>
                    <td>{gap.module}</td>
                    <td>{titleCase(gap.severity)}</td>
                    {snapshotHasFieldColumn && <td>{gap.field || '—'}</td>}
                    <td>{gap.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rpt-positive">No recorded data gaps were saved with this snapshot.</p>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 2. INVENTORY ════════════════════════ */}
        {visibleSections['rpt-inventory'] && (
        <section className={`rpt-section${appendixSections['rpt-inventory'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-inventory" style={{ order: sectionOrder('rpt-inventory', 20) }}>
          <SectionHeading num="3" title="Azure estate overview" sectionId="rpt-inventory" />
          <ReportPrimer
            about={AZURE_INVENTORY_COST_PRIMER.about}
            summary={AZURE_INVENTORY_COST_PRIMER.summary}
            howToRead={AZURE_INVENTORY_COST_PRIMER.howToRead}
          />
          <p className="rpt-narrative">{narrativeInventory(invSummary.data, subscriptions.data, databases.data)}</p>
          {visibleSections['rpt-inventory-interpretation'] && !appendixSections['rpt-inventory-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">3.0 Estate overview</h3>
              <p className="rpt-desc">
                The current inventory establishes the baseline footprint of the Azure estate across{' '}
                <strong>{invSummary.data?.total_subscriptions ?? 0} subscriptions</strong> and{' '}
                <strong>{invSummary.data?.total_resource_groups ?? 0} resource groups</strong>. The largest concentrations currently sit in{' '}
                <strong>{topResourceGroups[0]?.name ?? '—'} ({topResourceGroups[0]?.value ?? 0})</strong>,{' '}
                <strong>{topResourceGroups[1]?.name ?? '—'} ({topResourceGroups[1]?.value ?? 0})</strong>, and{' '}
                <strong>{topResourceGroups[2]?.name ?? '—'} ({topResourceGroups[2]?.value ?? 0})</strong>, indicating where operational load is most likely to be clustered. Resources are currently spread across{' '}
                <strong>{topLocations.length}</strong> Azure locations, and current tagging coverage should be read as a direct indicator of ownership and chargeback readiness.
              </p>
            </>
          )}
          {invSummary.data && (
            <div className="rpt-visual-grid rpt-visual-grid--two">
              {topResourceGroups.length > 0 && (
                <ChartCard
                  title="Resources by group"
                  subtitle="Count per resource group"
                  data={topResourceGroups}
                  xKey="name"
                  yKey="value"
                  chartType="bar"
                  height={320}
                  barLabelMode="inside"
                />
              )}
              {resourcesByType.length > 0 && (
                <ChartCard
                  title="Top resource types"
                  subtitle="Most prevalent Azure resource types"
                  data={resourcesByType
                    .slice(0, 10)
                    .map(([name, value]) => ({ name: shortType(name), value }))}
                  xKey="name"
                  yKey="value"
                  chartType="bar"
                  height={320}
                  barLabelMode="inside"
                />
              )}
              {topLocations.length > 0 && (
                <ChartCard
                  title="Resources by location"
                  subtitle="Geographic distribution"
                  data={topLocations}
                  xKey="name"
                  yKey="value"
                  chartType="bar"
                  height={320}
                  barLabelMode="inside"
                />
              )}
              {taggingSplit.length > 0 && (
                <ChartCard title="Tagging coverage" subtitle="Tagged vs untagged resources">
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={taggingSplit}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={118}
                        paddingAngle={2}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          )}

          {/* 2.1 Subscriptions */}
          {visibleSections['rpt-inventory-subscriptions'] && !appendixSections['rpt-inventory-subscriptions'] && (
            <>
          <h3 className="rpt-sub-heading">3.1 Subscription footprint</h3>
          <p className="rpt-desc">Azure subscriptions are the top-level billing and access boundary. This view shows resource concentration, location spread, and tagging coverage for each subscription.</p>
          {subscriptionTableRows.length > 0 ? (
            <>
            <p className="rpt-table-meta">{subscriptionTableRows.length} subscriptions</p>
            <table className="rpt-table rpt-table--inventory-subscriptions">
              <thead><tr><th>Subscription</th><th>Subscription ID</th><th>State</th><th>Resource Groups</th><th>Resources</th><th>Locations</th><th>Tagged %</th><th>Tenant ID</th></tr></thead>
              <tbody>
                {subscriptionTableRows.map(s => (
                  <tr key={s.subscription_id}>
                    <td>{s.display_name}</td>
                    <td className="rpt-mono">{s.subscription_id}</td>
                    <td>{s.state}</td>
                    <td>{s.resource_group_count}</td>
                    <td>{s.resource_count}</td>
                    <td>{s.locations_count}</td>
                    <td>{formatPercent(s.tagged_percent, 1)}</td>
                    <td className="rpt-mono">{s.tenant_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No subscription data available.</p>}
            </>
          )}

          {/* 2.2 Resource Groups */}
          {visibleSections['rpt-inventory-resource-groups'] && !appendixSections['rpt-inventory-resource-groups'] && (
            <>
          <h3 className="rpt-sub-heading">3.2 Resource group overview</h3>
          <p className="rpt-desc">Resource groups are logical containers that group related resources for management, access control, and cost tracking.</p>
          {resourceGroupTableRows.length > 0 ? (
            <>
            <p className="rpt-table-meta">{resourceGroupTableRows.length} resource groups</p>
            <table className="rpt-table rpt-table--inventory-resource-groups">
              <thead><tr><th>Resource Group</th><th>Subscription</th><th>Location</th><th>Provisioning</th><th>Resources</th><th>Tagged</th><th>Untagged</th><th>Tags</th></tr></thead>
              <tbody>
                {resourceGroupTableRows.map(rg => (
                  <tr key={rg.name}>
                    <td>{rg.name}</td>
                    <td>{rg.subscription_label}</td>
                    <td>{rg.location}</td>
                    <td>{rg.provisioning_state || 'Succeeded'}</td>
                    <td>{rg.resource_count}</td>
                    <td>{rg.tagged_resources}</td>
                    <td>{rg.untagged_resources}</td>
                    <td>{rg.tags_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No resource group data available.</p>}
            </>
          )}

          {/* 2.3 Resource register */}
          {visibleSections['rpt-inventory-resource-types'] && !appendixSections['rpt-inventory-resource-types'] && (
            <>
          <h3 className="rpt-sub-heading">3.3 Resource register</h3>
          <p className="rpt-desc">The table below shows the first 20 resources from the full discovered Azure resource register. The complete list is available in the supporting workbook.</p>
          {topResources.length > 0 ? (
            <>
            <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-inventory-resources`} rows={allResourcesExportRows} />
            <p className="rpt-table-meta">Showing {topResources.length} of {invSummary.data?.total_resources?.toLocaleString() ?? '?'} total resources</p>
            <table className="rpt-table rpt-table--inventory-resources">
              <thead><tr><th>Name</th><th>Type</th><th>Resource Group</th><th>Location</th><th>Subscription</th><th>Tagged</th></tr></thead>
              <tbody>
                {topResources.map((resource) => (
                  <tr key={resource.id}>
                    <td>{resource.name}</td>
                    <td>{shortType(resource.type)}</td>
                    <td>{resource.resource_group}</td>
                    <td>{resource.location}</td>
                    <td>{resolveSubscriptionName(resource.subscription_name, resource.subscription_id, subNameMap)}</td>
                    <td>{resource.is_tagged ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No resource data available.</p>}
            </>
          )}

          {/* 2.4 Databases */}
          {visibleSections['rpt-inventory-databases'] && !appendixSections['rpt-inventory-databases'] && (
            <>
          <h3 className="rpt-sub-heading">3.4 Database overview</h3>
          <p className="rpt-desc">Databases identified across the Azure estate, including sizing and tier information where available.</p>
          <div className="rpt-callout rpt-callout--note">
            <strong>Note:</strong> Where current measured size is not available, the size column uses the maximum provisioned size.
          </div>
          {databases.data && databases.data.length > 0 ? (
            <>
            <p className="rpt-table-meta">{databases.data.length} databases</p>
            <table className="rpt-table">
              <thead><tr><th>Name</th><th>Type</th><th>SKU Tier</th><th>Size (GB)</th><th>Status</th><th>Resource Group</th></tr></thead>
              <tbody>
                {databases.data.map(db => (
                  <tr key={db.resource_id}>
                    <td>{db.resource_name}</td>
                    <td>{db.database_type}</td>
                    <td>{db.sku_tier ?? '—'}</td>
                    <td>{db.current_size_gb?.toFixed(1) ?? db.max_size_gb?.toFixed(1) ?? '—'}</td>
                    <td>{db.status}</td>
                    <td>{db.resource_group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No databases identified.</p>}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 3. COST ANALYSIS ════════════════════ */}
        {visibleSections['rpt-costs'] && (
        <section className={`rpt-section${appendixSections['rpt-costs'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-costs" style={{ order: sectionOrder('rpt-costs', 30) }}>
          <SectionHeading num="4" title="Cost analysis" sectionId="rpt-costs" />
          <p className="rpt-narrative">
            Average monthly Azure spend across the last 6 months is <strong>{formatCurrency(monthlyAverageSpend)}</strong>, last month spend is{' '}
            <strong>{formatCurrency(costSummary.data?.total_cost_1m ?? costSummary.data?.total ?? 0)}</strong>, and the 6-month total is{' '}
            <strong>{formatCurrency(costSummary.data?.total_cost_6m ?? 0)}</strong>. The overall trend is{' '}
            <strong>{titleCase(costSummary.data?.overall_trend ?? 'unknown')}</strong>
            {costSummary.data?.trend_percent != null ? ` (${costSummary.data.trend_percent > 0 ? '+' : ''}${costSummary.data.trend_percent.toFixed(1)}% month-on-month)` : ''}. The highest-spending subscription is{' '}
            <strong>"{resolveSubscriptionName(costBySub.data?.slice().sort((a, b) => b.cost_1m - a.cost_1m)[0]?.subscription_name, costBySub.data?.slice().sort((a, b) => b.cost_1m - a.cost_1m)[0]?.group_key, subNameMap) || '—'}"</strong>{' '}
            at <strong>{formatCurrency(costBySub.data?.slice().sort((a, b) => b.cost_1m - a.cost_1m)[0]?.cost_1m ?? 0)}</strong>/month. The leading cost driver is{' '}
            <strong>"{shortType(costByType.data?.slice().sort((a, b) => b.cost_1m - a.cost_1m)[0]?.group_key || '—')}"</strong>{' '}
            ({formatCurrency(costByType.data?.slice().sort((a, b) => b.cost_1m - a.cost_1m)[0]?.cost_1m ?? 0)}/month).
          </p>
          {visibleSections['rpt-costs-interpretation'] && !appendixSections['rpt-costs-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">4.0 Cost overview</h3>
              <p className="rpt-desc">{interpretCostSection(costSummary.data, costBySub.data, costByType.data, subNameMap)}</p>
            </>
          )}
          {costSummary.data?.by_month && costSummary.data.by_month.length > 0 && (
            <div className="rpt-visual-grid rpt-visual-grid--lead">
              <CostTrendChart months={costSummary.data.by_month} title="Monthly spend trend" />
            </div>
          )}
          <div className="rpt-visual-grid rpt-visual-grid--two rpt-visual-grid--cost-secondary">
            {costByResource.data && costByResource.data.length > 0 && (
              <CostBarChart
                drivers={costByResource.data.map((item) => ({ resource_type: item.resource_name, cost_1m: item.cost_1m }))}
                title="Top cost drivers"
              />
            )}
            {costByType.data && costByType.data.length > 0 && (
              <ChartCard
                title="Cost by resource type"
                subtitle="Top Azure service categories by monthly spend"
                data={costByType.data
                  .slice()
                  .sort((a, b) => b.cost_1m - a.cost_1m)
                  .slice(0, 8)
                  .map((item) => ({
                    name: `${shortType(item.group_key)} (${formatCurrency(item.cost_1m)})`,
                    value: Number(item.cost_1m.toFixed(2)),
                  }))}
                xKey="name"
                yKey="value"
                chartType="bar"
                height={360}
                barLabelMode="inside"
                valueFormatter={(value) => formatCurrency(value)}
              />
            )}
            {costBySub.data && costBySub.data.length > 0 && (
              <ChartCard
                title="Cost by subscription"
                subtitle="Last 30 days"
                data={costBySub.data
                  .slice()
                  .sort((a, b) => b.cost_1m - a.cost_1m)
                  .slice(0, 8)
                  .map((item) => ({
                    name: `${resolveSubscriptionName(item.subscription_name, item.group_key, subNameMap)} (${formatCurrency(item.cost_1m)})`,
                    value: Number(item.cost_1m.toFixed(2)),
                  }))}
                xKey="name"
                yKey="value"
                chartType="bar"
                height={360}
                barLabelMode="inside"
                valueFormatter={(value) => formatCurrency(value)}
              />
            )}
            {costByRG.data && costByRG.data.length > 0 && (
              <ChartCard
                title="Cost by resource group"
                subtitle="Top resource groups by monthly spend"
                data={costByRG.data
                  .slice()
                  .sort((a, b) => b.cost_1m - a.cost_1m)
                  .slice(0, 8)
                  .map((item) => ({
                    name: `${item.group_key !== 'unknown' ? item.group_key : 'Subscription-level'} (${formatCurrency(item.cost_1m)})`,
                    value: Number(item.cost_1m.toFixed(2)),
                  }))}
                xKey="name"
                yKey="value"
                chartType="bar"
                height={360}
                barLabelMode="inside"
                valueFormatter={(value) => formatCurrency(value)}
              />
            )}
          </div>

          {/* 3.1 Cost Summary */}
          {visibleSections['rpt-costs-summary'] && !appendixSections['rpt-costs-summary'] && (
            <>
          <h3 className="rpt-sub-heading">4.1 Spend summary</h3>
          {costSummary.data ? (
            <div className="rpt-kv-grid rpt-kv-grid--5col">
              <div className="rpt-kv"><span className="rpt-kv__label">Average Monthly Spend</span><span className="rpt-kv__value">{formatCurrency(monthlyAverageSpend)}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">1-Month Total</span><span className="rpt-kv__value">{formatCurrency(costSummary.data.total_cost_1m ?? costSummary.data.total ?? 0)}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">3-Month Total</span><span className="rpt-kv__value">{formatCurrency(costSummary.data.total_cost_3m ?? 0)}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">6-Month Total</span><span className="rpt-kv__value">{formatCurrency(costSummary.data.total_cost_6m ?? 0)}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Trend</span><span className="rpt-kv__value">{trendIcon(costSummary.data.overall_trend)} {titleCase(costSummary.data.overall_trend)}{costSummary.data.trend_percent != null ? ` (${costSummary.data.trend_percent > 0 ? '+' : ''}${costSummary.data.trend_percent.toFixed(1)}%)` : ''}</span></div>
            </div>
          ) : <p className="rpt-empty">Cost summary not available.</p>}
            </>
          )}

          {/* Monthly breakdown */}
          {visibleSections['rpt-costs-monthly-trend'] && !appendixSections['rpt-costs-monthly-trend'] && costSummary.data?.by_month && costSummary.data.by_month.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">4.2 Monthly spend trend</h3>
              <div className="rpt-visual-grid rpt-visual-grid--single">
                <CostTrendChart title="Monthly spending trend" months={costSummary.data.by_month} />
              </div>
              <div className="rpt-monthly-trend-table">
              <p className="rpt-table-meta">{costSummary.data!.by_month.length} months</p>
              <table className="rpt-table rpt-table--compact rpt-table--monthly-trend">
                <thead><tr><th>Month</th><th>Spend</th></tr></thead>
                <tbody>
                  {costSummary.data.by_month.map(m => (
                    <tr key={m.month}><td>{m.month}</td><td>{formatCurrency(m.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}

          {/* 3.3 By Subscription */}
          {visibleSections['rpt-costs-subscription'] && !appendixSections['rpt-costs-subscription'] && (
            <>
          <h3 className="rpt-sub-heading">4.3 Cost by subscription</h3>
          <p className="rpt-desc">Spend breakdown by Azure subscription, showing 1-month, 3-month, and 6-month actuals. Percentages show each subscription's share of current monthly spend.</p>
          {costBySub.data && costBySub.data.length > 0 && <p className="rpt-table-meta">{costBySub.data.length} subscriptions</p>}
          {costBySub.data && costBySub.data.length > 0 ? (
            <table className="rpt-table rpt-table--cost-rollup rpt-table--cost-subscriptions">
              <thead><tr><th>Subscription</th><th>1-Month</th><th>%</th><th>3-Month</th><th>6-Month</th><th>Trend</th><th>Inventory Resources</th>{costBySubscriptionHasCostedResources && <th>Costed Resources</th>}</tr></thead>
              <tbody>
                {costBySub.data.sort((a, b) => b.cost_1m - a.cost_1m).map(r => {
                  const name = resolveSubscriptionName(r.subscription_name, r.group_key, subNameMap);
                  const subscriptionId = (r.subscription_id ?? r.group_key ?? '').trim();
                  return (
                    <tr key={r.group_key}>
                      <td>{name}</td>
                      <td>{formatCurrency(r.cost_1m)}</td>
                      <td>{subscriptionPctBase > 0 ? formatPercent((r.cost_1m / subscriptionPctBase) * 100, 1) : '—'}</td>
                      <td>{formatCurrency(r.cost_3m)}</td>
                      <td>{formatCurrency(r.cost_6m)}</td>
                      <td>{trendIcon(r.trend)} {r.trend}</td>
                      <td>{inventoryResourceCountBySubscription.get(subscriptionId) ?? '—'}</td>
                      {costBySubscriptionHasCostedResources && <td>{r.resource_count || '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="rpt-empty">No subscription cost data.</p>}
            </>
          )}

          {/* 3.4 By Resource Group */}
          {visibleSections['rpt-costs-resource-group'] && !appendixSections['rpt-costs-resource-group'] && (
            <>
          <h3 className="rpt-sub-heading">4.4 Cost by resource group</h3>
          <p className="rpt-desc">Resource-group spend view with current monthly share. Where a costed-resource count is available, it reflects only the resources represented in the cost dataset.</p>
          {costByRG.data && costByRG.data.length > 0 && <p className="rpt-table-meta">{costByRG.data.length} resource groups</p>}
          {costByRG.data && costByRG.data.length > 0 ? (
            <table className="rpt-table rpt-table--cost-rollup rpt-table--cost-resource-groups">
              <thead><tr><th>Resource Group</th><th>1-Month</th><th>%</th><th>3-Month</th><th>6-Month</th><th>Trend</th>{costByResourceGroupHasCostedResources && <th>Costed Resources</th>}</tr></thead>
              <tbody>
                {costByRG.data.sort((a, b) => b.cost_1m - a.cost_1m).map(r => (
                  <tr key={r.group_key + (r.subscription_id ?? '')}>
                    <td>{r.group_key !== 'unknown' ? r.group_key : 'Subscription-level'}</td>
                    <td>{formatCurrency(r.cost_1m)}</td>
                    <td>{subscriptionPctBase > 0 ? formatPercent((r.cost_1m / subscriptionPctBase) * 100, 1) : '—'}</td>
                    <td>{formatCurrency(r.cost_3m)}</td>
                    <td>{formatCurrency(r.cost_6m)}</td>
                    <td>{trendIcon(r.trend)} {r.trend}</td>
                    {costByResourceGroupHasCostedResources && <td>{r.resource_count || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rpt-empty">No resource group cost data.</p>}
            </>
          )}

          {/* 3.5 By Resource Type */}
          {visibleSections['rpt-costs-resource-type'] && !appendixSections['rpt-costs-resource-type'] && (
            <>
          <h3 className="rpt-sub-heading">4.5 Cost by resource type</h3>
          {costByType.data && costByType.data.length > 0 ? (() => {
            const hasAnyCounts = costByType.data!.some(r => r.resource_count > 0);
            return (
              <>
              <p className="rpt-table-meta">{costByType.data!.length} resource types</p>
              <table className="rpt-table">
                <thead><tr><th>Resource Type</th><th>Friendly Name</th><th>1-Month</th><th>3-Month</th><th>6-Month</th><th>Trend</th>{hasAnyCounts && <th>Count</th>}</tr></thead>
                <tbody>
                  {costByType.data!.sort((a, b) => b.cost_1m - a.cost_1m).map(r => (
                    <tr key={r.group_key}>
                      <td>{shortType(r.group_key)}</td>
                      <td>{normalizeResourceTypeName(r.group_key)}</td>
                      <td>{formatCurrency(r.cost_1m)}</td>
                      <td>{formatCurrency(r.cost_3m)}</td>
                      <td>{formatCurrency(r.cost_6m)}</td>
                      <td>{trendIcon(r.trend)} {r.trend}</td>
                      {hasAnyCounts && <td>{r.resource_count}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            );
          })() : <p className="rpt-empty">No resource type cost data.</p>}
            </>
          )}

          {/* 3.6 Top Cost Drivers (individual resources) */}
          {visibleSections['rpt-costs-drivers'] && !appendixSections['rpt-costs-drivers'] && (
            <>
          <h3 className="rpt-sub-heading">4.6 Top cost drivers</h3>
          <p className="rpt-desc">Individual resources with the highest monthly spend.</p>
          {costByResource.data && costByResource.data.length > 0 && <p className="rpt-table-meta">{Math.min(costByResource.data.length, 30)} of {costByResource.data.length} resources</p>}
          {costByResource.data && costByResource.data.length > 0 ? (
            <table className="rpt-table">
              <thead><tr><th>Resource</th><th>Type</th><th>Resource Group</th><th>1-Month</th><th>3-Month</th><th>6-Month</th><th>Trend</th></tr></thead>
              <tbody>
                {[...costByResource.data].sort((a, b) => b.cost_1m - a.cost_1m).slice(0, 30).map(r => {
                  // Extract resource group from resource_id (case-insensitive)
                  let rg = r.resource_group;
                  if (!rg && r.resource_id) {
                    const rgMatch = r.resource_id.match(/\/resourceGroups\/([^/]+)/i);
                    if (rgMatch) rg = rgMatch[1];
                  }
                  return (
                    <tr key={r.resource_id}>
                      <td>{r.resource_name}</td>
                      <td>{shortType(r.resource_type)}</td>
                      <td>{rg || '—'}</td>
                      <td>{formatCurrency(r.cost_1m)}</td>
                      <td>{formatCurrency(r.cost_3m)}</td>
                      <td>{formatCurrency(r.cost_6m)}</td>
                      <td>{trendIcon(r.trend)} {r.trend}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="rpt-empty">No individual resource cost data.</p>}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 4. SECURITY ═════════════════════════ */}
        {visibleSections['rpt-security'] && (
        <section className={`rpt-section${appendixSections['rpt-security'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-security" style={{ order: sectionOrder('rpt-security', 40) }}>
          <SectionHeading num="5" title="Security and compliance posture" sectionId="rpt-security" />
          <ReportPrimer
            about={SECURITY_COMPLIANCE_PRIMER.about}
            summary={SECURITY_COMPLIANCE_PRIMER.summary}
            howToRead={SECURITY_COMPLIANCE_PRIMER.howToRead}
          />
          <p className="rpt-narrative">{narrativeSecurity(defender.data, advisorScores.data, advisorRecs.data)}</p>
          {visibleSections['rpt-security-interpretation'] && !appendixSections['rpt-security-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">5.0 Security overview</h3>
              <p className="rpt-desc">{interpretSecuritySection(defender.data, advisorScores.data, cspmInsights.data)}</p>
            </>
          )}
          {advisorScores.data?.aggregated_scores && advisorScores.data.aggregated_scores.length > 0 && (
            <div className="rpt-visual-grid rpt-visual-grid--single">
              <AdvisorRadar
                scores={advisorScores.data.aggregated_scores
                  .filter((item) => !looksLikeId(item.pillar))
                  .map((item) => ({
                    category: readablePillar(item.pillar),
                    score: Number(item.percentage.toFixed(1)),
                    max_score: 100,
                  }))}
              />
            </div>
          )}

          {/* 4.1 Defender Secure Scores */}
          {visibleSections['rpt-security-defender'] && !appendixSections['rpt-security-defender'] && (
            <>
          <h3 className="rpt-sub-heading">5.1 Microsoft Defender secure scores</h3>
          <p className="rpt-desc">Defender for Cloud provides a security posture score per subscription. Higher is better.</p>
          {defender.data && defender.data.scores.length > 0 ? (
            <>
              <div className="rpt-kv-grid rpt-kv-grid--3col">
                <div className="rpt-kv"><span className="rpt-kv__label">Overall Score</span><span className="rpt-kv__value">{defender.data.overall_current.toFixed(0)} / {defender.data.overall_max.toFixed(0)}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Overall Percentage</span><span className={`rpt-kv__value${defender.data.overall_percentage < 50 ? ' rpt-value--warn' : ''}`}>{formatPercent(defender.data.overall_percentage, 0)}</span></div>
                {defender.data.posture_summary && (
                  <div className="rpt-kv"><span className="rpt-kv__label">Controls at Risk</span><span className={`rpt-kv__value${defender.data.posture_summary.controls_at_risk > 0 ? ' rpt-value--warn' : ''}`}>{defender.data.posture_summary.controls_at_risk} / {defender.data.posture_summary.total_controls}</span></div>
                )}
              </div>
              {defenderBySubscription.length > 0 && (
                <div className="rpt-visual-grid rpt-visual-grid--single">
                  <ChartCard
                    title="Defender score by subscription"
                    subtitle="Percentage secure score across in-scope subscriptions"
                    data={defenderBySubscription}
                    xKey="name"
                    yKey="value"
                    chartType="bar"
                    height={340}
                    barLabelMode="vertical-inside"
                  />
                </div>
              )}
              <p className="rpt-table-meta">{defender.data.scores.length} subscriptions</p>
              <table className="rpt-table">
                <thead><tr><th>Subscription</th><th>Current Score</th><th>Max Score</th><th>Percentage</th></tr></thead>
                <tbody>
                  {defender.data.scores.map((s, i) => (
                    <tr key={i}>
                        <td>{resolveSubscriptionName(s.subscription_name, undefined, subNameMap)}</td>
                      <td>{s.current_score.toFixed(1)}</td>
                      <td>{s.max_score.toFixed(1)}</td>
                      <td>{formatPercent(s.percentage, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <p className="rpt-empty">Defender scores not available.</p>}
            </>
          )}

          {/* 4.2 Posture Controls */}
          {visibleSections['rpt-security-controls'] && !appendixSections['rpt-security-controls'] && defender.data?.controls && defender.data.controls.length > 0 && (() => {
            const sorted = [...defender.data!.controls].sort((a, b) => a.percentage - b.percentage);
            const nonZero = sorted.filter(c => c.percentage > 0);
            const zeroGroup = sorted.filter(c => c.percentage === 0);
            return (
              <>
                <h3 className="rpt-sub-heading">5.2 Security controls breakdown</h3>
                <p className="rpt-desc">Individual security controls with healthy/unhealthy resource counts.</p>
                <p className="rpt-table-meta">{sorted.length} controls</p>
                <table className="rpt-table rpt-table--compact">
                  <thead><tr><th>Control</th><th>Score</th><th>Max</th><th>%</th><th>Healthy</th><th>Unhealthy</th><th>Not Applicable</th></tr></thead>
                  <tbody>
                    {nonZero.map((c, i) => (
                      <tr key={i}>
                        <td>{looksLikeId(c.name) ? titleCase(c.name.split('/').pop() ?? c.name) : c.name}</td>
                        <td>{c.current_score.toFixed(1)}</td>
                        <td>{c.max_score.toFixed(1)}</td>
                        <td>{formatPercent(c.percentage, 0)}</td>
                        <td>{c.healthy_count}</td>
                        <td>{c.unhealthy_count}</td>
                        <td>{c.not_applicable_count}</td>
                      </tr>
                    ))}
                    {zeroGroup.length > 0 && (
                      <tr className="rpt-row-muted">
                        <td colSpan={7}>
                          <strong>{zeroGroup.length} controls at 0%:</strong>{' '}
                          {zeroGroup.map(c => looksLikeId(c.name) ? titleCase(c.name.split('/').pop() ?? c.name) : c.name).join(', ')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            );
          })()}

          {/* 4.3 Advisor Scores */}
          {visibleSections['rpt-security-advisor-scores'] && !appendixSections['rpt-security-advisor-scores'] && advisorScores.data && advisorScores.data.aggregated_scores.length > 0 && (() => {
            // Build category → recommendation count map from advisorRecs
            const catRecCount: Record<string, number> = {};
            if (advisorRecs.data) {
              advisorRecs.data.forEach(r => {
                const cat = r.category.toLowerCase();
                catRecCount[cat] = (catRecCount[cat] ?? 0) + 1;
              });
            }
            return (
              <>
                <h3 className="rpt-sub-heading">5.3 Azure Advisor scores</h3>
                <p className="rpt-desc">Azure Advisor evaluates resources across Cost, Security, Reliability, Operational Excellence, and Performance pillars.</p>
                <p className="rpt-table-meta">{advisorScores.data!.aggregated_scores.length} pillars</p>
                <table className="rpt-table rpt-table--advisor-scores">
                  <thead><tr><th>Pillar</th><th>Score</th><th>Percentage</th><th>Potential Improvement</th><th>Recommendation</th></tr></thead>
                  <tbody>
                    {advisorScores.data!.aggregated_scores
                      .filter(s => !looksLikeId(s.pillar))
                      .map((s, i) => {
                      const pctVal = s.percentage;
                      const recCount = catRecCount[s.pillar.toLowerCase()] ?? 0;
                      let hint = '—';
                      if (pctVal < 50) hint = `Low score. Review ${recCount || 'available'} recommendation(s)`;
                      else if (pctVal < 70) hint = `Below target. ${recCount || 'some'} recommendation(s) available`;
                      else if (s.potential_score_increase && s.potential_score_increase > 5) hint = `+${s.potential_score_increase.toFixed(0)} points achievable`;
                      return (
                        <tr key={i}>
                          <td>{readablePillar(s.pillar)}</td>
                          <td>{s.score.toFixed(1)}</td>
                          <td>{formatPercent(pctVal, 0)}</td>
                          <td>{s.potential_score_increase != null && s.potential_score_increase > 0 ? `+${s.potential_score_increase.toFixed(1)}` : '—'}</td>
                          <td>{hint}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            );
          })()}

          {/* 4.4 Advisor Recommendations */}
          {visibleSections['rpt-security-advisor-recommendations'] && !appendixSections['rpt-security-advisor-recommendations'] && advisorRecs.data && advisorRecs.data.length > 0 && (() => {
            const sorted = [...advisorRecs.data!].sort((a, b) => {
              const order: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
              return (order[a.impact] ?? 9) - (order[b.impact] ?? 9);
            });
            const shown = sorted.slice(0, 25);
            const remaining = sorted.length - shown.length;
            return (
              <>
                <h3 className="rpt-sub-heading">5.4 Azure Advisor recommendations</h3>
                {advisorRecommendationCategoryData.length > 0 && (
                  <div className="rpt-visual-grid rpt-visual-grid--single">
                    <ChartCard
                      title="Advisor recommendations by pillar"
                      subtitle="Open recommendation volume by recommendation category"
                      data={advisorRecommendationCategoryData}
                      xKey="name"
                      yKey="value"
                      chartType="bar"
                    />
                  </div>
                )}
                <div className="rpt-wide-copy">{renderRecommendationSummary(advisorRecs.data)}</div>
                <p className="rpt-desc">Actionable recommendations from Azure Advisor, ordered by impact and retained here as an appendix-style register.{remaining > 0 ? ` Showing top ${shown.length} of ${sorted.length}.` : ''}</p>
                <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-azure-advisor-recommendations`} rows={advisorRecommendationExportRows} />
                <table className="rpt-table rpt-table--advisor-recommendations">
                  <thead><tr><th>Impact</th><th>Category</th><th>Resource</th><th>Description</th><th>Remediation</th></tr></thead>
                  <tbody>
                    {shown.map((r, i) => {
                      const resource = advisorResourceDisplay(r, subNameMap);
                      return (
                        <tr key={i}>
                          <td><span className={sevClass(r.impact.toLowerCase())}>{r.impact}</span></td>
                          <td>{readablePillar(r.category)}</td>
                          <td>
                            <strong>{resource.name}</strong>
                            <div className="rpt-subtle-meta">{resource.subscription}</div>
                          </td>
                          <td>{replaceSubscriptionIdsInText(r.description, subNameMap)}</td>
                          <td>{replaceSubscriptionIdsInText(r.remediation, subNameMap)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {remaining > 0 && <p className="rpt-desc"><em>{remaining} additional lower-priority recommendations omitted for brevity.</em></p>}
              </>
            );
          })()}

          {visibleSections['rpt-security-exposure-signals'] && !appendixSections['rpt-security-exposure-signals'] && (
            <>
              <h3 className="rpt-sub-heading">5.5 Exposure signals</h3>
              <p className="rpt-desc">These signals add context beyond secure score by showing where unhealthy Defender assessments and attack path relationships are currently concentrated.</p>
              {(securityExposureAssessmentData.length > 0 || securityExposureAttackPathData.length > 0) ? (
                <>
                  <div className="rpt-visual-grid">
                    {securityExposureAssessmentData.length > 0 && (
                      <ChartCard
                        title="Unhealthy assessments by subscription"
                        subtitle="Subscriptions with currently recorded unhealthy Defender assessments"
                        data={securityExposureAssessmentData}
                        xKey="name"
                        yKey="value"
                        chartType="bar"
                        height={320}
                        barLabelMode="inside"
                      />
                    )}
                    {securityExposureAttackPathData.length > 0 && (
                      <ChartCard
                        title="Attack paths by subscription"
                        subtitle="Subscriptions with current recorded attack path relationships"
                        data={securityExposureAttackPathData}
                        xKey="name"
                        yKey="value"
                        chartType="bar"
                        height={320}
                        barLabelMode="inside"
                      />
                    )}
                  </div>
                  <div className="rpt-visual-grid">
                    {securityExposureAssessmentData.length > 0 && (
                      <table className="rpt-table rpt-table--compact">
                        <thead><tr><th>Subscription</th><th>Unhealthy assessments</th></tr></thead>
                        <tbody>
                          {securityExposureAssessmentData.map((row) => (
                            <tr key={`assessment-${row.name}`}>
                              <td>{row.name}</td>
                              <td>{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {securityExposureAttackPathData.length > 0 && (
                      <table className="rpt-table rpt-table--compact">
                        <thead><tr><th>Subscription</th><th>Attack paths</th></tr></thead>
                        <tbody>
                          {securityExposureAttackPathData.map((row) => (
                            <tr key={`attack-${row.name}`}>
                              <td>{row.name}</td>
                              <td>{row.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : <p className="rpt-empty">No additional Defender exposure signals were returned in the current snapshot.</p>}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 5. GOVERNANCE ═══════════════════════ */}
        {visibleSections['rpt-governance'] && (
        <section className={`rpt-section${appendixSections['rpt-governance'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-governance" style={{ order: sectionOrder('rpt-governance', 50) }}>
          <SectionHeading num="6" title="Governance" sectionId="rpt-governance" />
          <p className="rpt-narrative">{narrativeGovernance(govPolicy.data, govRbac.data, govOrphans.data)}</p>
          {visibleSections['rpt-governance-interpretation'] && !appendixSections['rpt-governance-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">6.0 Governance overview</h3>
              <p className="rpt-desc">{interpretGovernanceSection(govPolicy.data, govRbac.data, govOrphans.data)}</p>
            </>
          )}

          {/* 5.1 Policy Compliance */}
          {visibleSections['rpt-governance-policy'] && !appendixSections['rpt-governance-policy'] && (
            <>
          <h3 className="rpt-sub-heading">6.1 Policy compliance</h3>
          <p className="rpt-desc">Azure Policy evaluates resources against organisational policies. Non-compliant resources should be reviewed and remediated.</p>
          {govPolicy.data ? (
            <>
              <div className="rpt-kv-grid rpt-kv-grid--4col">
                <div className="rpt-kv"><span className="rpt-kv__label">Policy Assignments</span><span className="rpt-kv__value">{govPolicy.data.total_policy_assignments}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Non-Compliant Resources</span><span className="rpt-kv__value">{govPolicy.data.total_non_compliant_resources}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Non-Compliant Policies</span><span className="rpt-kv__value">{govPolicy.data.total_non_compliant_policies}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Subscriptions</span><span className="rpt-kv__value">{govPolicy.data.subscription_count}</span></div>
              </div>
              {policyBySubscriptionChartData.length > 0 && (
                <div className="rpt-visual-grid rpt-visual-grid--single">
                  <ChartCard
                    title="Non-compliant resources by subscription"
                    subtitle="Top subscriptions by current non-compliant resource count"
                    data={policyBySubscriptionChartData}
                    xKey="name"
                    yKey="value"
                    chartType="bar"
                    height={340}
                    barLabelMode="vertical-inside"
                  />
                </div>
              )}
              {govPolicy.data.by_subscription.length > 0 && (
                <>
                  <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-governance-policy-compliance`} rows={governancePolicyExportRows} />
                  <p className="rpt-table-meta">{govPolicy.data!.by_subscription.length} subscriptions</p>
                  <table className="rpt-table rpt-table--governance-policy">
                  <thead><tr><th>Subscription</th><th>Total Resources</th><th>Compliant</th><th>Non-Compliant Resources</th><th>Non-Compliant Policies</th><th>Policy Names</th><th>Assignments</th></tr></thead>
                  <tbody>
                    {govPolicy.data.by_subscription.map(s => (
                      <tr key={s.subscription_id}>
                        <td>{resolveSubscriptionName(s.subscription_name, s.subscription_id, subNameMap)}</td>
                        <td>{s.total_resources}</td>
                        <td>{s.compliant}</td>
                        <td>{s.non_compliant_resources}</td>
                        <td>{s.non_compliant_policies}</td>
                        <td>{policyNamesForSubscription(s)}</td>
                        <td>{s.policy_assignments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </>
          ) : <p className="rpt-empty">Policy compliance data not available.</p>}
            </>
          )}

          {/* 5.2 Role Assignments */}
          {visibleSections['rpt-governance-rbac'] && !appendixSections['rpt-governance-rbac'] && (
            <>
          <h3 className="rpt-sub-heading">6.2 Role-based access control (RBAC)</h3>
          <p className="rpt-desc">This section summarises role assignments across the Azure estate. Excessive Owner or Contributor roles should be reviewed.</p>
          {govRbac.data ? (
            <>
              <div className="rpt-kv-grid rpt-kv-grid--4col">
                <div className="rpt-kv"><span className="rpt-kv__label">Total Assignments</span><span className="rpt-kv__value">{govRbac.data.total_count}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Owner</span><span className="rpt-kv__value">{govRbac.data.owner_count}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Contributor</span><span className="rpt-kv__value">{govRbac.data.contributor_count}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Subscriptions</span><span className="rpt-kv__value">{govRbac.data.subscription_count}</span></div>
              </div>
              {rbacBySubscriptionChartData.length > 0 && (
                <div className="rpt-visual-grid rpt-visual-grid--single">
                  <ChartCard
                    title="RBAC assignments by subscription"
                    subtitle="Top subscriptions by RBAC assignment count"
                    data={rbacBySubscriptionChartData}
                    xKey="name"
                    yKey="value"
                    chartType="bar"
                    height={340}
                    barLabelMode="vertical-inside"
                  />
                </div>
              )}
              {Object.keys(govRbac.data.by_role).length > 0 && (
                <>
                  <h4 className="rpt-sub-sub-heading">Assignments by Role</h4>
                  <p className="rpt-table-meta">{Object.keys(govRbac.data!.by_role).length} roles</p>
                  <table className="rpt-table">
                    <thead><tr><th>Role</th><th>Count</th></tr></thead>
                    <tbody>
                      {Object.entries(govRbac.data.by_role).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                        <tr key={role}><td>{role}</td><td>{count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {Object.keys(govRbac.data.by_principal_type).length > 0 && (
                <>
                  <h4 className="rpt-sub-sub-heading">Assignments by Principal Type</h4>
                  <p className="rpt-table-meta">{Object.keys(govRbac.data!.by_principal_type).length} types</p>
                  <table className="rpt-table">
                    <thead><tr><th>Principal Type</th><th>Count</th></tr></thead>
                    <tbody>
                      {Object.entries(govRbac.data.by_principal_type).sort((a, b) => b[1] - a[1]).map(([pt, count]) => (
                        <tr key={pt}><td>{pt}</td><td>{count}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : <p className="rpt-empty">RBAC data not available.</p>}
            </>
          )}

          {/* 5.3 Orphaned Resources */}
          {visibleSections['rpt-governance-orphans'] && !appendixSections['rpt-governance-orphans'] && (
            <>
          <h3 className="rpt-sub-heading">6.3 Potentially orphaned resources</h3>
          <p className="rpt-desc">These are technically detached resources identified from Azure metadata. They should be checked with the customer to confirm whether they are genuinely orphaned or intentionally retained for standby, migration, or recovery purposes.</p>
          {govOrphans.data && govOrphans.data.orphans.length > 0 ? (
            <>
              <div className="rpt-kv-grid rpt-kv-grid--3col">
                <div className="rpt-kv"><span className="rpt-kv__label">Total Orphans</span><span className="rpt-kv__value">{govOrphans.data.total_count}</span></div>
                {Object.entries(govOrphans.data.by_type).map(([type, count]) => (
                  <div className="rpt-kv" key={type}><span className="rpt-kv__label">{type}</span><span className="rpt-kv__value">{count}</span></div>
                ))}
              </div>
              {orphanedByCategoryChartData.length > 0 && (
                <div className="rpt-visual-grid rpt-visual-grid--single">
                  <ChartCard
                    title="Orphaned resources by category"
                    subtitle="Current count by orphaned-resource category"
                    data={orphanedByCategoryChartData}
                    xKey="name"
                    yKey="value"
                    chartType="bar"
                    height={280}
                  />
                </div>
              )}
              <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-orphaned-resources`} rows={orphanedResourceExportRows} />
              <p className="rpt-table-meta">{govOrphans.data!.orphans.length} resources</p>
              <table className="rpt-table">
                <thead><tr><th>Name</th><th>Category</th><th>Type</th><th>Location</th><th>Resource Group</th><th>Last Month Cost</th><th>Size (GB)</th></tr></thead>
                <tbody>
                  {govOrphans.data.orphans.map((o, i) => (
                    <tr key={i}>
                      <td>{o.resource_name}</td>
                      <td>{o.category}</td>
                      <td>{shortType(o.resource_type)}</td>
                      <td>{o.location}</td>
                      <td>{o.resource_group}</td>
                      <td>{orphanCostByName.has(o.resource_name.trim().toLowerCase()) ? formatCurrency(orphanCostByName.get(o.resource_name.trim().toLowerCase()) ?? 0) : '—'}</td>
                      <td>{o.size_gb?.toFixed(1) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : govOrphans.data ? (
            <p className="rpt-positive">No orphaned resources detected. Well maintained.</p>
          ) : <p className="rpt-empty">Orphaned resource data not available.</p>}
            </>
          )}

          {visibleSections['rpt-governance-actions'] && !appendixSections['rpt-governance-actions'] && (
            <>
              <h3 className="rpt-sub-heading">6.4 Governance action priorities</h3>
              <p className="rpt-desc">These actions highlight the most meaningful governance priorities emerging from policy, access, and hygiene evidence.</p>
              {recommendedActions.filter((item) => item.category === 'Governance').length > 0 ? (
                <div className="rpt-stakeholder-list">
                  {recommendedActions
                    .filter((item) => item.category === 'Governance')
                    .slice(0, 3)
                    .map((item, index) => (
                      <div key={`gov-action-${index}`} className="rpt-stakeholder-card">
                        <h4>{item.action}</h4>
                        <p><strong>Priority:</strong> {item.priority}</p>
                        <p>{item.rationale}</p>
                      </div>
                    ))}
                </div>
              ) : <p className="rpt-empty">No governance-specific priority actions were generated from the current evidence.</p>}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 6. INTEGRATIONS ═════════════════════ */}
        {visibleSections['rpt-integrations'] && (
        <section className={`rpt-section${appendixSections['rpt-integrations'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-integrations" style={{ order: sectionOrder('rpt-integrations', 60) }}>
          <SectionHeading num="7" title="Integration landscape" sectionId="rpt-integrations" />
          <p className="rpt-narrative">{narrativeIntegrations(intSummary.data, intList.data)}</p>
          {visibleSections['rpt-integrations-interpretation'] && !appendixSections['rpt-integrations-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">7.0 Integration overview</h3>
              <p className="rpt-desc">{interpretIntegrationSection(intSummary.data, intList.data)}</p>
            </>
          )}

          {/* Summary KVs */}
          {intSummary.data && (
            <div className="rpt-kv-grid rpt-kv-grid--4col">
              <div className="rpt-kv"><span className="rpt-kv__label">Total Integrations</span><span className="rpt-kv__value">{intSummary.data.total_integrations}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Deprecated</span><span className="rpt-kv__value">{intSummary.data.deprecated_count}</span></div>
              {intSummary.data.healthy != null && <div className="rpt-kv"><span className="rpt-kv__label">Healthy</span><span className="rpt-kv__value">{intSummary.data.healthy}</span></div>}
              {intSummary.data.degraded != null && <div className="rpt-kv"><span className="rpt-kv__label">Degraded</span><span className="rpt-kv__value">{intSummary.data.degraded}</span></div>}
            </div>
          )}

          {/* By type */}
          {visibleSections['rpt-integrations-by-type'] && !appendixSections['rpt-integrations-by-type'] && intSummary.data && Object.keys(intSummary.data.by_type).length > 0 && (
            <>
              <h3 className="rpt-sub-heading">7.1 Integrations by type</h3>
              <p className="rpt-table-meta">{Object.entries(intSummary.data!.by_type).length} types</p>
              <table className="rpt-table">
                <thead><tr><th>Integration Type</th><th>Count</th></tr></thead>
                <tbody>
                  {Object.entries(intSummary.data.by_type).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                    <tr key={type}><td>{type}</td><td>{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Full integration list */}
          {visibleSections['rpt-integrations-register'] && !appendixSections['rpt-integrations-register'] && intList.data && intList.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">7.2 Integration point register</h3>
              <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-integration-register`} rows={integrationRegisterExportRows} />
              <p className="rpt-table-meta">{intList.data!.length} integrations</p>
              <table className="rpt-table rpt-table--compact rpt-table--integration-register">
                <thead><tr><th>Source</th><th>Target</th><th>Type</th><th>Protocol</th><th>Direction</th><th>Health</th><th>Deprecated</th></tr></thead>
                <tbody>
                  {intList.data.map((ip, i) => (
                    <tr key={i} className={ip.is_deprecated_source || ip.is_deprecated_target ? 'rpt-row-warn' : ''}>
                      <td>{ip.source_resource_name || ip.source_system || nameFromResourceId(ip.source_resource_id, 'Unknown')}</td>
                      <td>{ip.target_name && !looksLikeId(ip.target_name) ? ip.target_name : ip.target_system || nameFromResourceId(ip.target_resource_id, ip.target_name || '—')}</td>
                      <td>{ip.integration_type}</td>
                      <td>{ip.protocol ?? '—'}</td>
                      <td>{titleCase(ip.direction)}</td>
                      <td>{ip.health_status ?? 'Not monitored'}</td>
                      <td>{ip.is_deprecated_source || ip.is_deprecated_target ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Recommendations */}
          {visibleSections['rpt-integrations-recommendations'] && !appendixSections['rpt-integrations-recommendations'] && intRecs.data && intRecs.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">7.3 Integration recommendations</h3>
              {intRecs.data.map((r, i) => (
                <div key={i} className="rpt-callout">
                  <span className={sevClass(r.priority.toLowerCase())}>{r.priority}</span>
                  <div><strong>{r.title}</strong><p>{r.description}</p></div>
                </div>
              ))}
            </>
          )}
        </section>
        )}

        {visibleSections['rpt-integrationmap'] && (
        <section className={`rpt-section${appendixSections['rpt-integrationmap'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-integrationmap" style={{ order: sectionOrder('rpt-integrationmap', 65) }}>
          <SectionHeading num="7.5" title="Integration map" sectionId="rpt-integrationmap" />
          <p className="rpt-narrative">
            This reviewed integration map captures the workshop-validated current-state picture rather than the full raw telemetry baseline. It is intended to be the customer-usable integration deliverable: a maintained high-level diagram plus a shortlist of the integrations that matter most operationally.
          </p>

          {visibleSections['rpt-integrationmap-diagram'] && !appendixSections['rpt-integrationmap-diagram'] && (
            <>
              <h3 className="rpt-sub-heading">7.5.1 Reviewed architecture diagram</h3>
              <p className="rpt-desc">
                A reviewed architecture diagram should be added only when a profile-scoped diagram artefact exists for the active customer profile.
              </p>
              <p className="rpt-empty">No profile-scoped reviewed architecture diagram is stored for this profile.</p>
            </>
          )}

          {visibleSections['rpt-integrationmap-shortlist'] && !appendixSections['rpt-integrationmap-shortlist'] && reviewedIntegrationItems.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">7.5.2 Reviewed integration shortlist</h3>
              <div className="rpt-kv-grid rpt-kv-grid--4col">
                <div className="rpt-kv"><span className="rpt-kv__label">Reviewed items</span><span className="rpt-kv__value">{reviewedIntegrationCounts.total}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Confirmed</span><span className="rpt-kv__value">{reviewedIntegrationCounts.confirmed}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Legacy</span><span className="rpt-kv__value">{reviewedIntegrationCounts.legacy}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Temporary migration</span><span className="rpt-kv__value">{reviewedIntegrationCounts.temporary}</span></div>
              </div>
              <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-reviewed-integration-shortlist`} rows={integrationReviewExportRows} />
              <p className="rpt-table-meta">{reviewedIntegrationItems.length} reviewed shortlist items</p>
              <table className="rpt-table rpt-table--compact">
                <thead><tr><th>ID</th><th>Priority</th><th>Integration</th><th>Method</th><th>Status</th><th>Current understanding</th><th>Meeting notes</th></tr></thead>
                <tbody>
                  {reviewedIntegrationItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.priority}</td>
                      <td>{item.integration}</td>
                      <td>{item.integration_method || '—'}</td>
                      <td>{item.status || 'Not Reviewed'}</td>
                      <td>{item.current_understanding || '—'}</td>
                      <td>{item.meeting_notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {visibleSections['rpt-integrationmap-shortlist'] && !appendixSections['rpt-integrationmap-shortlist'] && integrationReview.status === 'success' && reviewedIntegrationItems.length === 0 && (
            <p className="rpt-empty">No profile-scoped reviewed integration shortlist is stored for this profile.</p>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 7. DYNAMICS 365 ═════════════════════ */}
        {visibleSections['rpt-dynamics'] && (
        <section className={`rpt-section${appendixSections['rpt-dynamics'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-dynamics" style={{ order: sectionOrder('rpt-dynamics', 70) }}>
          <SectionHeading num="8" title="Dynamics 365 platform" sectionId="rpt-dynamics" />
          <ReportPrimer
            about={DYNAMICS_PLATFORM_PRIMER.about}
            summary={DYNAMICS_PLATFORM_PRIMER.summary}
            howToRead={DYNAMICS_PLATFORM_PRIMER.howToRead}
          />
          <p className="rpt-narrative">{narrativeDynamics(d365Envs.data, d365Users.data, d365BC.data)}</p>
          {dynamicsManualContext.data?.additional_notes && (
            <p className="rpt-narrative">{dynamicsManualContext.data.additional_notes}</p>
          )}
          <p className="rpt-narrative">
            The same export adds useful licensing and commercial context that was not fully visible through the live portal
            views. It shows active Dynamics 365 Sales, Team Members, Business Central, Power Apps, and Power Automate licensing
            patterns, while also confirming that portal-visible billing does not represent the full commercial picture because
            Microsoft 365 and Dynamics licensing are procured separately through external retailers. Taken together, this
            reinforces that the Dynamics landscape should be assessed as a broader business platform estate with multiple
            environments, varied license types, and supporting operational dependencies, rather than as a narrow Dataverse-only
            footprint.
          </p>
          {visibleSections['rpt-dynamics-interpretation'] && !appendixSections['rpt-dynamics-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">8.0 Dynamics overview</h3>
              <p className="rpt-desc">{interpretDynamicsSection(d365Envs.data, d365Modules.data, d365Workflows.data, dynamicsManualContext.data)}</p>
            </>
          )}
          {visibleSections['rpt-dynamics-footprint'] && !appendixSections['rpt-dynamics-footprint'] && (
            <>
              <h3 className="rpt-sub-heading">8.0.1 Dynamics footprint</h3>
              <div className="rpt-stakeholder-list rpt-recommendation-detail-grid">
                <div className="rpt-stakeholder-card">
                  <h4>What the current footprint suggests</h4>
                  <p>{interpretDynamicsSection(d365Envs.data, d365Modules.data, d365Workflows.data, dynamicsManualContext.data)}</p>
                </div>
                <div className="rpt-stakeholder-card">
                  <h4>Immediate validation actions</h4>
                  <p>Validate whether the currently discovered environments represent the full platform footprint, especially where role, Dataverse, or Business Central visibility is permission-limited.</p>
                  <p>Confirm whether high workflow and solution counts reflect intended production complexity, historical build-up, or platform areas that should be simplified.</p>
                </div>
              </div>
              <div className="dashboard-grid" style={{ marginTop: 16, marginBottom: 16 }}>
                {dynamicsEnvTypeChartData.length > 0 && (
                  <ChartCard title="Environment type distribution" subtitle="Breakdown of discovered D365/Power Platform environments by type">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={dynamicsEnvTypeChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="54%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={2}
                          labelLine={{ stroke: dynamicsChartTheme.grid, strokeWidth: 1.2 }}
                          label={({ name, value, x, y, textAnchor }: { name?: string; value?: number; x?: number; y?: number; textAnchor?: 'end' | 'inherit' | 'start' | 'middle' }) => {
                            if (!name || !value || x == null || y == null) return '';
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={dynamicsChartTheme.text}
                                stroke={dynamicsChartTheme.halo}
                                strokeWidth={3}
                                paintOrder="stroke"
                                fontSize={12}
                                fontWeight={600}
                                textAnchor={(textAnchor ?? 'middle') as 'end' | 'inherit' | 'start' | 'middle'}
                                dominantBaseline="central"
                              >
                                {`${name} (${value})`}
                              </text>
                            );
                          }}
                        >
                          {dynamicsEnvTypeChartData.map((_, i) => (
                            <Cell key={i} fill={DYNAMICS_ENV_TYPE_COLORS[i % DYNAMICS_ENV_TYPE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
              <div className="dashboard-grid" style={{ marginBottom: 16 }}>
                {dynamicsUserEnvironmentChartData.length > 0 && (
                  <ChartCard title="Users by environment" subtitle="Share of discovered Dynamics users in each environment">
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={dynamicsUserEnvironmentChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="54%"
                          innerRadius={72}
                          outerRadius={122}
                          paddingAngle={2}
                          labelLine={{ stroke: dynamicsChartTheme.grid, strokeWidth: 1.2 }}
                          label={renderEnvironmentDonutLabel('users', dynamicsChartTheme.text, dynamicsChartTheme.halo)}
                        >
                          {dynamicsUserEnvironmentChartData.map((_, i) => (
                            <Cell key={i} fill={DYNAMICS_ENV_BREAKDOWN_COLORS[i % DYNAMICS_ENV_BREAKDOWN_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
                {dynamicsWorkflowEnvironmentChartData.length > 0 && (
                  <ChartCard title="Workflows by environment" subtitle="Share of discovered workflows in each environment">
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={dynamicsWorkflowEnvironmentChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="54%"
                          innerRadius={72}
                          outerRadius={122}
                          paddingAngle={2}
                          labelLine={{ stroke: dynamicsChartTheme.grid, strokeWidth: 1.2 }}
                          label={renderEnvironmentDonutLabel('workflows', dynamicsChartTheme.text, dynamicsChartTheme.halo)}
                        >
                          {dynamicsWorkflowEnvironmentChartData.map((_, i) => (
                            <Cell key={i} fill={DYNAMICS_ENV_BREAKDOWN_COLORS[i % DYNAMICS_ENV_BREAKDOWN_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
                {dynamicsModuleEnvironmentChartData.length > 0 && (
                  <ChartCard title="Solutions by environment" subtitle="Share of discovered solutions and modules in each environment">
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={dynamicsModuleEnvironmentChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="54%"
                          innerRadius={72}
                          outerRadius={122}
                          paddingAngle={2}
                          labelLine={{ stroke: dynamicsChartTheme.grid, strokeWidth: 1.2 }}
                          label={renderEnvironmentDonutLabel('solutions', dynamicsChartTheme.text, dynamicsChartTheme.halo)}
                        >
                          {dynamicsModuleEnvironmentChartData.map((_, i) => (
                            <Cell key={i} fill={DYNAMICS_ENV_BREAKDOWN_COLORS[i % DYNAMICS_ENV_BREAKDOWN_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}
              </div>
              <div className="rpt-stakeholder-card" style={{ marginTop: 16 }}>
                <h4>Manual context</h4>
                {manualContextHighlights.length > 0 && (
                  <div className="dashboard-grid" style={{ marginBottom: 16 }}>
                    {manualContextHighlights.map((item) => (
                      <div key={item.label} className="dashboard-card">
                        <span className="summary-label">{item.label}</span>
                        <span className="big-number">{item.value}</span>
                        {item.note && <span className="summary-note">{item.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {(dynamicsManualContext.data?.extra_environments || dynamicsManualContext.data?.dataverse_capacity_notes || dynamicsManualContext.data?.dataverse_license_notes || dynamicsManualContext.data?.dataverse_cost_notes || dynamicsManualContext.data?.discovery_gap_notes || dynamicsManualContext.data?.additional_notes) ? (
                  <>
                    {dynamicsManualContext.data?.extra_environments && <p><strong>Additional environments:</strong> {dynamicsManualContext.data.extra_environments}</p>}
                    {dynamicsManualContext.data?.dataverse_capacity_notes && <p><strong>Dataverse capacity:</strong> {dynamicsManualContext.data.dataverse_capacity_notes}</p>}
                    {dynamicsManualContext.data?.dataverse_license_notes && <p><strong>Licensing notes:</strong> {dynamicsManualContext.data.dataverse_license_notes}</p>}
                    {dynamicsManualContext.data?.dataverse_cost_notes && <p><strong>Cost notes:</strong> {dynamicsManualContext.data.dataverse_cost_notes}</p>}
                    {dynamicsManualContext.data?.discovery_gap_notes && <p><strong>Discovery gaps:</strong> {dynamicsManualContext.data.discovery_gap_notes}</p>}
                    {dynamicsManualContext.data?.additional_notes && <p><strong>Additional notes:</strong> {dynamicsManualContext.data.additional_notes}</p>}
                  </>
                ) : (
                  <p>No manual platform context has been added yet. This area can be supplemented later without changing the underlying snapshot.</p>
                )}
              </div>
            </>
          )}

          {/* 7.1 Environments */}
          {visibleSections['rpt-dynamics-environments'] && !appendixSections['rpt-dynamics-environments'] && (
            <>
          <h3 className="rpt-sub-heading">8.1 Environments</h3>
          {d365Envs.data && d365Envs.data.length > 0 && <p className="rpt-table-meta">{d365Envs.data.length} environments</p>}
          {d365Envs.data && d365Envs.data.length > 0 ? (
            <table className="rpt-table">
              <thead><tr><th>Name</th><th>Environment type</th><th>Region</th><th>Version</th><th>Status</th><th>DB Used (MB)</th><th>DB Allocated (MB)</th><th>URL</th></tr></thead>
              <tbody>
                {d365Envs.data.map(e => (
                  <tr key={e.id}>
                    <td>{e.display_name}</td>
                    <td>{e.environment_type ?? e.type ?? '—'}</td>
                    <td>{e.region || '—'}</td>
                    <td>{e.version || '—'}</td>
                    <td>{e.status || (typeof e.state === 'string' && e.state.trim() ? e.state : '—')}</td>
                    <td>{e.database_capacity_used_mb?.toLocaleString() ?? '—'}</td>
                    <td>{e.database_capacity_allocated_mb?.toLocaleString() ?? '—'}</td>
                    <td>{e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="rpt-link">{new URL(e.url).hostname}</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rpt-empty">No Dynamics 365 environments discovered.</p>}
            </>
          )}

          {/* 7.2 Modules */}
          {visibleSections['rpt-dynamics-users'] && !appendixSections['rpt-dynamics-users'] && d365Users.data && d365Users.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">8.2 Users and roles</h3>
              <p className="rpt-table-meta">{d365Users.data!.length} users</p>
              <table className="rpt-table">
                <thead><tr><th>Name</th><th>Email</th><th>Environment</th><th>Roles</th><th>Business Unit</th><th>Disabled</th><th>Active 30d</th></tr></thead>
                <tbody>
                  {d365Users.data.map((user) => (
                    <tr key={user.user_id}>
                      <td>{user.display_name ?? user.full_name ?? '—'}</td>
                      <td>{user.email ?? '—'}</td>
                      <td>{environmentLabel(user.environment)}</td>
                      <td>{(user.roles ?? user.security_roles ?? []).join(', ') || '—'}</td>
                      <td>{user.business_unit ?? '—'}</td>
                      <td>{user.is_disabled ? 'Yes' : 'No'}</td>
                      <td>{user.is_active_30d == null ? 'Unknown' : user.is_active_30d ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 7.3 Modules */}
          {visibleSections['rpt-dynamics-modules'] && !appendixSections['rpt-dynamics-modules'] && d365Modules.data && d365Modules.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">8.3 Modules and solutions</h3>
              <p className="rpt-table-meta">{d365Modules.data!.length} rows</p>
              <table className="rpt-table">
                <thead><tr><th>Module</th><th>Entity</th><th>Record Count</th><th>Environment</th></tr></thead>
                <tbody>
                  {d365Modules.data.map((m, i) => (
                    <tr key={i}>
                      <td>{m.module}</td>
                      <td>{m.entity_name}</td>
                      <td>{m.record_count?.toLocaleString() ?? '—'}</td>
                      <td>{m.environment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 7.4 Workflow health */}
          {visibleSections['rpt-dynamics-workflows'] && !appendixSections['rpt-dynamics-workflows'] && d365Workflows.data && d365Workflows.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">8.4 Workflow health</h3>
              <p className="rpt-table-meta">{d365Workflows.data!.length} workflows</p>
              <table className="rpt-table">
                <thead><tr><th>Workflow</th><th>State</th><th>Status</th><th>Success Rate</th><th>Total Runs</th><th>Environment</th></tr></thead>
                <tbody>
                  {d365Workflows.data.map((w, i) => (
                    <tr key={i}>
                      <td>{w.workflow_name ?? w.name}</td>
                      <td>{w.state}</td>
                      <td>{w.status}</td>
                      <td>{w.success_rate != null ? formatPercent(w.success_rate, 0) : '—'}</td>
                      <td>{w.total_runs ?? '—'}</td>
                      <td>{w.environment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* 7.5 Business Central */}
          {visibleSections['rpt-dynamics-bc'] && !appendixSections['rpt-dynamics-bc'] && d365BC.data && d365BC.data.length > 0 && (
            <>
              <h3 className="rpt-sub-heading">8.5 Business Central</h3>
              <p className="rpt-table-meta">{d365BC.data!.length} companies</p>
              <table className="rpt-table">
                <thead><tr><th>Company</th><th>Customers</th><th>Vendors</th><th>Items</th><th>GL Entries</th><th>Environment</th></tr></thead>
                <tbody>
                  {d365BC.data.map((bc, i) => (
                    <tr key={i}>
                      <td>{bc.company_name}</td>
                      <td>{bc.customers_count?.toLocaleString() ?? '—'}</td>
                      <td>{bc.vendors_count?.toLocaleString() ?? '—'}</td>
                      <td>{bc.items_count?.toLocaleString() ?? '—'}</td>
                      <td>{bc.gl_entries_count?.toLocaleString() ?? '—'}</td>
                      <td>{bc.environment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {visibleSections['rpt-dynamics-linkage'] && !appendixSections['rpt-dynamics-linkage'] && (
            <>
              <h3 className="rpt-sub-heading">8.6 Azure spend and integration linkage</h3>
              <p className="rpt-desc">These rows are inferred from current integration and cost metadata using Dynamics-related keywords, and should be treated as directional evidence for validation.</p>
              <div className="rpt-kv-grid rpt-kv-grid--3col">
                <div className="rpt-kv"><span className="rpt-kv__label">Matched integrations</span><span className="rpt-kv__value">{dynamicsIntegrationRows.length}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Matched costed resources</span><span className="rpt-kv__value">{dynamicsCostRows.length}</span></div>
                <div className="rpt-kv"><span className="rpt-kv__label">Matched monthly spend</span><span className="rpt-kv__value">{formatCurrency(dynamicsLinkedMonthlySpend)}</span></div>
              </div>
              {dynamicsIntegrationRows.length > 0 && <p className="rpt-table-meta">{dynamicsIntegrationRows.length} integrations</p>}
              {dynamicsIntegrationRows.length > 0 && (
                <table className="rpt-table">
                  <thead><tr><th>Integration</th><th>Source</th><th>Target</th><th>Type</th><th>Status</th></tr></thead>
                  <tbody>
                    {dynamicsIntegrationRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.source_system ?? row.source_resource_name ?? '—'}</td>
                        <td>{row.target_system ?? row.target_name ?? '—'}</td>
                        <td>{row.integration_type}</td>
                        <td>{row.health_status ?? 'Not monitored'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dynamicsCostRows.length > 0 && <p className="rpt-table-meta">{dynamicsCostRows.length} resources</p>}
              {dynamicsCostRows.length > 0 && (
                <table className="rpt-table">
                  <thead><tr><th>Resource</th><th>Type</th><th>1-Month</th><th>3-Month</th><th>6-Month</th></tr></thead>
                  <tbody>
                    {dynamicsCostRows.map((row) => (
                      <tr key={`dyn-cost-${row.resource_id}`}>
                        <td>{row.resource_name}</td>
                        <td>{shortType(row.resource_type)}</td>
                        <td>{formatCurrency(row.cost_1m ?? 0)}</td>
                        <td>{formatCurrency(row.cost_3m ?? 0)}</td>
                        <td>{formatCurrency(row.cost_6m ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dynamicsIntegrationRows.length === 0 && dynamicsCostRows.length === 0 && (
                <p className="rpt-empty">No Dynamics-linked integration or cost evidence was matched from the current metadata.</p>
              )}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 8. LICENSES ═════════════════════════ */}
        {visibleSections['rpt-licenses'] && (
        <section className={`rpt-section${appendixSections['rpt-licenses'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-licenses" style={{ order: sectionOrder('rpt-licenses', 80) }}>
          <SectionHeading num="9" title="License utilisation" sectionId="rpt-licenses" />
          <p className="rpt-narrative">{narrativeLicenses(licSummary.data)}</p>
          {visibleSections['rpt-licenses-interpretation'] && !appendixSections['rpt-licenses-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">9.0 License overview</h3>
              <p className="rpt-desc">{interpretLicenseSection(licSummary.data)} In this report, "inactive" means no recorded sign-in in the available Microsoft Graph telemetry over the last 30 days. These assignments should be checked with the customer and then either kept intentionally or unassigned.</p>
            </>
          )}
          {licSkus.data && licSkus.data.length > 0 && (
            <div className="rpt-visual-grid rpt-visual-grid--single">
              <LicenseUsageChart
                data={licSkus.data.map((item) => ({
                  sku_name: item.sku_display_name || item.sku_part_number,
                  purchased: item.purchased,
                  consumed: item.consumed,
                }))}
              />
            </div>
          )}

          {/* Summary KVs */}
          {licSummary.data && (
            <div className="rpt-kv-grid rpt-kv-grid--4col">
              <div className="rpt-kv"><span className="rpt-kv__label">Total SKUs</span><span className="rpt-kv__value">{licSummary.data.total_skus}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Purchased</span><span className="rpt-kv__value">{licSummary.data.total_purchased?.toLocaleString()}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Consumed</span><span className="rpt-kv__value">{licSummary.data.total_consumed?.toLocaleString()}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Available</span><span className="rpt-kv__value">{licSummary.data.total_available?.toLocaleString()}</span></div>
              <div className="rpt-kv"><span className="rpt-kv__label">Utilisation</span><span className="rpt-kv__value">{formatPercent(licSummary.data.overall_utilization_pct, 0)}</span></div>
              {licSummary.data.estimated_waste_monthly != null && (
                <div className="rpt-kv"><span className="rpt-kv__label">Est. Monthly Waste</span><span className="rpt-kv__value rpt-value--warn">{formatCurrency(licSummary.data.estimated_waste_monthly)}</span></div>
              )}
              {licSummary.data.inactive_licensed_users > 0 && (
                <div className="rpt-kv"><span className="rpt-kv__label">Inactive Licensed Users</span><span className="rpt-kv__value rpt-value--warn">{licSummary.data.inactive_licensed_users}</span></div>
              )}
            </div>
          )}

          {/* 8.1 SKU Detail */}
          {visibleSections['rpt-licenses-sku'] && !appendixSections['rpt-licenses-sku'] && (
            <>
          <h3 className="rpt-sub-heading">9.1 License SKU detail</h3>
          <p className="rpt-desc">Full breakdown of all Microsoft 365 and Azure license SKUs with utilisation metrics.</p>
          <p className="rpt-desc">{licensePaygNote(licSummary.data)}</p>
          {licSkus.data && licSkus.data.length > 0 ? (
            <>
            <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-license-sku-detail`} rows={licenseSkuExportRows} />
            <p className="rpt-table-meta">{licSkus.data!.length} SKUs</p>
            <table className="rpt-table">
              <thead><tr><th>SKU</th><th>Purchased</th><th>Consumed</th><th>Available</th><th>Utilisation</th><th>Underutilised</th></tr></thead>
              <tbody>
                {licSkus.data.sort((a, b) => b.purchased - a.purchased).map(sku => (
                  <tr key={sku.sku_id} className={sku.is_underutilized ? 'rpt-row-warn' : ''}>
                    <td>{sku.sku_display_name || sku.sku_part_number}</td>
                    <td>{sku.purchased}</td>
                    <td>{sku.consumed}</td>
                    <td>{sku.available}</td>
                    <td>{formatPercent(sku.utilization_pct, 0)}{sku.is_payg ? ' PAYG' : ''}</td>
                    <td>{sku.is_payg ? 'N/A PAYG' : sku.is_underutilized ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rpt-desc">{licensePaygNote(licSummary.data)}</p>
            </>
          ) : <p className="rpt-empty">No SKU data available.</p>}
            </>
          )}

          {/* 8.2 Licensed Users */}
          {visibleSections['rpt-licenses-users'] && !appendixSections['rpt-licenses-users'] && (
            <>
          <h3 className="rpt-sub-heading">9.2 Licensed users</h3>
          <p className="rpt-desc">Users with assigned licenses, showing activity status and estimated cost. "Inactive 30d" means no recorded sign-in in the available Microsoft Graph telemetry over the last 30 days. Review these users with the customer, then either keep the assignment intentionally or unassign it.</p>
          {licUsers.data && licUsers.data.length > 0 && <p className="rpt-table-meta">{licUsers.data.length} users</p>}
          {licUsers.data && licUsers.data.length > 0 ? (
            <table className="rpt-table rpt-table--compact">
              <thead><tr><th>User</th><th>UPN</th><th>Licenses</th><th>Last Sign-In</th><th>Inactive 30d</th><th>Est. Monthly Cost</th></tr></thead>
              <tbody>
                {licUsers.data.map(u => (
                  <tr key={u.user_id} className={u.is_inactive_30d ? 'rpt-row-warn' : ''}>
                    <td>{u.display_name}</td>
                    <td>{u.user_principal_name}</td>
                    <td>{u.assigned_licenses.length}</td>
                    <td>{u.last_sign_in ? formatDate(u.last_sign_in) : '—'}</td>
                    <td>{u.is_inactive_30d == null ? '—' : u.is_inactive_30d ? 'Yes' : 'No'}</td>
                    <td>{u.estimated_monthly_cost != null ? formatCurrency(u.estimated_monthly_cost) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rpt-empty">No licensed user data available.</p>}
            </>
          )}
        </section>
        )}

        {/* ═══════════════════════════ 2. APPLICATION INVENTORY & OWNERSHIP ════════════════════ */}
        {visibleSections['rpt-portfolio'] && (
        <section className={`rpt-section${appendixSections['rpt-portfolio'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-portfolio" style={{ order: sectionOrder('rpt-portfolio', 19) }}>
          <SectionHeading num="2" title="Application inventory and ownership" sectionId="rpt-portfolio" />
          <p className="rpt-narrative">
            This section brings together inferred application groupings from Azure evidence and the maintained application portfolio, providing a combined view of application inventory, ownership, criticality, and future-state direction.
          </p>
          {visibleSections['rpt-applications-discovery'] && !appendixSections['rpt-applications-discovery'] && (
            <>
              <h3 className="rpt-sub-heading">2.1 Applications discovery</h3>
              <p className="rpt-desc">
                This summary uses current Azure inventory and cost signals to infer likely application groupings at resource-group level. Customer annotations are shown as added business context and do not change the inferred evidence.
              </p>
              {applicationDiscoverySummary.topArchetypes.length > 0 && (
                <div className="rpt-kv-grid rpt-kv-grid--4col">
                  <div className="rpt-kv"><span className="rpt-kv__label">Inferred groups</span><span className="rpt-kv__value">{applicationDiscoverySummary.totalGroups}</span></div>
                  {applicationDiscoverySummary.topArchetypes.slice(0, 3).map((item) => (
                    <div className="rpt-kv" key={item.name}>
                      <span className="rpt-kv__label">{item.name}</span>
                      <span className="rpt-kv__value">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {applicationDiscoverySummary.topRows.length > 0 && <p className="rpt-table-meta">{applicationDiscoverySummary.topRows.length} groups</p>}
              {applicationDiscoverySummary.topRows.length > 0 ? (
                <table className="rpt-table">
                  <thead><tr><th>Subscription</th><th>Resource Group</th><th>Archetype</th><th>Confidence</th><th>Avg Monthly Spend</th><th>Business Description</th><th>Owning Department</th></tr></thead>
                  <tbody>
                    {applicationDiscoverySummary.topRows.map((item) => (
                      <tr key={`${item.subscriptionId}-${item.resourceGroup}`}>
                        <td>{item.subscriptionName}</td>
                        <td>{item.resourceGroup}</td>
                        <td>{item.profile.archetype}</td>
                        <td>{item.profile.confidence}%</td>
                        <td>{formatCurrency(item.avgMonthly)}</td>
                        <td>{item.annotation?.business_description ?? '—'}</td>
                        <td>{item.annotation?.owning_department ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="rpt-empty">No application discovery evidence is currently available from the saved snapshot.</p>}
              {visibleSections['rpt-applications-discovery-register'] && !appendixSections['rpt-applications-discovery-register'] && applicationDiscoverySummary.allRows.length > 0 && (
                <>
                  <h4 className="rpt-sub-sub-heading">2.1.1 Applications discovery register</h4>
                  <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-applications-discovery`} rows={applicationsDiscoveryExportRows} />
                  <p className="rpt-table-meta">{applicationDiscoverySummary.allRows.length} groups</p>
                  <table className="rpt-table">
                    <thead><tr><th>Subscription</th><th>Resource Group</th><th>Archetype</th><th>Confidence</th><th>Avg Monthly Spend</th><th>Business Description</th><th>Owning Department</th></tr></thead>
                    <tbody>
                      {applicationDiscoverySummary.allRows.map((item) => (
                        <tr key={`app-register-${item.subscriptionId}-${item.resourceGroup}`}>
                          <td>{item.subscriptionName}</td>
                          <td>{item.resourceGroup}</td>
                          <td>{item.profile.archetype}</td>
                          <td>{item.profile.confidence}%</td>
                          <td>{formatCurrency(item.avgMonthly)}</td>
                          <td>{item.annotation?.business_description ?? '—'}</td>
                          <td>{item.annotation?.owning_department ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          {visibleSections['rpt-portfolio-interpretation'] && !appendixSections['rpt-portfolio-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">2.2 Application portfolio</h3>
              <p className="rpt-desc">{interpretPortfolioSection(portfolio.data)}</p>
              {portfolio.data && portfolio.data.length > 0 && (
                <>
                  <p className="rpt-desc">
                    {`${portfolio.data.filter((item) => (item.future_state ?? '').trim().length > 0).length} of ${portfolio.data.length} apps have a future-state recorded - future direction is clear, but capability readiness may still need review.`}
                  </p>
                  {portfolioEvidenceBullets(challenges.data).length > 0 && (
                    <ul className="rpt-list rpt-list--portfolio">
                      {portfolioEvidenceBullets(challenges.data).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
          {portfolio.data && portfolio.data.length > 0 ? (
            <>
            <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-application-portfolio`} rows={portfolioExportRows} />
            <p className="rpt-table-meta">{portfolio.data.length} applications</p>
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Application</th><th>Purpose</th><th>Business Owner</th><th>Technical Owner</th>
                  <th>Criticality</th><th>Status</th><th>Future State</th>{portfolioHasMonthlyCost && <th>Monthly Cost</th>}<th>Known Risks</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.data.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.app_name}</strong></td>
                    <td>{a.purpose ?? ''}</td>
                    <td>{a.business_owner ?? '—'}</td>
                    <td>{a.technical_owner ?? '—'}</td>
                    <td>{a.criticality ?? '—'}</td>
                    <td>{a.status ?? '—'}</td>
                    <td>{a.future_state ?? '—'}</td>
                    {portfolioHasMonthlyCost && <td>{a.monthly_cost != null ? formatCurrency(a.monthly_cost) : '—'}</td>}
                    <td>{a.known_risks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No portfolio entries recorded.</p>}
        </section>
        )}


        {/* ═══════════════════════════ 12. INITIATIVES ════════════════════ */}
        {visibleSections['rpt-initiatives'] && (
        <section className={`rpt-section${appendixSections['rpt-initiatives'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-initiatives" style={{ order: sectionOrder('rpt-initiatives', 120) }}>
          <SectionHeading num="10" title="Strategic initiatives and roadmap" sectionId="rpt-initiatives" />
          <p className="rpt-narrative">
            This section captures planned and in-flight initiatives identified during stakeholder engagement.
            {initiatives.data && initiatives.data.length > 0
              ? ` ${plural(initiatives.data.length, 'initiative')} have been recorded, providing a basis for roadmap planning and sequencing.`
              : ' No initiatives have been recorded yet.'}
          </p>
          {visibleSections['rpt-initiatives-interpretation'] && !appendixSections['rpt-initiatives-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">10.0 Roadmap overview</h3>
              <p className="rpt-desc">{interpretInitiativesSection(initiatives.data)}</p>
            </>
          )}
          {initiatives.data && initiatives.data.length > 0 && (
            <div className="rpt-roadmap-preview" style={{ marginBottom: '16px' }}>
              <h4 className="rpt-sub-heading">Roadmap timeline</h4>
              <InitiativesRoadmap items={initiatives.data} />
            </div>
          )}
          {initiatives.data && initiatives.data.length > 0 ? (
            <>
            <ReportCsvButton compact label="Export CSV" fileName={`${filePrefix}-strategic-initiatives`} rows={initiativeExportRows} />
            <p className="rpt-table-meta">{initiatives.data.length} initiatives</p>
            <table className="rpt-table rpt-table--initiatives">
              <thead>
                <tr>
                  <th>Initiative</th><th>Description</th><th>Priority</th><th>Status</th>
                  <th>Category</th><th>Target Quarter</th><th>Effort (wks)</th><th>Est. Saving</th><th>Deprecation Aligned</th>
                </tr>
              </thead>
              <tbody>
                {initiatives.data.map(i => (
                  <tr key={i.id}>
                    <td><strong>{i.name}</strong></td>
                    <td>{i.description ?? ''}</td>
                    <td>{i.priority}</td>
                    <td>{i.status}</td>
                    <td>{i.category ?? '—'}</td>
                    <td>{i.target_quarter ?? '—'}</td>
                    <td>{i.estimated_effort_weeks ?? '—'}</td>
                    <td>{i.estimated_cost_saving != null ? formatCurrency(i.estimated_cost_saving) : '—'}</td>
                    <td>{i.deprecation_aligned ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          ) : <p className="rpt-empty">No initiatives recorded.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 13. STAKEHOLDERS ═══════════════════ */}
        {visibleSections['rpt-stakeholders'] && (
        <section className={`rpt-section${appendixSections['rpt-stakeholders'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-stakeholders" style={{ order: sectionOrder('rpt-stakeholders', 130) }}>
          <SectionHeading num="11" title="Stakeholder interview summary" sectionId="rpt-stakeholders" />
          <p className="rpt-narrative">
            Stakeholder interviews provide qualitative context that complements the technical data.
            {stakeholders.data && stakeholders.data.length > 0
              ? ` ${plural(stakeholders.data.length, 'interview')} have been recorded.`
              : ' No interviews have been conducted yet.'}
          </p>
          {visibleSections['rpt-stakeholders-synthesis'] && !appendixSections['rpt-stakeholders-synthesis'] && (
            <>
              <h3 className="rpt-sub-heading">11.0 Stakeholder synthesis</h3>
              <p className="rpt-desc">{synthesizeStakeholders(stakeholders.data)}</p>
            </>
          )}
          {stakeholders.data && stakeholders.data.length > 0 && (
            <div className="rpt-hero-grid">
              <div className="rpt-hero-card">
                <span className="rpt-hero-card__value">{stakeholders.data.length}</span>
                <span className="rpt-hero-card__label">Interviews</span>
              </div>
              <div className="rpt-hero-card">
                <span className="rpt-hero-card__value">{new Set(stakeholders.data.map((item) => item.department).filter(Boolean)).size}</span>
                <span className="rpt-hero-card__label">Departments</span>
              </div>
              <div className="rpt-hero-card">
                <span className="rpt-hero-card__value">{stakeholders.data.filter((item) => item.validation_status === 'Confirmed').length}</span>
                <span className="rpt-hero-card__label">Confirmed</span>
              </div>
            </div>
          )}
          {stakeholders.data && stakeholders.data.length > 0 ? (
            <div className="rpt-stakeholder-list rpt-recommendation-detail-grid">
              {stakeholders.data.map(s => (
                <div key={s.id} className="rpt-stakeholder-card">
                  <h4>{s.stakeholder_name}</h4>
                  <div className="rpt-kv-grid rpt-kv-grid--3col rpt-kv-grid--tight">
                    {s.role && <div className="rpt-kv"><span className="rpt-kv__label">Role</span><span className="rpt-kv__value">{s.role}</span></div>}
                    {s.department && <div className="rpt-kv"><span className="rpt-kv__label">Department</span><span className="rpt-kv__value">{s.department}</span></div>}
                    {s.interview_date && <div className="rpt-kv"><span className="rpt-kv__label">Date</span><span className="rpt-kv__value">{formatDate(s.interview_date)}</span></div>}
                  </div>
                  {s.key_findings && <p><strong>Key Findings:</strong> {s.key_findings}</p>}
                  {s.pain_points && <p><strong>Pain Points:</strong> {s.pain_points}</p>}
                  {s.notes && <p><strong>Notes:</strong> {s.notes}</p>}
                </div>
              ))}
            </div>
          ) : <p className="rpt-empty">No stakeholder interviews recorded.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 14. FRAMEWORK ══════════════════════ */}
        {visibleSections['rpt-framework'] && (
        <section className={`rpt-section${appendixSections['rpt-framework'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-framework" style={{ order: sectionOrder('rpt-framework', 140) }}>
          <SectionHeading num="12" title="Framework alignment (WAF / CAF)" sectionId="rpt-framework" />
          <p className="rpt-narrative">{narrativeFramework(framework.data)}</p>
          {visibleSections['rpt-framework-interpretation'] && !appendixSections['rpt-framework-interpretation'] && (
            <>
              <h3 className="rpt-sub-heading">12.0 Framework overview</h3>
              <p className="rpt-desc">{interpretFrameworkSection(framework.data)}</p>
            </>
          )}

          {framework.data && (
            <>
              {(frameworkWafChartData.length > 0 || frameworkCafChartData.length > 0) && (
                <div className="rpt-visual-grid">
                  {frameworkWafChartData.length > 0 && (
                    <ChartCard
                      title="WAF pillar score profile"
                      subtitle="Relative strength across the five Well-Architected pillars"
                      data={frameworkWafChartData}
                      xKey="name"
                      yKey="value"
                      chartType="bar"
                    />
                  )}
                  {frameworkCafChartData.length > 0 && (
                    <ChartCard
                      title="CAF maturity by methodology"
                      subtitle="Current maturity score out of 5 across Cloud Adoption Framework domains"
                      data={frameworkCafChartData}
                      xKey="name"
                      yKey="value"
                      chartType="bar"
                    />
                  )}
                </div>
              )}

              {/* WAF Pillars */}
              {visibleSections['rpt-framework-waf'] && !appendixSections['rpt-framework-waf'] && (
                <>
              <h3 className="rpt-sub-heading">12.1 Well-Architected Framework (WAF) pillars</h3>
              <p className="rpt-desc">The Microsoft Azure Well-Architected Framework assesses workloads across five pillars: Reliability, Security, Cost Optimisation, Operational Excellence, and Performance Efficiency.</p>
              {Object.values(framework.data.waf_pillars).length > 0 && <p className="rpt-table-meta">{Object.values(framework.data.waf_pillars).length} pillars</p>}
              {Object.values(framework.data.waf_pillars).length > 0 ? (
                <table className="rpt-table">
                  <thead><tr><th>Pillar</th><th>Score</th><th>Findings</th><th>Future-phase Opportunities</th><th>Description</th></tr></thead>
                  <tbody>
                    {Object.values(framework.data.waf_pillars).sort((a, b) => a.score - b.score).map(p => (
                      <tr key={p.code}>
                        <td><strong>{p.name}</strong></td>
                        <td>{formatPercent(p.score, 0)}</td>
                        <td>{p.findings.length}</td>
                        <td>{p.phase2_opportunities.length}</td>
                        <td>{p.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="rpt-empty">No WAF pillar data.</p>}
                </>
              )}

              {/* WAF Findings detail */}
              {visibleSections['rpt-framework-findings'] && !appendixSections['rpt-framework-findings'] && Object.values(framework.data.waf_pillars).some(p => p.findings.length > 0) && (
                <>
                  <h3 className="rpt-sub-heading">12.2 WAF findings detail</h3>
                  {Object.values(framework.data.waf_pillars).filter(p => p.findings.length > 0).map(p => (
                    <div key={p.code}>
                      <h4 className="rpt-sub-sub-heading">{p.name}</h4>
                      <p className="rpt-table-meta">{p.findings.length} findings</p>
                      <table className="rpt-table rpt-table--compact rpt-table--framework-findings">
                        <thead><tr><th>Source</th><th>Subscription</th><th>Detail</th><th>Checklist Ref</th></tr></thead>
                        <tbody>
                          {p.findings.map((f, i) => (
                            <tr key={i}>
                              <td>{f.source}</td>
                              <td>{f.subscription_name ?? '—'}</td>
                              <td>{f.detail}</td>
                              <td>{wafRefLink(f.checklist_ref)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              )}

              {/* CAF */}
              {visibleSections['rpt-framework-caf'] && !appendixSections['rpt-framework-caf'] && (
                <>
              <h3 className="rpt-sub-heading">12.3 Cloud Adoption Framework (CAF) maturity</h3>
              <p className="rpt-desc">The Cloud Adoption Framework measures organisational readiness across key methodologies. Maturity is rated 1-5.</p>
              {effectiveCafMethodologies.length > 0 ? (
                <>
                {framework.data?.caf_average_maturity != null && (
                  <p className="rpt-desc">
                    <strong>Evidence-derived engine CAF score:</strong> {framework.data.caf_average_maturity.toFixed(1)} / 5.
                    This is calculated automatically from assessment evidence already loaded into the platform, including portfolio, initiatives,
                    inventory, tagging, Dynamics, licensing, governance, security, and integration signals mapped into the CAF methodologies.
                  </p>
                )}
                {effectiveCafAverageScore != null && (
                  <p className="rpt-desc">
                    <strong>Manual reviewed CAF score:</strong> {effectiveCafAverageScore.toFixed(1)} / 5.
                    This reflects the assessor's reviewed position after considering the wider evidence base, customer context, and qualitative judgement
                    where the engine output alone may overstate maturity or miss nuance that emerged through interviews, workshops, and supporting documentation.
                  </p>
                )}
                <table className="rpt-table rpt-table--caf">
                  <thead><tr><th>Methodology</th><th>Maturity</th><th>Label</th><th>Signals</th><th>Description</th></tr></thead>
                  <tbody>
                    {effectiveCafMethodologies
                      .slice()
                      .sort((a, b) => {
                        const order = ['Strategy', 'Plan', 'Ready', 'Adopt', 'Govern', 'Secure', 'Manage'];
                        return order.indexOf(a.name) - order.indexOf(b.name);
                      })
                      .map(m => (
                      <tr key={m.name}>
                        <td><strong>{m.name}</strong></td>
                        <td>{m.effective_maturity.toFixed(1)} / 5</td>
                        <td>{m.effective_label}</td>
                        <td>{m.display_signals.join('; ')}</td>
                        <td>{m.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              ) : <p className="rpt-empty">No CAF methodology data.</p>}
                </>
              )}

              {/* Future-phase opportunities */}
              {visibleSections['rpt-framework-phase2'] && !appendixSections['rpt-framework-phase2'] && framework.data.phase2_summary.length > 0 && (
                <FrameworkFuturePhaseOpportunities opportunities={framework.data.phase2_summary} />
              )}
            </>
          )}
          {!framework.data && <p className="rpt-empty">Framework analysis not available.</p>}
        </section>
        )}

        {/* ═══════════════════════════ 15. RECOMMENDED ACTIONS ════════════ */}
        {visibleSections['rpt-actions'] && (
        <section className={`rpt-section${appendixSections['rpt-actions'] ? ' rpt-section--appendix-item' : ''}`} id="rpt-actions" style={{ order: sectionOrder('rpt-actions', 150) }}>
          <SectionHeading num="13" title="Recommended actions" sectionId="rpt-actions" />
          <p className="rpt-narrative">
            The following actions combine assessment telemetry with the strongest assessor-led follow-up priorities. They are designed
            to provide a practical starting point for remediation planning, delivery sequencing, and next-step discussions.
          </p>
          <p className="rpt-narrative">
            Read these as the first actions that would best convert the assessment into movement. They combine immediate hygiene and posture work with the practical enablers needed to improve execution, including stronger work-management discipline, targeted capability uplift, and clearer platform governance.
          </p>
          {recommendedActions.length > 0 ? (
            <table className="rpt-table">
              <thead><tr><th>#</th><th>Priority</th><th>Category</th><th>Action</th><th>Rationale</th></tr></thead>
              <tbody>
                {recommendedActions.map((a, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><span className={sevClass(a.priority.toLowerCase())}>{a.priority}</span></td>
                    <td>{a.category}</td>
                    <td><strong>{replaceSubscriptionIdsInText(a.action, subNameMap)}</strong></td>
                    <td>{replaceSubscriptionIdsInText(a.rationale, subNameMap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rpt-positive">No urgent actions identified. The environment is in good health.</p>}
        </section>
        )}

        {(appendixSectionIds.length > 0 || appendixSubsectionGroups.length > 0) && (
          <section className="rpt-section rpt-section--appendix-heading" id="rpt-appendix" style={{ order: 190 }}>
            <SectionHeading num={`${toc.length + 1}`} title="Appendix" sectionId="rpt-appendix" />
            <p className="rpt-narrative">
              The following sections were marked in report settings to be retained as appendix material rather than in the main body of the report.
            </p>
          </section>
        )}

        {appendixSubsectionGroups.map((group, groupIndex) => (
          <section key={group.id} className="rpt-section rpt-section--appendix-item" style={{ order: 195 + groupIndex }}>
            <h3 className="rpt-sub-heading">{group.title}</h3>
            <p className="rpt-desc">The following subsection material was moved to the appendix from report settings.</p>
            {group.children.map((child) => (
              <div key={child.id}>
                <h4 className="rpt-sub-sub-heading">{child.title}</h4>
                <ReportAppendixTable rows={appendixSubsectionRows[child.id] ?? []} />
              </div>
            ))}
          </section>
        ))}

        {/* ═══════════════════════════ FOOTER ═════════════════════════════ */}
        <section className="rpt-footer" style={{ order: 999 }}>
          <p>End of Report. Generated {now}</p>
          <p className="rpt-footer__disclaimer">
            {reportReleaseMode === 'major'
              ? 'This document has been issued as a major version based on the snapshot and manual report settings selected at the time of export.'
              : 'This document is an auto-generated draft based on data available at the time of assessment. It should be reviewed, validated, and supplemented with stakeholder context before distribution.'}
          </p>
        </section>
      </div>
      </>
      )}
    </PageLayout>
  );
}
