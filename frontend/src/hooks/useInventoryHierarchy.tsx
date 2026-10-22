import { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Badge } from '../components/ui/badge';
import type { DatabaseOverview, InventorySummary, InventoryTreeNode, Resource, ResourceGroup, Subscription } from '../types';

const col = createColumnHelper<Resource>();

const dbCol = createColumnHelper<DatabaseOverview>();
const subCol = createColumnHelper<Subscription & {
  resource_group_count: number;
  resource_count: number;
  locations_count: number;
  tagged_percent: number;
}>();
const rgCol = createColumnHelper<ResourceGroup & {
  subscription_label: string;
  tags_count: number;
  tagged_resources: number;
  untagged_resources: number;
}>();

export interface UseInventoryHierarchyArgs {
  tree: InventoryTreeNode[] | null | undefined;
  resources: Resource[] | null | undefined;
  summary: InventorySummary | null | undefined;
  databases: DatabaseOverview[] | null | undefined;
  subscriptions: Subscription[] | null | undefined;
  resourceGroups: ResourceGroup[] | null | undefined;
  search: string;
  selectedSubscription: string;
  selectedResourceGroup: string;
  selectedType: string;
  selectedLocation: string;
  tagFilter: 'all' | 'tagged' | 'untagged';
  dbGroupFilter: string;
  dbTypeFilter: string;
  dbSubscriptionFilter: string;
  dbStatusFilter: string;
  dbSearch: string;
}

const dbColumns = [
  dbCol.accessor('resource_name', { header: 'Name' }),
  dbCol.accessor(
    (row) => (row as DatabaseOverview & { subscription_label?: string }).subscription_label ?? row.subscription_id,
    { id: 'subscription', header: 'Subscription' }
  ),
  dbCol.accessor('database_type', { header: 'Type' }),
  dbCol.accessor((row) => row.sku_tier ?? '', { id: 'sku_tier', header: 'SKU Tier' }),
  dbCol.accessor((row) => row.sku_name ?? '', { id: 'sku_name', header: 'SKU Name' }),
  dbCol.accessor('max_size_gb', {
    header: 'Max Size (GB)',
    cell: (info) => (info.getValue() != null ? info.getValue()!.toLocaleString() : '—'),
  }),
  dbCol.accessor('current_size_gb', {
    header: 'Current Size (GB)',
    cell: (info) => {
      const current = info.row.original.current_size_gb;
      const fallback = info.row.original.max_size_gb;
      const source = info.row.original.size_source;
      if (current != null) {
        if (source === 'max_fallback') return `${current.toLocaleString()} (max)`;
        return current.toLocaleString();
      }
      if (fallback != null) {
        return `${fallback.toLocaleString()} (max)`;
      }
      return '—';
    },
  }),
  dbCol.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const val = info.getValue() ?? '';
      const lower = val.toLowerCase();
      const variant =
        lower === 'online' || lower === 'available' || lower === 'succeeded'
          ? 'success'
          : lower === 'paused' || lower === 'scaling' || lower === 'resuming'
            ? 'warning'
            : lower === 'offline' || lower === 'disabled' || lower === 'failed' || lower === 'stopping'
              ? 'critical'
              : 'secondary';
      return val ? <Badge variant={variant}>{val}</Badge> : <>—</>;
    },
  }),
  dbCol.accessor('resource_group', { header: 'Resource Group' }),
];

