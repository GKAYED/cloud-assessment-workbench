import type { CostRecord, CostRollup, CostSummary, Subscription } from '../types';
import { formatCurrency } from './formatters';
import { normalizeResourceTypeName } from './resourceNaming';

export type CostWindow = '1m' | '3m' | '6m';

export interface WindowCosts {
  c1: number;
  c3: number;
  c6: number;
}

export interface TrendPair {
  fromMonth: string;
  toMonth: string;
  pct: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SubscriptionCostRow {
  id: string;
  fullName: string;
  c1: number;
  c3: number;
  c6: number;
}

export interface ResourceDistributionRow {
  name: string;
  fullName: string;
  cost: number;
  type: string;
}

export interface ResourceCostTableRow {
  subscription: string;
  resourceGroup: string;
  resourceName: string;
  cost1m: number;
  cost3m: number;
  cost6m: number;
}

export interface ResourceGroupRow {
  key: string;
  resourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
  c1: number;
  c3: number;
  c6: number;
  pct6: number;
  cost: number;
}

export interface ResourceGroupTableRow {
  resourceGroup: string;
  subscription: string;
  cost1m: number;
  cost3m: number;
  cost6m: number;
  share6m: string;
}

export interface ExecutiveCostInsight {
  title: string;
  finding: string;
  recommendation: string;
  tone: 'critical' | 'watch' | 'positive';
}

export interface BuildExecutiveCostInsightsInput {
  summary: CostSummary | null | undefined;
  totalMonthly: number;
  totalForResourceWindow: number;
  trendRows: Array<{ month: string; rawMonth: string; amount: number }>;
  mergedSubscriptionRows: SubscriptionCostRow[];
  resources: CostRecord[] | null | undefined;
  resourceTypeRows: Array<{ name: string; c1: number; c3: number; c6: number }>;
  resourceGroupRows: ResourceGroupRow[];
  resourceGroupWindow: CostWindow;
  resourceWindowLabel: string;
}

export function subscriptionLabel(
  subscriptionId: string,
  explicitName: string | undefined,
  subscriptionNames: Map<string, string>
): string {
  if (explicitName && explicitName.trim().length > 0) return explicitName;
  const mapped = subscriptionNames.get(subscriptionId);
  if (mapped && mapped.trim().length > 0) return mapped;
  if (subscriptionId && subscriptionId.trim().length > 0) return subscriptionId;
  return 'Unknown subscription';
}

export function valueForRecord(row: CostRecord, window: CostWindow): number {
  if (window === '6m') return row.cost_6m ?? 0;
  if (window === '3m') return row.cost_3m ?? 0;
  return row.cost_1m ?? 0;
}

export function valueForWindow(costs: WindowCosts, window: CostWindow): number {
  if (window === '6m') return costs.c6;
  if (window === '3m') return costs.c3;
  return costs.c1;
}

export function formatMonthLabel(month: string): string {
  if (!month.includes('-')) return month;
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthIdx = Number(monthRaw) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return month;
  }
  return new Date(year, monthIdx, 1).toLocaleDateString('en-US', { month: 'short' });
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function trendFromPct(pct: number): 'increasing' | 'decreasing' | 'stable' {
  if (pct > 1) return 'increasing';
  if (pct < -1) return 'decreasing';
  return 'stable';
}

export function shortSubscriptionLabel(value: string): string {
  if (!value) return 'Unknown subscription';
  return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function normalizeResourceGroupName(raw: string): string {
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

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}

function isOpaqueToken(value: string): boolean {
  const token = (value ?? '').trim();
  if (!token) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return true;
  if (/^[0-9a-f]{24,}$/i.test(token)) return true;
  return false;
}

function extractResourceNameFromId(resourceId: string): string {
  const segments = (resourceId ?? '').split('/').filter((part) => part.length > 0);
  if (segments.length === 0) return '';

  const providerIdx = segments.findIndex((part) => part.toLowerCase() === 'providers');
  if (providerIdx >= 0 && providerIdx + 2 < segments.length) {
    let i = providerIdx + 2;
    let lastName = '';
    while (i + 1 < segments.length) {
      lastName = segments[i + 1];
      i += 2;
    }
    if (lastName && !isOpaqueToken(lastName)) return lastName;
  }

  const last = segments[segments.length - 1] ?? '';
  if (last && !isOpaqueToken(last)) return last;
  const prev = segments[segments.length - 2] ?? '';
  if (prev && !isOpaqueToken(prev)) return prev;
  return '';
}

export function displayResourceName(row: CostRecord, subscriptionNames: Map<string, string>): string {
  const mappedSubscription = subscriptionNames.get(row.subscription_id);
  if ((row.resource_type ?? '').toLowerCase() === 'subscription') {
    return mappedSubscription || 'Unknown subscription';
  }

  const direct = (row.resource_name ?? '').trim();
  if (direct && !direct.startsWith('/') && !isOpaqueToken(direct)) return direct;

  if (mappedSubscription && (isOpaqueToken(direct) || direct.toLowerCase() === 'subscription')) {
    return mappedSubscription;
  }

  const fromId = extractResourceNameFromId(row.resource_id || direct);
  if (fromId && !/^(subscriptions?|resourcegroups?)$/i.test(fromId)) return fromId;

  const typeName = normalizeResourceTypeName(row.resource_type ?? '');
  return mappedSubscription ? `${mappedSubscription} ${typeName}` : `Unnamed ${typeName}`;
}

export function buildSubscriptionNamesMap(
  subscriptions: Subscription[] | null | undefined,
  bySubscription: CostRollup[] | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of subscriptions ?? []) {
    if (item.subscription_id && item.display_name) {
      map.set(item.subscription_id, item.display_name);
    }
  }
  for (const item of bySubscription ?? []) {
    if (item.group_key && item.subscription_name) {
      map.set(item.group_key, item.subscription_name);
    }
  }
  return map;
}

export function buildMergedSubscriptionRows(
  bySubscription: CostRollup[] | null | undefined,
  subscriptionNames: Map<string, string>,
  window: CostWindow,
): SubscriptionCostRow[] {
  const rows = (bySubscription ?? [])
    .map((row) => {
      const id = (row.group_key ?? '').trim();
      if (!id) return null;
      return {
        id,
        fullName: subscriptionLabel(id, row.subscription_name, subscriptionNames),
        c1: row.cost_1m ?? 0,
        c3: row.cost_3m ?? 0,
        c6: row.cost_6m ?? 0,
      };
    })
    .filter((row): row is SubscriptionCostRow => Boolean(row))
    .sort((a, b) => valueForWindow(b, window) - valueForWindow(a, window));

  const nonZero = rows.filter((row) => valueForWindow(row, window) > 0);
  return nonZero.length > 0 ? nonZero : rows;
}

export function buildSubscriptionChartRows(
  mergedRows: SubscriptionCostRow[],
  window: CostWindow,
): Array<{ id: string; name: string; fullName: string; cost: number }> {
  return mergedRows.map((row) => ({
    id: row.id,
    name: row.fullName,
    fullName: row.fullName,
    cost: valueForWindow(row, window),
  }));
}

export function buildResourceDistributionRows(
  resources: CostRecord[] | null | undefined,
  subscriptionNames: Map<string, string>,
  window: CostWindow,
  selectedSubscription: string,
  allSubscriptionsValue: string,
): ResourceDistributionRow[] {
  const rows = resources ?? [];
  const filtered = selectedSubscription && selectedSubscription !== allSubscriptionsValue
    ? rows.filter((row) => row.subscription_id === selectedSubscription)
    : rows;

  return [...filtered]
    .map((row) => ({
      ...row,
      selectedCost: valueForRecord(row, window),
    }))
    .filter((row) => row.selectedCost > 0)
    .sort((a, b) => b.selectedCost - a.selectedCost)
    .slice(0, 12)
    .map((row) => {
      const resourceName = displayResourceName(row, subscriptionNames);
      return {
        name: resourceName,
        fullName: resourceName,
        cost: row.selectedCost,
        type: normalizeResourceTypeName(row.resource_type || 'Unknown'),
      };
    });
}

export function buildResourceCostTableRows(
  resources: CostRecord[] | null | undefined,
  subscriptionNames: Map<string, string>,
): ResourceCostTableRow[] {
  return [...(resources ?? [])]
    .map((row) => ({
      subscription: subscriptionLabel(row.subscription_id, undefined, subscriptionNames),
      resourceGroup: normalizeResourceGroupName(row.resource_group || '') || 'Unassigned / subscription-level',
      resourceName: displayResourceName(row, subscriptionNames),
      cost1m: row.cost_1m ?? 0,
      cost3m: row.cost_3m ?? 0,
      cost6m: row.cost_6m ?? 0,
    }))
    .sort((a, b) => b.cost6m - a.cost6m);
}

export function buildResourceTypeRows(
  byType: CostRollup[] | null | undefined,
  resources: CostRecord[] | null | undefined,
): Array<{ name: string; c1: number; c3: number; c6: number }> {
  const map = new Map<string, WindowCosts>();
  for (const row of byType ?? []) {
    const key = normalizeResourceTypeName(row.group_key || 'Unknown resource type');
    const existing = map.get(key) ?? { c1: 0, c3: 0, c6: 0 };
    existing.c1 += row.cost_1m ?? 0;
    existing.c3 += row.cost_3m ?? 0;
    existing.c6 += row.cost_6m ?? 0;
    map.set(key, existing);
  }

  if (map.size === 0) {
    for (const row of resources ?? []) {
      const key = normalizeResourceTypeName(row.resource_type || 'Unknown resource type');
      const existing = map.get(key) ?? { c1: 0, c3: 0, c6: 0 };
      existing.c1 += row.cost_1m ?? 0;
      existing.c3 += row.cost_3m ?? 0;
      existing.c6 += row.cost_6m ?? 0;
      map.set(key, existing);
    }
  }

  return [...map.entries()]
    .map(([name, values]) => ({
      name,
      c1: values.c1,
      c3: values.c3,
      c6: values.c6,
    }))
    .sort((a, b) => b.c6 - a.c6)
    .slice(0, 12);
}

export function buildResourceTypeWindowRows(
  rows: Array<{ name: string; c1: number; c3: number; c6: number }>,
  window: CostWindow,
): Array<{ name: string; cost: number; pct: number; pctLabel: string }> {
  const rowsForWindow = rows
    .map((row) => ({
      name: row.name,
      cost: window === '6m' ? row.c6 : window === '3m' ? row.c3 : row.c1,
    }))
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);
  const total = rowsForWindow.reduce((sum, row) => sum + row.cost, 0);
  return rowsForWindow.map((row) => {
    const pct = percentOf(row.cost, total);
    return {
      ...row,
      pct,
      pctLabel: `${pct.toFixed(1)}%`,
    };
  });
}

