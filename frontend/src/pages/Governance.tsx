/**
 * Governance.tsx — Azure Policy compliance, RBAC role assignments, orphaned resources.
 */

import { useMemo, useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { ScoreCard } from '../components/shared/ScoreCard';
import { DataTable } from '../components/shared/DataTable';
import { ChartCard } from '../components/shared/ChartCard';
import { Badge } from '../components/ui/badge';
import { useModuleData } from '../hooks/useModuleData';
import { governanceApi } from '../api/governance';
import { inventoryApi } from '../api/inventory';
import type {
  PolicyComplianceResponse,
  RoleAssignmentsResponse,
  OrphanedResourcesResponse,
  RoleAssignment,
  OrphanedResource,
  PolicyNonCompliant,
  InventorySummary,
} from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import type { CellContext } from '@tanstack/react-table';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  CartesianGrid,
} from 'recharts';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { formatPercent } from '../utils/formatters';
import { GOVERNANCE_PRIMARY, CHART_GRID, CHART_TICK_FILL, CHART_LABEL_FILL, CHART_TOOLTIP_STYLE as CHART_TT_STYLE, CHART_TOOLTIP_TEXT } from '../utils/chartPalette';

const POLICY_DOC_COMPLIANCE = 'https://learn.microsoft.com/azure/governance/policy/concepts/compliance-states';
const POLICY_DOC_REMEDIATION = 'https://learn.microsoft.com/azure/governance/policy/how-to/remediate-resources';
const RBAC_DOC_BEST_PRACTICES = 'https://learn.microsoft.com/azure/role-based-access-control/best-practices';
const RBAC_DOC_OVERVIEW = 'https://learn.microsoft.com/azure/role-based-access-control/overview';
const ORPHAN_DOC_DISKS = 'https://learn.microsoft.com/azure/virtual-machines/disks-find-unattached-portal';
const ORPHAN_DOC_RESOURCE_GRAPH = 'https://learn.microsoft.com/azure/governance/resource-graph/first-query-portal';
const ORPHAN_DOC_PUBLIC_IP_PRICING = 'https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses#pricing';

const CHART_TICK_STYLE = { fill: CHART_TICK_FILL, fontSize: 12 };
const CHART_GRID_COLOR = CHART_GRID;
const CHART_TOOLTIP_STYLE = CHART_TT_STYLE;

type ActionPriority = 'High' | 'Medium' | 'Low';

interface GovernanceAction {
  priority: ActionPriority;
  title: string;
  rationale: string;
  nextStep: string;
  metric: string;
  link: string;
}

// ─── Column definitions ──────────────────────────────────────────────────────

function subscriptionCell<T extends { subscription_name?: string; subscription_id?: string }>(
  info: CellContext<T, string | undefined>
) {
  const row = info.row.original;
  const name = row.subscription_name ?? '';
  const id = row.subscription_id ?? '';
  return (
    <div>
      <div>{name || id}</div>
      {name && id && name !== id && <div className="cell-sub-text">{id}</div>}
    </div>
  );
}

const roleCol = createColumnHelper<RoleAssignment>();
const roleColumns = [
  roleCol.accessor('subscription_name', { id: 'subscription', header: 'Subscription', cell: subscriptionCell }),
  roleCol.accessor('role_name', { header: 'Role' }),
  roleCol.accessor('principal_type', { header: 'Principal Type' }),
  roleCol.accessor('principal_id', { header: 'Principal ID' }),
  roleCol.accessor('scope', {
    header: 'Scope',
    cell: (info) => {
      const val = info.getValue();
      const parts = val.split('/');
      return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : val;
    },
  }),
];