function resourceTypeLeaf(value: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'Unknown';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

export function useInventoryHierarchy({
  tree,
  resources,
  summary,
  databases,
  subscriptions,
  resourceGroups,
  search,
  selectedSubscription,
  selectedResourceGroup,
  selectedType,
  selectedLocation,
  tagFilter,
  dbGroupFilter,
  dbTypeFilter,
  dbSubscriptionFilter,
  dbStatusFilter,
  dbSearch,
}: UseInventoryHierarchyArgs) {
  const resourceRows = useMemo(() => resources ?? [], [resources]);
  const summaryData = summary;

  const subscriptionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of subscriptions ?? []) {
      if (!row.subscription_id) continue;
      const display = row.display_name?.trim();
      if (display) map.set(row.subscription_id, display);
    }
    for (const row of resourceRows) {
      if (!row.subscription_id) continue;
      const display = row.subscription_name?.trim();
      if (display && !map.has(row.subscription_id)) map.set(row.subscription_id, display);
    }
    return map;
  }, [resourceRows, subscriptions]);

  const resourceColumns = useMemo(
    () => [
      col.accessor('name', { header: 'Name' }),
      col.accessor('type', { header: 'Type' }),
      col.accessor('resource_group', { header: 'Resource Group' }),
      col.accessor('location', { header: 'Location' }),
      col.accessor((row) => subscriptionNameById.get(row.subscription_id) ?? row.subscription_name ?? 'Unknown subscription', {
        id: 'subscription',
        header: 'Subscription',
      }),
      col.accessor('is_tagged', {
        header: 'Tagged',
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="success">Tagged</Badge>
          ) : (
            <Badge variant="destructive">Untagged</Badge>
          ),
      }),
    ],
    [subscriptionNameById]
  );

  const treeNodes = useMemo(
    () =>
      (tree ?? []).map((n) => ({
        id: n.id,
        name: n.label ?? n.name,
        type: n.type,
        children: n.children?.map((c) => ({
          id: c.id,
          name: c.label ?? c.name,
          type: c.type,
          children: c.children?.map((r) => ({
            id: r.id,
            name: r.label ?? r.name,
            type: r.type,
          })) ?? [],
        })) ?? [],
      })),
    [tree]
  );

  const databaseRows = useMemo(() => {
    return (databases ?? []).map((row) => {
      const subscriptionLabel = subscriptionNameById.get(row.subscription_id) ?? row.subscription_id ?? 'Unknown subscription';
      return {
        ...row,
        subscription_label: subscriptionLabel,
      };
    });
  }, [databases, subscriptionNameById]);

  const subscriptionOptions = useMemo(() => {
    const ids = new Map<string, string>();
    for (const r of resourceRows) {
      if (!r.subscription_id) continue;
      ids.set(r.subscription_id, subscriptionNameById.get(r.subscription_id) ?? r.subscription_name ?? 'Unknown subscription');
    }
    for (const row of subscriptions ?? []) {
      if (!row.subscription_id) continue;
      ids.set(row.subscription_id, row.display_name ?? row.subscription_id);
    }
    return [...ids.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [resourceRows, subscriptionNameById, subscriptions]);

  const subscriptionTableRows = useMemo(() => {
    return (subscriptions ?? [])
      .map((sub) => {
        const subResources = resourceRows.filter((row) => row.subscription_id === sub.subscription_id);
        const subGroups = (resourceGroups ?? []).filter((row) => row.subscription_id === sub.subscription_id);
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
      .sort((a, b) => b.resource_count - a.resource_count || a.display_name.localeCompare(b.display_name));
  }, [resourceRows, resourceGroups, subscriptions]);

  const resourceGroupTableRows = useMemo(() => {
    return (resourceGroups ?? [])
      .map((group) => {
        const groupResources = resourceRows.filter(
          (row) => row.subscription_id === group.subscription_id && row.resource_group === group.name
        );
        const taggedResources = groupResources.filter((row) => row.is_tagged).length;
        return {
          ...group,
          subscription_label: subscriptionNameById.get(group.subscription_id) ?? group.subscription_id,
          tags_count: Object.keys(group.tags ?? {}).length,
          tagged_resources: taggedResources,
          untagged_resources: Math.max(0, groupResources.length - taggedResources),
        };
      })
      .sort((a, b) => b.resource_count - a.resource_count || a.name.localeCompare(b.name));
  }, [resourceGroups, resourceRows, subscriptionNameById]);

  const subscriptionColumns = useMemo(
    () => [
      subCol.accessor('display_name', { header: 'Subscription' }),
      subCol.accessor('subscription_id', { header: 'Subscription ID' }),
      subCol.accessor('state', {
        header: 'State',
        cell: (info) => {
          const val = info.getValue() ?? '';
          const lower = val.toLowerCase();
          const variant = lower === 'enabled' ? 'success' : lower === 'disabled' || lower === 'deleted' ? 'critical' : 'secondary';
          return val ? <Badge variant={variant}>{val}</Badge> : <>—</>;
        },
      }),
      subCol.accessor('resource_group_count', { header: 'Resource Groups' }),
      subCol.accessor('resource_count', { header: 'Resources' }),
      subCol.accessor('locations_count', { header: 'Locations' }),
      subCol.accessor('tagged_percent', {
        header: 'Tagged %',
        cell: (info) => `${info.getValue().toFixed(1)}%`,
      }),
      subCol.accessor('tenant_id', { header: 'Tenant ID' }),
    ],
    []
  );

  const resourceGroupColumns = useMemo(
    () => [
      rgCol.accessor('name', { header: 'Resource Group' }),
      rgCol.accessor('subscription_label', { header: 'Subscription' }),
      rgCol.accessor('location', { header: 'Location' }),
      rgCol.accessor('provisioning_state', { header: 'Provisioning' }),
      rgCol.accessor('resource_count', { header: 'Resources' }),
      rgCol.accessor('tagged_resources', { header: 'Tagged' }),
      rgCol.accessor('untagged_resources', { header: 'Untagged' }),
      rgCol.accessor('tags_count', { header: 'Tags' }),
    ],
    []
  );

  const resourceGroupOptions = useMemo(() => {
    const groups = new Set<string>();
    for (const r of resourceRows) {
      groups.add(r.resource_group);
    }
    return [...groups].sort((a, b) => a.localeCompare(b));
  }, [resourceRows]);

  const dbGroupOptions = useMemo(() => {
    const groups = new Set<string>();
    for (const row of databaseRows) {
      if (row.resource_group) groups.add(row.resource_group);
    }
    return [...groups].sort((a, b) => a.localeCompare(b));
  }, [databaseRows]);

  const dbTypeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const d of databaseRows) {
      types.add(d.database_type);
    }
    return [...types].sort((a, b) => a.localeCompare(b));
  }, [databaseRows]);

  const dbSubscriptionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const d of databaseRows) {
      if (!d.subscription_id) continue;
      options.set(d.subscription_id, d.subscription_label);
    }
    return [...options.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [databaseRows]);

  const dbStatusOptions = useMemo(() => {
    const statuses = new Set<string>();
    for (const d of databaseRows) {
      if (d.status) statuses.add(d.status);
    }
    return [...statuses].sort((a, b) => a.localeCompare(b));
  }, [databaseRows]);

  const filteredDatabases = useMemo(() => {
    const needle = dbSearch.trim().toLowerCase();
    return databaseRows.filter((row) => {
      if (dbGroupFilter && row.resource_group !== dbGroupFilter) return false;
      if (dbTypeFilter && row.database_type !== dbTypeFilter) return false;
      if (dbSubscriptionFilter && row.subscription_id !== dbSubscriptionFilter) return false;
      if (dbStatusFilter && row.status !== dbStatusFilter) return false;
      if (!needle) return true;
      const composite = `${row.resource_name} ${row.database_type} ${row.resource_group} ${row.subscription_label} ${row.status} ${row.sku_name ?? ''} ${row.sku_tier ?? ''}`.toLowerCase();
      return composite.includes(needle);
    });
  }, [databaseRows, dbSearch, dbGroupFilter, dbTypeFilter, dbSubscriptionFilter, dbStatusFilter]);

  const hasMeasuredCurrentSize = useMemo(
    () => filteredDatabases.some((row) => row.size_source === 'current' && (row.current_size_gb ?? 0) > 0),
    [filteredDatabases]
  );

  const databaseChartRows = useMemo(() => {
    return filteredDatabases
      .map((row) => {
        const value = hasMeasuredCurrentSize
          ? (row.current_size_gb ?? row.max_size_gb ?? 0)
          : (row.max_size_gb ?? row.current_size_gb ?? 0);
        return {
          name: row.resource_name,
          value,
          source: row.size_source === 'max_fallback' ? 'using max provisioned size' : 'current metric',
        };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredDatabases, hasMeasuredCurrentSize]);

  const databaseChartMetricLabel = hasMeasuredCurrentSize ? 'Current size (GB)' : 'Provisioned max size (GB)';

  const typeOptions = useMemo(() => {
    if (!summaryData) return [];
    return Object.keys(summaryData.resources_by_type ?? {}).sort((a, b) => a.localeCompare(b));
  }, [summaryData]);

  const locationOptions = useMemo(() => {
    if (!summaryData) return [];
    return Object.keys(summaryData.resources_by_location ?? {}).sort((a, b) => a.localeCompare(b));
  }, [summaryData]);

  const filteredResources = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return resourceRows.filter((row) => {
      if (selectedSubscription && row.subscription_id !== selectedSubscription) return false;
      if (selectedResourceGroup && row.resource_group !== selectedResourceGroup) return false;
      if (selectedType && row.type !== selectedType) return false;
      if (selectedLocation && row.location !== selectedLocation) return false;
      if (tagFilter === 'tagged' && !row.is_tagged) return false;
      if (tagFilter === 'untagged' && row.is_tagged) return false;
      if (!needle) return true;
      const subscriptionLabel = subscriptionNameById.get(row.subscription_id) ?? row.subscription_name ?? '';
      const composite = `${row.name} ${row.type} ${row.resource_group} ${row.location} ${subscriptionLabel}`.toLowerCase();
      return composite.includes(needle);
    });
  }, [resourceRows, search, selectedSubscription, selectedResourceGroup, selectedType, selectedLocation, tagFilter, subscriptionNameById]);

  const topTypes = useMemo(() => {
    if (!summaryData) return [];
    return Object.entries(summaryData.resources_by_type ?? {})
      .map(([name, value]) => ({ name: resourceTypeLeaf(name), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [summaryData]);

  const topLocations = useMemo(() => {
    if (!summaryData) return [];
    return Object.entries(summaryData.resources_by_location ?? {})
      .map(([name, value]) => ({ name: name || 'Unknown', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [summaryData]);

  const taggingSplit = useMemo(() => {
    if (!summaryData) return [];
    const tagged = Math.max(0, summaryData.total_resources - summaryData.untagged_count);
    return [
      { name: 'Tagged', value: tagged },
      { name: 'Untagged', value: summaryData.untagged_count },
    ];
  }, [summaryData]);

  return {
    treeNodes,
    resourceRows,
    summaryData,
    subscriptionNameById,
    resourceColumns,
    dbColumns,
    databaseRows,
    subscriptionOptions,
    subscriptionTableRows,
    resourceGroupTableRows,
    subscriptionColumns,
    resourceGroupColumns,
    resourceGroupOptions,
    dbGroupOptions,
    dbTypeOptions,
    dbSubscriptionOptions,
    dbStatusOptions,
    filteredDatabases,
    hasMeasuredCurrentSize,
    databaseChartRows,
    databaseChartMetricLabel,
    typeOptions,
    locationOptions,
    filteredResources,
    topTypes,
    topLocations,
    taggingSplit,
  };
}