export function buildResourceGroupRows(
  byGroup: CostRollup[] | null | undefined,
  subscriptionNames: Map<string, string>,
  total6m: number,
  window: CostWindow,
): ResourceGroupRow[] {
  const map = new Map<string, {
    key: string;
    resourceGroup: string;
    subscriptionId: string;
    subscriptionName: string;
    c1: number;
    c3: number;
    c6: number;
  }>();

  for (const row of byGroup ?? []) {
    const resourceGroup = normalizeResourceGroupName(row.group_key || '');
    if (!resourceGroup) continue;
    const subscriptionId = (row.subscription_id ?? '').trim();
    if (!subscriptionId) continue;

    const subscriptionName = subscriptionLabel(subscriptionId, row.subscription_name, subscriptionNames);
    const key = `${subscriptionId}::${resourceGroup.toLowerCase()}`;
    const existing = map.get(key) ?? {
      key,
      resourceGroup,
      subscriptionId,
      subscriptionName,
      c1: 0,
      c3: 0,
      c6: 0,
    };
    existing.c1 += row.cost_1m ?? 0;
    existing.c3 += row.cost_3m ?? 0;
    existing.c6 += row.cost_6m ?? 0;
    map.set(key, existing);
  }

  const derivedTotal6 = [...map.values()].reduce((sum, row) => sum + row.c6, 0);
  const total6Baseline = Math.max(total6m > 0 ? total6m : derivedTotal6, 1);
  return [...map.values()]
    .map((row) => ({
      ...row,
      pct6: (row.c6 / total6Baseline) * 100,
      cost: window === '6m' ? row.c6 : window === '3m' ? row.c3 : row.c1,
    }))
    .filter((row) => row.c1 > 0 || row.c3 > 0 || row.c6 > 0)
    .sort((a, b) => b.c6 - a.c6);
}