const orphanCol = createColumnHelper<OrphanedResource>();
const orphanColumns = [
  orphanCol.accessor('subscription_name', { id: 'subscription', header: 'Subscription', cell: subscriptionCell }),
  orphanCol.accessor('category', {
    header: 'Category',
    cell: (info) => info.getValue().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }),
  orphanCol.accessor('resource_name', { header: 'Resource' }),
  orphanCol.accessor('resource_type', { header: 'Type' }),
  orphanCol.accessor('resource_group', { header: 'Resource Group' }),
  orphanCol.accessor('location', { header: 'Location' }),
  orphanCol.accessor('size_gb', {
    header: 'Size (GB)',
    cell: (info) => {
      const v = info.getValue();
      return v != null ? `${v} GB` : '—';
    },
  }),
];

const policyCol = createColumnHelper<PolicyNonCompliant>();
const policyColumns = [
  policyCol.accessor('subscription_name', { id: 'subscription', header: 'Subscription', cell: subscriptionCell }),
  policyCol.accessor('policy_name', {
    header: 'Policy',
    cell: (info) => {
      const v = info.getValue();
      if (typeof v === 'string' && v.includes('/')) return v.split('/').pop();
      return v;
    },
  }),
  policyCol.accessor('non_compliant_resources', { header: 'Non-Compliant Resources' }),
  policyCol.accessor('non_compliant_policies', {
    header: 'Non-Compliant Policies',
    cell: (info) => (
      <span title="Count of distinct policy definitions violated">{info.getValue()}</span>
    ),
  }),
];

// ─── Category labels for orphan badges ───────────────────────────────────────

const ORPHAN_LABELS: Record<string, string> = {
  unattached_disks: 'Unattached Disks',
  unused_nics: 'Unused NICs',
  unused_nsgs: 'Unused NSGs',
  unused_public_ips: 'Unused Public IPs',
  empty_resource_groups: 'Empty Resource Groups',
};

function safePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  const ratio = (part / whole) * 100;
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, ratio));
}

