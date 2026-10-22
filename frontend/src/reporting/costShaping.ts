import type { CostRecord, CostRollup, Resource, ResourceGroup, Subscription } from '../types';
import type { CsvRow } from '../utils/csv';
import { formatCurrency } from '../utils/formatters';
import { normalizeResourceTypeName } from '../utils/resourceNaming';

function trendIcon(trend?: string): string {
  if (trend === 'increasing') return '▲';
  if (trend === 'decreasing') return '▼';
  return '—';
}

function shortType(value: string): string {
  return value.replace(/^microsoft\./i, '').replace(/\//g, ' / ');
}

function isSubscriptionId(value: string): boolean {
  const raw = (value ?? '').trim();
  if (!raw) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
}

export function nameFromResourceId(id: string, fallback?: string): string {
  if (!id) return fallback ?? '—';
  const parts = id.split('/');
  const name = parts[parts.length - 1];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name) && parts.length > 2) {
    return `${parts[parts.length - 2]} / ${name.slice(0, 8)}…`;
  }
  return name || fallback || '—';
}

export function resolveSubscriptionName(
  nameCandidate: string | undefined,
  keyCandidate: string | undefined,
  subscriptionNames: Map<string, string>,
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

export function buildSubscriptionNameMap(subscriptions: Subscription[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of subscriptions) {
    if (item.subscription_id && item.display_name) {
      map.set(item.subscription_id, item.display_name);
    }
  }
  return map;
}

export function buildInventoryResourceCountBySubscription(resourceGroups: ResourceGroup[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of resourceGroups) {
    map.set(item.subscription_id, (map.get(item.subscription_id) ?? 0) + (item.resource_count ?? 0));
  }
  return map;
}

export function buildCostByResourceId(costRecords: CostRecord[]): Map<string, CostRecord> {
  const map = new Map<string, CostRecord>();
  for (const item of costRecords) {
    const key = (item.resource_id ?? '').trim().toLowerCase();
    if (!key) continue;
    map.set(key, item);
  }
  return map;
}

export function buildCostResourceCountByType(costRecords: CostRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of costRecords) {
    const key = (item.resource_type ?? '').trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function resolveSubscriptionLookupId(subscriptionId?: string, groupKey?: string): string {
  const value = (subscriptionId ?? groupKey ?? '').trim();
  const match = value.match(/^\/subscriptions\/([^/]+)$/i);
  return match?.[1] ?? value;
}

export function buildCostBySubscriptionExportRows(
  costBySubscription: CostRollup[],
  subscriptionNames: Map<string, string>,
  inventoryResourceCountBySubscription: Map<string, number>,
): CsvRow[] {
  return costBySubscription.map((item) => {
    const subscriptionId = resolveSubscriptionLookupId(item.subscription_id, item.group_key);
    return {
      Subscription: resolveSubscriptionName(item.subscription_name, item.group_key, subscriptionNames),
      '1-Month': formatCurrency(item.cost_1m),
      '3-Month': formatCurrency(item.cost_3m),
      '6-Month': formatCurrency(item.cost_6m),
      Trend: `${trendIcon(item.trend)} ${item.trend}`,
      'Inventory Resources': inventoryResourceCountBySubscription.get(subscriptionId) ?? '',
      'Costed Resources': item.resource_count || '',
    };
  });
}

export function buildCostByResourceGroupExportRows(costByResourceGroup: CostRollup[]): CsvRow[] {
  return costByResourceGroup.map((item) => ({
    'Resource Group': item.group_key !== 'unknown' ? item.group_key : 'Subscription-level',
    '1-Month': formatCurrency(item.cost_1m),
    '3-Month': formatCurrency(item.cost_3m),
    '6-Month': formatCurrency(item.cost_6m),
    Trend: `${trendIcon(item.trend)} ${item.trend}`,
    'Costed Resources': item.resource_count || '',
  }));
}

export function buildCostByResourceTypeExportRows(
  costByType: CostRollup[],
  costResourceCountByType: Map<string, number>,
): CsvRow[] {
  return costByType.map((item) => {
    const fallbackCount = costResourceCountByType.get((item.group_key ?? '').trim().toLowerCase()) ?? 0;
    return {
      'Resource Type': shortType(item.group_key),
      'Friendly Name': normalizeResourceTypeName(item.group_key),
      '1-Month': formatCurrency(item.cost_1m),
      '3-Month': formatCurrency(item.cost_3m),
      '6-Month': formatCurrency(item.cost_6m),
      Trend: `${trendIcon(item.trend)} ${item.trend}`,
      Count: item.resource_count || fallbackCount || '',
    };
  });
}

export function buildTopCostDriverExportRows(costByResource: CostRecord[]): CsvRow[] {
  return [...costByResource]
    .sort((a, b) => b.cost_1m - a.cost_1m)
    .map((item) => ({
      // Preserve the legacy export behavior for top cost drivers:
      // blank resource names stay blank rather than falling back to a derived ID label.
      Resource: item.resource_name ?? '',
      Type: shortType(item.resource_type),
      'Resource Group': item.resource_group || '',
      '1-Month': formatCurrency(item.cost_1m),
      '3-Month': formatCurrency(item.cost_3m),
      '6-Month': formatCurrency(item.cost_6m),
      Trend: `${trendIcon(item.trend)} ${item.trend}`,
    }));
}

export function buildCostByResourceExportRows(
  costByResource: CostRecord[],
  subscriptionNames: Map<string, string>,
): CsvRow[] {
  return [...costByResource]
    .sort((a, b) => b.cost_6m - a.cost_6m)
    .map((item) => ({
      Subscription: resolveSubscriptionName(undefined, item.subscription_id, subscriptionNames),
      'Resource Group': item.resource_group || '',
      Resource: item.resource_name || nameFromResourceId(item.resource_id, '—'),
      'Resource Type': shortType(item.resource_type),
      'Friendly Type': normalizeResourceTypeName(item.resource_type),
      '1-Month': formatCurrency(item.cost_1m),
      '3-Month': formatCurrency(item.cost_3m),
      '6-Month': formatCurrency(item.cost_6m),
      Trend: `${trendIcon(item.trend)} ${item.trend}`,
    }));
}

export function buildAllResourcesWithCostExportRows(
  resources: Resource[],
  costByResourceId: Map<string, CostRecord>,
  subscriptionNames: Map<string, string>,
): CsvRow[] {
  return [...resources]
    .map((item) => {
      const matchedCost = costByResourceId.get((item.id ?? '').trim().toLowerCase());
      return {
        Subscription: resolveSubscriptionName(item.subscription_name, item.subscription_id, subscriptionNames),
        'Resource Group': item.resource_group || '',
        Resource: item.name || nameFromResourceId(item.id, '—'),
        'Resource Type': shortType(item.type),
        'Friendly Type': normalizeResourceTypeName(item.type),
        '1-Month': formatCurrency(matchedCost?.cost_1m ?? 0),
        '3-Month': formatCurrency(matchedCost?.cost_3m ?? 0),
        '6-Month': formatCurrency(matchedCost?.cost_6m ?? 0),
        Trend: `${trendIcon(matchedCost?.trend)} ${matchedCost?.trend ?? 'stable'}`,
      };
    })
    .sort((a, b) => {
      return (
        String(a.Subscription).localeCompare(String(b.Subscription)) ||
        String(a['Resource Group']).localeCompare(String(b['Resource Group'])) ||
        String(a.Resource).localeCompare(String(b.Resource))
      );
    });
}

export interface CostExportRowsInput {
  costBySubscription?: CostRollup[];
  costByResourceGroup?: CostRollup[];
  costByResourceType?: CostRollup[];
  costByResource?: CostRecord[];
  resources?: Resource[];
  resourceGroups?: ResourceGroup[];
  subscriptions?: Subscription[];
  subscriptionNames?: Map<string, string>;
  inventoryResourceCountBySubscription?: Map<string, number>;
  costResourceCountByType?: Map<string, number>;
}

export interface CostExportRows {
  bySubscription: CsvRow[];
  byResourceGroup: CsvRow[];
  byResourceType: CsvRow[];
  topCostDrivers: CsvRow[];
  byResource: CsvRow[];
  allResourcesWithCost: CsvRow[];
}

export interface CostExportRowsSelection {
  bySubscription?: boolean;
  byResourceGroup?: boolean;
  byResourceType?: boolean;
  topCostDrivers?: boolean;
  byResource?: boolean;
  allResourcesWithCost?: boolean;
}

const defaultCostExportRowsSelection: Required<CostExportRowsSelection> = {
  bySubscription: true,
  byResourceGroup: true,
  byResourceType: true,
  topCostDrivers: true,
  byResource: true,
  allResourcesWithCost: true,
};

function resolveCostExportRowsSelection(selection?: CostExportRowsSelection): Required<CostExportRowsSelection> {
  return {
    bySubscription: selection?.bySubscription ?? defaultCostExportRowsSelection.bySubscription,
    byResourceGroup: selection?.byResourceGroup ?? defaultCostExportRowsSelection.byResourceGroup,
    byResourceType: selection?.byResourceType ?? defaultCostExportRowsSelection.byResourceType,
    topCostDrivers: selection?.topCostDrivers ?? defaultCostExportRowsSelection.topCostDrivers,
    byResource: selection?.byResource ?? defaultCostExportRowsSelection.byResource,
    allResourcesWithCost: selection?.allResourcesWithCost ?? defaultCostExportRowsSelection.allResourcesWithCost,
  };
}

export function buildCostExportRows(
  input: CostExportRowsInput,
  selection?: CostExportRowsSelection,
): CostExportRows {
  const selected = resolveCostExportRowsSelection(selection);
  const needsSubscriptionNames = selected.bySubscription || selected.byResource || selected.allResourcesWithCost;
  const subscriptionNames = needsSubscriptionNames
    ? (input.subscriptionNames ?? buildSubscriptionNameMap(input.subscriptions ?? []))
    : undefined;
  const inventoryResourceCountBySubscription = selected.bySubscription
    ? (input.inventoryResourceCountBySubscription ?? buildInventoryResourceCountBySubscription(input.resourceGroups ?? []))
    : undefined;
  const costByResourceId = selected.allResourcesWithCost ? buildCostByResourceId(input.costByResource ?? []) : undefined;
  const costResourceCountByType = selected.byResourceType
    ? (input.costResourceCountByType ?? buildCostResourceCountByType(input.costByResource ?? []))
    : undefined;

  return {
    bySubscription: selected.bySubscription
      ? buildCostBySubscriptionExportRows(
        input.costBySubscription ?? [],
        subscriptionNames!,
        inventoryResourceCountBySubscription!,
      )
      : [],
    byResourceGroup: selected.byResourceGroup ? buildCostByResourceGroupExportRows(input.costByResourceGroup ?? []) : [],
    byResourceType: selected.byResourceType
      ? buildCostByResourceTypeExportRows(
        input.costByResourceType ?? [],
        costResourceCountByType!,
      )
      : [],
    topCostDrivers: selected.topCostDrivers ? buildTopCostDriverExportRows(input.costByResource ?? []) : [],
    byResource: selected.byResource
      ? buildCostByResourceExportRows(input.costByResource ?? [], subscriptionNames!)
      : [],
    allResourcesWithCost: selected.allResourcesWithCost
      ? buildAllResourcesWithCostExportRows(
        input.resources ?? [],
        costByResourceId!,
        subscriptionNames!,
      )
      : [],
  };
}