export function buildResourceGroupChartRows(
  rows: ResourceGroupRow[],
): Array<{ name: string; fullName: string; subscriptionId: string; subscriptionName: string; cost: number }> {
  return rows
    .map((row) => ({
      name: `${row.resourceGroup} | ${row.subscriptionName}`,
      fullName: row.resourceGroup,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      cost: row.cost,
    }))
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 15);
}

export function filterResourceGroupRows(
  rows: ResourceGroupRow[],
  search: string,
  subscriptionFilter: string,
): ResourceGroupRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (subscriptionFilter && row.subscriptionId !== subscriptionFilter) return false;
    if (!needle) return true;
    const full = `${row.resourceGroup} ${row.subscriptionName} ${row.subscriptionId}`.toLowerCase();
    return full.includes(needle);
  });
}

export function buildResourceGroupExportRows(rows: ResourceGroupRow[]): ResourceGroupTableRow[] {
  return rows.map((row) => ({
    resourceGroup: row.resourceGroup,
    subscription: row.subscriptionName,
    cost1m: row.c1,
    cost3m: row.c3,
    cost6m: row.c6,
    share6m: `${row.pct6.toFixed(1)}%`,
  }));
}

export function buildTopResourceShareRows(
  resources: CostRecord[] | null | undefined,
  subscriptionNames: Map<string, string>,
  totalMonthly: number,
): Array<{ name: string; value: number }> {
  const rows = [...(resources ?? [])]
    .map((row) => ({ name: displayResourceName(row, subscriptionNames), cost: row.cost_1m ?? 0 }))
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const baseline = totalMonthly;
  if (baseline <= 0) return [];

  const threshold = baseline * 0.75;
  const topRows: { name: string; value: number }[] = [];
  let running = 0;
  for (const row of rows) {
    if ((running >= threshold && topRows.length > 0) || topRows.length >= 10) break;
    running += row.cost;
    topRows.push({ name: row.name, value: row.cost });
  }
  const remainder = Math.max(0, baseline - running);
  return [
    ...topRows,
    ...(remainder > 0 ? [{ name: 'Other resources', value: remainder }] : []),
  ];
}