function truncateLabel(value: string, max = 34): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function actionPriorityClass(priority: ActionPriority): string {
  return priority === 'High'
    ? 'governance-action-card--high'
    : priority === 'Medium'
      ? 'governance-action-card--medium'
      : 'governance-action-card--low';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Governance() {
  const [policySubFilter, setPolicySubFilter] = useState('');
  const [rbacSubFilter, setRbacSubFilter] = useState('');
  const [orphanSubFilter, setOrphanSubFilter] = useState('');

  const policy = useModuleData<PolicyComplianceResponse>(
    () => governanceApi.policyCompliance(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.governancePolicyCompliance },
  );
  const inventorySummary = useModuleData<InventorySummary>(
    () => inventoryApi.summary(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.inventorySummary },
  );
  const rbac = useModuleData<RoleAssignmentsResponse>(
    () => governanceApi.roleAssignments(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.governanceRoleAssignments },
  );
  const orphans = useModuleData<OrphanedResourcesResponse>(
    () => governanceApi.orphanedResources(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.governanceOrphanedResources },
  );

  const allNonCompliant = useMemo<PolicyNonCompliant[]>(
    () =>
      policy.data?.by_subscription?.flatMap((s) =>
        (s.top_non_compliant ?? []).map((p) => ({
          ...p,
          subscription_name: s.subscription_name ?? s.subscription_id,
        }))
      ) ?? [],
    [policy.data]
  );

  const policySubs = useMemo(() => {
    const set = new Set<string>();
    (policy.data?.by_subscription ?? []).forEach((s) => set.add(s.subscription_name ?? s.subscription_id));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [policy.data]);

  const rbacSubs = useMemo(() => {
    const set = new Set<string>();
    (rbac.data?.assignments ?? []).forEach((a) => set.add(a.subscription_name ?? a.subscription_id));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rbac.data]);

  const orphanSubs = useMemo(() => {
    const set = new Set<string>();
    (orphans.data?.orphans ?? []).forEach((o) => set.add(o.subscription_name ?? o.subscription_id));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [orphans.data]);

  const filteredPolicies = useMemo(
    () =>
      allNonCompliant.filter((p) =>
        !policySubFilter || p.subscription_name === policySubFilter
      ),
    [allNonCompliant, policySubFilter]
  );

  const filteredRbac = useMemo(
    () =>
      rbac.data?.assignments.filter((a) =>
        !rbacSubFilter || a.subscription_name === rbacSubFilter
      ) ?? [],
    [rbac.data, rbacSubFilter]
  );

  const filteredOrphans = useMemo(
    () =>
      orphans.data?.orphans.filter((o) =>
        !orphanSubFilter || o.subscription_name === orphanSubFilter
      ) ?? [],
    [orphans.data, orphanSubFilter]
  );

  const policyTotals = useMemo(() => {
    const rows = policy.data?.by_subscription ?? [];
    const evaluatedResources = rows.reduce((sum, row) => {
      const evaluated = Number(row.total_resources ?? 0);
      const computed = Number((row.compliant ?? 0) + (row.non_compliant_resources ?? 0));
      return sum + Math.max(evaluated, computed);
    }, 0);
    const nonCompliant = Number(policy.data?.total_non_compliant_resources ?? 0);
    const compliant = rows.reduce((sum, row) => sum + Number(row.compliant ?? 0), 0);
    const nonComplianceRate = safePercent(nonCompliant, evaluatedResources);
    const complianceRate = safePercent(compliant, evaluatedResources);
    const impactedSubscriptions = rows.filter((row) => Number(row.non_compliant_resources ?? 0) > 0).length;
    return {
      evaluatedResources,
      nonCompliant,
      compliant,
      nonComplianceRate,
      complianceRate,
      impactedSubscriptions,
    };
  }, [policy.data]);

  const policyBySubscriptionChartData = useMemo(() => {
    return (policy.data?.by_subscription ?? [])
      .map((row) => {
        const fullName = row.subscription_name ?? row.subscription_id;
        return {
          fullName,
          name: truncateLabel(fullName, 36),
          value: Number(row.non_compliant_resources ?? 0),
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [policy.data]);

  const taggingTotals = useMemo(() => {
    const totalResources = Number(inventorySummary.data?.total_resources ?? 0);
    const untaggedCount = Number(inventorySummary.data?.untagged_count ?? 0);
    const untaggedPercentage = Number(inventorySummary.data?.untagged_percentage ?? 0);
    const taggedCount = Math.max(0, totalResources - untaggedCount);
    const taggedPercentage = safePercent(taggedCount, totalResources);
    return {
      totalResources,
      taggedCount,
      taggedPercentage,
      untaggedCount,
      untaggedPercentage,
    };
  }, [inventorySummary.data]);

  const rbacBySubscription = useMemo(() => {
    const grouped: Record<string, { assignments: number; owners: number }> = {};
    (rbac.data?.assignments ?? []).forEach((assignment) => {
      const name = assignment.subscription_name ?? assignment.subscription_id;
      if (!grouped[name]) {
        grouped[name] = { assignments: 0, owners: 0 };
      }
      grouped[name].assignments += 1;
      if (assignment.role_name === 'Owner') {
        grouped[name].owners += 1;
      }
    });

    return Object.entries(grouped)
      .map(([fullName, values]) => ({
        fullName,
        name: truncateLabel(fullName, 36),
        value: values.assignments,
        ownerRatio: safePercent(values.owners, values.assignments),
      }))
      .sort((a, b) => b.value - a.value);
  }, [rbac.data]);

  const rbacTotals = useMemo(() => {
    const totalAssignments = Number(rbac.data?.total_count ?? 0);
    const owners = Number(rbac.data?.owner_count ?? 0);
    const ownerRatio = safePercent(owners, totalAssignments);
    const ownerHeavySubscriptions = rbacBySubscription.filter((row) => row.ownerRatio > 10).length;
    return { totalAssignments, owners, ownerRatio, ownerHeavySubscriptions };
  }, [rbac.data, rbacBySubscription]);

  const orphanChartData = useMemo(() => {
    return Object.entries(orphans.data?.by_type ?? {})
      .map(([key, value]) => ({
        key,
        name: ORPHAN_LABELS[key] ?? key,
        value: Number(value ?? 0),
      }))
      .sort((a, b) => b.value - a.value);
  }, [orphans.data]);

  const orphanTotals = useMemo(() => {
    const byType = orphans.data?.by_type ?? {};
    const emptyResourceGroups = Number(byType.empty_resource_groups ?? 0);
    const costSensitiveCount =
      Number(byType.unattached_disks ?? 0) +
      Number(byType.unused_public_ips ?? 0) +
      Number(byType.unused_nics ?? 0) +
      Number(byType.unused_nsgs ?? 0);
    return {
      totalCount: Number(orphans.data?.total_count ?? 0),
      emptyResourceGroups,
      costSensitiveCount,
    };
  }, [orphans.data]);

  const governanceActions = useMemo<GovernanceAction[]>(() => {
    const actions: GovernanceAction[] = [];

    if (policy.status === 'success' && policy.data) {
      if (policyTotals.nonComplianceRate >= 10) {
        actions.push({
          priority: 'High',
          title: 'Reduce Azure Policy non-compliance',
          metric: `${formatPercent(policyTotals.nonComplianceRate, 1)} of evaluated resources are non-compliant`,
          rationale: `${policyTotals.impactedSubscriptions} subscriptions currently have non-compliant resources.`,
          nextStep: 'Start with the highest non-compliant subscriptions, create remediation tasks, and track completion weekly.',
          link: POLICY_DOC_REMEDIATION,
        });
      } else if (policyTotals.nonCompliant > 0) {
        actions.push({
          priority: 'Medium',
          title: 'Close remaining policy gaps',
          metric: `${policyTotals.nonCompliant} resources remain non-compliant`,
          rationale: 'The environment is partially compliant but still has policy drift.',
          nextStep: 'Address top policy assignments first, then enable recurring compliance review for each subscription.',
          link: POLICY_DOC_COMPLIANCE,
        });
      }
    }

    if (rbac.status === 'success' && rbac.data) {
      if (rbacTotals.ownerRatio > 10) {
        actions.push({
          priority: 'High',
          title: 'Lower Owner-role concentration',
          metric: `${formatPercent(rbacTotals.ownerRatio, 1)} of assignments are Owner`,
          rationale: `${rbacTotals.ownerHeavySubscriptions} subscriptions exceed a 10% Owner ratio.`,
          nextStep: 'Convert standing Owner assignments to least-privilege roles and use just-in-time elevation where possible.',
          link: RBAC_DOC_BEST_PRACTICES,
        });
      } else if (rbacTotals.owners > 0) {
        actions.push({
          priority: 'Low',
          title: 'Review privileged role hygiene',
          metric: `${rbacTotals.owners} Owner assignments`,
          rationale: 'Even healthy environments should periodically validate privileged assignments.',
          nextStep: 'Run quarterly access reviews and remove stale privileged role grants.',
          link: RBAC_DOC_OVERVIEW,
        });
      }
    }

    if (orphans.status === 'success' && orphans.data && orphanTotals.totalCount > 0) {
      actions.push({
        priority: orphanTotals.costSensitiveCount > 0 ? 'Medium' : 'Low',
        title: 'Clean up orphaned resources',
        metric: `${orphanTotals.totalCount} orphaned resources detected`,
        rationale:
          orphanTotals.costSensitiveCount > 0
            ? `${orphanTotals.costSensitiveCount} items are likely to have direct cost impact (disks/IPs/NICs/NSGs).`
            : 'Orphaned assets increase operational clutter and ownership ambiguity.',
        nextStep: 'Validate each orphan against active workload needs, then delete or attach to a valid owner resource.',
        link: ORPHAN_DOC_DISKS,
      });
    }

    const dataGapCount =
      (policy.data?.data_gaps?.length ?? 0) +
      (rbac.data?.data_gaps?.length ?? 0) +
      (orphans.data?.data_gaps?.length ?? 0);
    if (dataGapCount > 0) {
      actions.push({
        priority: 'Medium',
        title: 'Close governance telemetry gaps',
        metric: `${dataGapCount} governance data gaps`,
        rationale: 'Incomplete telemetry reduces confidence in governance decisions.',
        nextStep: 'Fix missing permissions for Policy Insights, Role Assignments, and Resource Graph data collection.',
        link: ORPHAN_DOC_RESOURCE_GRAPH,
      });
    }

    if (actions.length === 0) {
      actions.push({
        priority: 'Low',
        title: 'Maintain governance posture',
        metric: 'No urgent governance issues detected',
        rationale: 'Current signals show low drift in policy, access, and orphaned resources.',
        nextStep: 'Keep monthly governance review cadence and verify policy/RBAC changes through change control.',
        link: RBAC_DOC_BEST_PRACTICES,
      });
    }

    return actions.slice(0, 6);
  }, [
    policy.status,
    policy.data,
    policyTotals.nonComplianceRate,
    policyTotals.nonCompliant,
    policyTotals.impactedSubscriptions,
    rbac.status,
    rbac.data,
    rbacTotals.ownerRatio,
    rbacTotals.ownerHeavySubscriptions,
    rbacTotals.owners,
    orphans.status,
    orphans.data,
    orphanTotals.totalCount,
    orphanTotals.costSensitiveCount,
  ]);

  return (
    <PageLayout title="Governance" exportId="governance-page">
      <div className="governance-header">
        <span className="section-source">
          Source: Azure Policy Insights, Azure RBAC role assignments, and Azure Resource Graph
        </span>
      </div>
      <p className="governance-note governance-note--formula">
        Formula: Non-compliance rate = Non-compliant resources / Evaluated resources.
        <a href={POLICY_DOC_COMPLIANCE} target="_blank" rel="noopener noreferrer"> View Azure Policy compliance states</a>.
      </p>
      <p className="governance-note">
        Tag coverage is a separate inventory metric sourced from Azure Resource Graph tag presence. It is not the same
        as Azure Policy compliance, so policy can look strong while actual tagging coverage is still weak.
      </p>

      <section className="governance-actions">
        <h3>Governance Action Plan</h3>
        <div className="governance-action-grid">
          {governanceActions.map((action, idx) => (
            <article key={`${action.title}-${idx}`} className={`governance-action-card ${actionPriorityClass(action.priority)}`}>
              <div className="governance-action-head">
                <h4>{action.title}</h4>
                <Badge
                  variant={
                    action.priority === 'High' ? 'critical' :
                    action.priority === 'Medium' ? 'warning' : 'secondary'
                  }
                >
                  {action.priority}
                </Badge>
              </div>
              <p className="governance-action-metric">{action.metric}</p>
              <p>{action.rationale}</p>
              <p><strong>Do this next:</strong> {action.nextStep}</p>
              <a href={action.link} target="_blank" rel="noopener noreferrer">Open Microsoft guidance</a>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        {policy.status === 'success' && policy.data && (
          <>
            <ScoreCard
              label="Non-Compliant Resources"
              value={policyTotals.nonCompliant}
              unit=""
              showBar={false}
            />
            <ScoreCard
              label="Evaluated Resources"
              value={policyTotals.evaluatedResources}
              unit=""
              showBar={false}
            />
            <ScoreCard
              label="Non-Compliance Rate"
              value={policyTotals.nonComplianceRate}
              maxValue={100}
            />
            <ScoreCard
              label="Policy Assignments"
              value={policy.data.total_policy_assignments}
              unit=""
              showBar={false}
            />
          </>
        )}

        {inventorySummary.status === 'success' && inventorySummary.data && (
          <>
            <ScoreCard
              label="Tagged Resources"
              value={taggingTotals.taggedPercentage}
              maxValue={100}
              preserveLabelCase
            />
            <ScoreCard
              label="Untagged Resources"
              value={taggingTotals.untaggedCount}
              unit=""
              showBar={false}
              preserveLabelCase
            />
          </>
        )}

        {rbac.status === 'success' && rbac.data && (
          <>
            <ScoreCard
              label="RBAC Role Assignments"
              value={rbacTotals.totalAssignments}
              unit=""
              showBar={false}
              preserveLabelCase
            />
            <ScoreCard
              label="Owner Assignments"
              value={rbacTotals.owners}
              unit=""
              showBar={false}
              preserveLabelCase
            />
            <ScoreCard
              label="Owner Ratio"
              value={rbacTotals.ownerRatio}
              maxValue={100}
            />
          </>
        )}

        {orphans.status === 'success' && orphans.data && (
          <ScoreCard label="Orphaned Resources" value={orphans.data.total_count} unit="" showBar={false} />
        )}
      </div>

      {orphans.status === 'success' && orphans.data && orphanChartData.length > 0 && (
        <ChartCard title="Orphaned Resources by Category" subtitle="Always-on labels for faster review">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={orphanChartData} layout="vertical" margin={{ top: 8, right: 24, left: 28, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis type="number" tick={CHART_TICK_STYLE} />
              <YAxis type="category" dataKey="name" width={170} tick={CHART_TICK_STYLE} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_TEXT}
                itemStyle={CHART_TOOLTIP_TEXT}
                formatter={(value: number | string | undefined) => [Number(value ?? 0), 'Resources']}
              />
              <Bar dataKey="value" fill={GOVERNANCE_PRIMARY} radius={[0, 6, 6, 0]}>
                <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {orphans.status === 'success' && orphans.data && orphans.data.total_count > 0 && (
        <div className="governance-badges">
          {Object.entries(orphans.data.by_type).map(([cat, count]) => (
            <span
              key={cat}
              className={`governance-badge ${count > 0 ? 'governance-badge--warn' : 'governance-badge--ok'}`}
            >
              {ORPHAN_LABELS[cat] ?? cat}: {count}
            </span>
          ))}
        </div>
      )}

      <h3>Top Non-Compliant Policies</h3>
      <p className="governance-note">
        Policy names may show assignment IDs if friendly names are unavailable. Non-compliant policy
        count indicates distinct policy definitions with violations.
      </p>
      {policy.status === 'success' && policy.data && policyBySubscriptionChartData.length > 0 && (
        <ChartCard title="Non-Compliant Resources by Subscription" subtitle="Top subscriptions by non-compliant resource count">
          <ResponsiveContainer width="100%" height={Math.max(260, policyBySubscriptionChartData.length * 32)}>
            <BarChart data={policyBySubscriptionChartData} layout="vertical" margin={{ top: 8, right: 32, left: 28, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis type="number" tick={CHART_TICK_STYLE} />
              <YAxis type="category" dataKey="name" width={220} tick={CHART_TICK_STYLE} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_TEXT}
                itemStyle={CHART_TOOLTIP_TEXT}
                formatter={(value: number | string | undefined) => [Number(value ?? 0), 'Non-compliant resources']}
              />
              <Bar dataKey="value" fill="var(--color-chart-3)" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="governance-filters">
        <select aria-label="Filter policies by subscription" value={policySubFilter} onChange={(e) => setPolicySubFilter(e.target.value)}>
          <option value="">All Subscriptions</option>
          {policySubs.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>
      {policy.status === 'success' && filteredPolicies.length > 0 ? (
        <DataTable data={filteredPolicies} columns={policyColumns} exportFileName="policy compliance" />
      ) : policy.status === 'error' ? (
        <p className="error-text">Failed to load policy data: {policy.error}</p>
      ) : policy.status === 'success' ? (
        <p className="success-text">All evaluated resources are policy-compliant.</p>
      ) : (
        <p className="loading-text">Loading policy compliance...</p>
      )}

      <h3>RBAC Role Assignments</h3>
      <p className="governance-note">
        RBAC defines who can do what in Azure. Keep Owner assignments minimal and prefer least-privilege roles.
        <a href={RBAC_DOC_BEST_PRACTICES} target="_blank" rel="noopener noreferrer"> Azure RBAC best practices</a>.
      </p>
      {rbac.status === 'success' && rbac.data && rbacBySubscription.length > 0 && (
        <ChartCard title="RBAC Assignments by Subscription" subtitle="Top subscriptions by assignment volume">
          <ResponsiveContainer width="100%" height={Math.max(260, Math.min(12, rbacBySubscription.length) * 32)}>
            <BarChart data={rbacBySubscription.slice(0, 12)} layout="vertical" margin={{ top: 8, right: 32, left: 28, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis type="number" tick={CHART_TICK_STYLE} />
              <YAxis type="category" dataKey="name" width={220} tick={CHART_TICK_STYLE} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_TEXT}
                itemStyle={CHART_TOOLTIP_TEXT}
                formatter={(value: number | string | undefined) => [Number(value ?? 0), 'Assignments']}
              />
              <Bar dataKey="value" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]}>
                <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
      <div className="governance-filters">
        <select aria-label="Filter RBAC by subscription" value={rbacSubFilter} onChange={(e) => setRbacSubFilter(e.target.value)}>
          <option value="">All Subscriptions</option>
          {rbacSubs.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>
      {rbac.status === 'success' && rbac.data ? (
        <>
          <div className="governance-role-summary">
            {Object.entries(rbac.data.by_role).slice(0, 8).map(([role, count]) => (
              <span key={role}>
                <strong>{role}</strong>: {count}
              </span>
            ))}
          </div>
          <div className="governance-role-summary governance-role-summary--muted">
            {Object.entries(rbac.data.by_principal_type).slice(0, 4).map(([principalType, count]) => (
              <span key={principalType}>
                {principalType}: {count}
              </span>
            ))}
          </div>
          <DataTable data={filteredRbac} columns={roleColumns} exportFileName="rbac role assignments" />
        </>
      ) : rbac.status === 'error' ? (
        <p className="error-text">Failed to load RBAC assignments: {rbac.error}</p>
      ) : (
        <p className="loading-text">Loading RBAC role assignments...</p>
      )}

      <h3>Orphaned Resources</h3>
      <p className="governance-note">
        Orphaned resources are assets with no active workload attachment (for example, unattached disks or
        unassociated public IPs). They can create avoidable spend and unclear ownership.
        <a href={ORPHAN_DOC_DISKS} target="_blank" rel="noopener noreferrer"> Find unattached disks</a>,
        <a href={ORPHAN_DOC_PUBLIC_IP_PRICING} target="_blank" rel="noopener noreferrer"> review public IP pricing</a>, and
        <a href={ORPHAN_DOC_RESOURCE_GRAPH} target="_blank" rel="noopener noreferrer"> query with Resource Graph</a>.
      </p>
      <div className="governance-filters">
        <select aria-label="Filter orphans by subscription" value={orphanSubFilter} onChange={(e) => setOrphanSubFilter(e.target.value)}>
          <option value="">All Subscriptions</option>
          {orphanSubs.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>
      {orphans.status === 'success' && orphans.data ? (
        filteredOrphans.length > 0 ? (
          <DataTable data={filteredOrphans} columns={orphanColumns} exportFileName="orphaned resources" />
        ) : (
          <p className="success-text">No orphaned resources detected for the selected filter.</p>
        )
      ) : orphans.status === 'error' ? (
        <p className="error-text">Failed to load orphaned resources: {orphans.error}</p>
      ) : (
        <p className="loading-text">Loading orphaned resources...</p>
      )}
    </PageLayout>
  );
}