export function buildExecutiveCostInsights({
  summary,
  totalMonthly,
  totalForResourceWindow,
  trendRows,
  mergedSubscriptionRows,
  resources,
  resourceTypeRows,
  resourceGroupRows,
  resourceGroupWindow,
  resourceWindowLabel,
}: BuildExecutiveCostInsightsInput): ExecutiveCostInsight[] {
  if (!summary) return [];
  const insights: ExecutiveCostInsight[] = [];
  const normalizedTotal = totalMonthly > 0 ? totalMonthly : 1;

  if (totalMonthly > 0) {
    insights.push({
      title: 'Annual cloud run rate',
      finding: `Current monthly spend is ${formatCurrency(totalMonthly)}. At the current pace, annual run rate is ${formatCurrency(totalMonthly * 12)}.`,
      recommendation: 'Set a quarterly cost guardrail and track variance to run rate in each executive review.',
      tone: totalMonthly > 0 ? 'watch' : 'positive',
    });

    const tenPercentMonthly = totalMonthly * 0.1;
    insights.push({
      title: 'Optimization value at 10%',
      finding: `A 10% efficiency gain equals ${formatCurrency(tenPercentMonthly)} per month and ${formatCurrency(
        tenPercentMonthly * 12
      )} per year.`,
      recommendation: 'Use this as a concrete savings target for subscription owners and FinOps teams.',
      tone: 'positive',
    });
  }

  if (trendRows.length >= 2 && totalMonthly > 0) {
    const latest = trendRows[trendRows.length - 1]?.amount ?? 0;
    const prior = trendRows[trendRows.length - 2]?.amount ?? 0;
    const delta = prior === 0 ? 0 : ((latest - prior) / Math.abs(prior)) * 100;
    const trailing3Avg = trendRows.slice(-3).reduce((sum, row) => sum + row.amount, 0) / Math.min(3, trendRows.length);
    const avgVariance = trailing3Avg > 0 ? ((latest - trailing3Avg) / trailing3Avg) * 100 : 0;
    if (delta > 10) {
      insights.push({
        title: 'Upward cost momentum',
        finding: `Latest month is up ${delta.toFixed(1)}% month over month and ${Math.abs(avgVariance).toFixed(1)}% above trailing 3 month average.`,
        recommendation: 'Trigger immediate FinOps review for new workloads and validate reservations and autoscaling settings.',
        tone: 'critical',
      });
    } else if (delta < -8) {
      insights.push({
        title: 'Cost reduction trend',
        finding: `Latest month is down ${Math.abs(delta).toFixed(1)}% month over month.`,
        recommendation: 'Lock in the savings by documenting what changed and applying the same controls to other high cost workloads.',
        tone: 'positive',
      });
    }

    const mean = trendRows.reduce((sum, row) => sum + row.amount, 0) / trendRows.length;
    const variance = trendRows.reduce((sum, row) => sum + (row.amount - mean) ** 2, 0) / trendRows.length;
    const volatility = mean > 0 ? Math.sqrt(variance) / mean : 0;
    if (volatility > 0.18) {
      insights.push({
        title: 'Cost volatility risk',
        finding: `Monthly cost volatility is elevated at ${(volatility * 100).toFixed(1)}% across the six month trend.`,
        recommendation: 'Introduce workload level budgets and anomaly alerts to prevent late month surprises.',
        tone: 'critical',
      });
    }
  }

  if (mergedSubscriptionRows.length > 0 && totalMonthly > 0) {
    const topSub = mergedSubscriptionRows[0];
    const top3 = mergedSubscriptionRows.slice(0, 3).reduce((sum, row) => sum + row.c1, 0);
    const topShare = percentOf(topSub.c1, normalizedTotal);
    const top3Share = percentOf(top3, normalizedTotal);
    insights.push({
      title: 'Subscription concentration',
      finding: `Top subscription (${shortSubscriptionLabel(topSub.fullName)}) contributes ${topShare.toFixed(1)}% of monthly spend. Top 3 subscriptions contribute ${top3Share.toFixed(1)}%.`,
      recommendation: top3Share >= 70
        ? 'Prioritize optimization backlog in the top 3 subscriptions first. This gives the highest savings impact.'
        : 'Keep ownership by subscription and enforce monthly spend targets per owner.',
      tone: top3Share >= 70 ? 'critical' : 'watch',
    });
  }

  const allResources = resources ?? [];
  if (allResources.length > 0 && totalMonthly > 0) {
    const top5Cost = [...allResources]
      .sort((a, b) => (b.cost_1m ?? 0) - (a.cost_1m ?? 0))
      .slice(0, 5)
      .reduce((sum, row) => sum + (row.cost_1m ?? 0), 0);
    const top5Share = percentOf(top5Cost, normalizedTotal);
    const materialCount = allResources.filter((row) => percentOf(row.cost_1m ?? 0, normalizedTotal) >= 1).length;
    insights.push({
      title: 'Resource concentration',
      finding: `Top 5 resources represent ${top5Share.toFixed(1)}% of monthly spend. ${materialCount} resources each contribute at least 1% of monthly spend.`,
      recommendation: top5Share >= 45
        ? 'Target these top resources for rightsizing, commitment discounts, and schedule based shutdown first.'
        : 'Focus on policy based optimization across the broader resource set.',
      tone: top5Share > 45 ? 'watch' : 'positive',
    });
  }

  if (resourceTypeRows.length > 0) {
    const topType = resourceTypeRows[0];
    const topTypeCost = resourceGroupWindow === '6m' ? topType.c6 : resourceGroupWindow === '3m' ? topType.c3 : topType.c1;
    const typeShare = percentOf(topTypeCost, Math.max(totalForResourceWindow, 1));
    insights.push({
      title: 'Primary cost driver type',
      finding: `${topType.name} is the largest resource type for the selected ${resourceWindowLabel} window at ${formatCurrency(topTypeCost)} (${typeShare.toFixed(1)}% of total in window).`,
      recommendation: 'Apply service specific optimization actions for this type first because it is the strongest cost lever.',
      tone: typeShare >= 35 ? 'watch' : 'positive',
    });
  }

  if (resourceGroupRows.length > 0) {
    const topGroup = resourceGroupRows[0];
    const groupShare = percentOf(topGroup.cost, Math.max(totalForResourceWindow, 1));
    insights.push({
      title: 'Highest spend resource group',
      finding: `${topGroup.resourceGroup} in ${topGroup.subscriptionName} is the highest spend resource group at ${formatCurrency(topGroup.cost)} (${groupShare.toFixed(1)}% of selected window total).`,
      recommendation: 'Run workload and tagging review for this resource group to validate business ownership and optimization opportunities.',
      tone: groupShare >= 30 ? 'watch' : 'positive',
    });
  }

  return insights.slice(0, 8);
}

export function buildTrendRows(summary: CostSummary | null | undefined): Array<{ month: string; rawMonth: string; amount: number }> {
  return (summary?.by_month ?? [])
    .slice(-6)
    .map((m) => ({ month: formatMonthLabel(m.month), rawMonth: m.month, amount: m.amount }));
}

export function buildTrendPairs(summary: CostSummary | null | undefined): { previous: TrendPair | null; current: TrendPair | null } {
  const rows = (summary?.by_month ?? [])
    .map((row) => ({ month: row.month, amount: row.amount ?? 0 }))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 2) return { previous: null, current: null };

  const latest = rows[rows.length - 1];
  const second = rows[rows.length - 2];
  const third = rows.length >= 3 ? rows[rows.length - 3] : null;
  const now = currentMonthKey();

  const makePair = (from: { month: string; amount: number }, to: { month: string; amount: number }): TrendPair => {
    const pct = from.amount > 0 ? ((to.amount - from.amount) / Math.abs(from.amount)) * 100 : 0;
    return {
      fromMonth: formatMonthLabel(from.month),
      toMonth: formatMonthLabel(to.month),
      pct,
      trend: trendFromPct(pct),
    };
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
}
