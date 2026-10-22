import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatCurrency } from '../utils/formatters';
import { getResourceTypeHint } from '../utils/resourceNaming';
import {
  buildMergedSubscriptionRows,
  buildResourceCostTableRows,
  buildResourceDistributionRows,
  buildResourceGroupChartRows,
  buildResourceGroupExportRows,
  buildResourceGroupRows,
  buildExecutiveCostInsights,
  filterResourceGroupRows,
  buildResourceTypeRows,
  buildResourceTypeWindowRows,
  buildSubscriptionChartRows,
  buildSubscriptionNamesMap,
  buildTopResourceShareRows,
  buildTrendPairs,
  buildTrendRows,
  percentOf,
} from '../utils/costAnalysisHelpers';
import type {
  CostWindow,
  ResourceCostTableRow,
  ResourceGroupRow,
  ResourceGroupTableRow,
} from '../utils/costAnalysisHelpers';
import type { CostRecord, CostRollup, CostSummary, Subscription } from '../types';

const ALL_SUBSCRIPTIONS_VALUE = '__all__';

export interface UseCostAnalysisShapingArgs {
  summary: CostSummary | null | undefined;
  bySub: CostRollup[] | null | undefined;
  byResource: CostRecord[] | null | undefined;
  byGroup: CostRollup[] | null | undefined;
  byType: CostRollup[] | null | undefined;
  subscriptions: Subscription[] | null | undefined;
  selectedSubscription: string;
  subscriptionWindow: CostWindow;
  resourceGroupWindow: CostWindow;
  resourceDistributionWindow: CostWindow;
  resourceGroupSearch: string;
  resourceGroupSubscriptionFilter: string;
  authErrors: Array<string | null | undefined>;
}

export function useCostAnalysisShaping({
  summary,
  bySub,
  byResource,
  byGroup,
  byType,
  subscriptions,
  selectedSubscription,
  subscriptionWindow,
  resourceGroupWindow,
  resourceDistributionWindow,
  resourceGroupSearch,
  resourceGroupSubscriptionFilter,
  authErrors,
}: UseCostAnalysisShapingArgs) {
  const authError = useMemo(() => {
    const candidates = authErrors.filter(Boolean) as string[];
    return candidates.find((msg) => msg.toLowerCase().includes('profile session is not authenticated'));
  }, [authErrors]);

  const totalMonthly = summary?.total ?? summary?.total_cost_1m ?? 0;
  const total3m = summary?.total_cost_3m ?? 0;
  const total6m = summary?.total_cost_6m ?? 0;
  const averageMonthly = total6m > 0 ? total6m / 6 : 0;
  const hasAnyCostData =
    totalMonthly > 0 ||
    total3m > 0 ||
    total6m > 0 ||
    (summary?.by_month?.length ?? 0) > 0 ||
    (bySub?.length ?? 0) > 0 ||
    (byResource?.length ?? 0) > 0 ||
    (byGroup?.length ?? 0) > 0 ||
    (byType?.length ?? 0) > 0;

  const totalForResourceWindow = resourceGroupWindow === '6m' ? total6m : resourceGroupWindow === '3m' ? total3m : totalMonthly;
  const resourceWindowLabel = resourceGroupWindow === '6m' ? '6 months' : resourceGroupWindow === '3m' ? '3 months' : '1 month';
  const resourceDistributionWindowLabel = resourceDistributionWindow === '6m' ? '6 months' : resourceDistributionWindow === '3m' ? '3 months' : '1 month';

  const trendRows = useMemo(() => buildTrendRows(summary), [summary]);
  const trendPairs = useMemo(() => buildTrendPairs(summary), [summary]);

  const subscriptionNames = useMemo(
    () => buildSubscriptionNamesMap(subscriptions, bySub),
    [subscriptions, bySub]
  );

  const mergedSubscriptionRows = useMemo(
    () => buildMergedSubscriptionRows(bySub, subscriptionNames, subscriptionWindow),
    [bySub, subscriptionNames, subscriptionWindow]
  );

  const resourceSubscriptionDropdownOptions = useMemo(
    () => [
      { id: ALL_SUBSCRIPTIONS_VALUE, fullName: 'All subscriptions' },
      ...mergedSubscriptionRows,
    ],
    [mergedSubscriptionRows]
  );

  const effectiveSelectedSubscription = useMemo(() => {
    if (selectedSubscription === ALL_SUBSCRIPTIONS_VALUE) {
      return ALL_SUBSCRIPTIONS_VALUE;
    }
    if (mergedSubscriptionRows.length === 0) return ALL_SUBSCRIPTIONS_VALUE;
    const valid = mergedSubscriptionRows.some((row) => row.id === selectedSubscription);
    return valid ? selectedSubscription : ALL_SUBSCRIPTIONS_VALUE;
  }, [mergedSubscriptionRows, selectedSubscription]);

  const effectiveSelectedSubscriptionName = useMemo(() => {
    if (effectiveSelectedSubscription === ALL_SUBSCRIPTIONS_VALUE) return 'all subscriptions';
    return mergedSubscriptionRows.find((row) => row.id === effectiveSelectedSubscription)?.fullName || 'selected subscription';
  }, [effectiveSelectedSubscription, mergedSubscriptionRows]);

  const subscriptionChartRows = useMemo(
    () => buildSubscriptionChartRows(mergedSubscriptionRows, subscriptionWindow),
    [mergedSubscriptionRows, subscriptionWindow]
  );

  const filteredResourceRows = useMemo(
    () =>
      buildResourceDistributionRows(
        byResource,
        subscriptionNames,
        resourceDistributionWindow,
        effectiveSelectedSubscription,
        ALL_SUBSCRIPTIONS_VALUE
      ),
    [byResource, effectiveSelectedSubscription, resourceDistributionWindow, subscriptionNames]
  );

  const resourceCostTableRows = useMemo<ResourceCostTableRow[]>(
    () => buildResourceCostTableRows(byResource, subscriptionNames),
    [byResource, subscriptionNames]
  );

  const resourceCostTableColumns = useMemo<ColumnDef<ResourceCostTableRow>[]>(
    () => [
      { accessorKey: 'subscription', header: 'Subscription' },
      { accessorKey: 'resourceGroup', header: 'Resource group' },
      { accessorKey: 'resourceName', header: 'Resource name' },
      { accessorKey: 'cost1m', header: 'Last month', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
      { accessorKey: 'cost3m', header: '3 months', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
      { accessorKey: 'cost6m', header: '6 months', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
    ],
    []
  );

  const resourceDistributionSubtitle = useMemo(() => {
    if (effectiveSelectedSubscription === ALL_SUBSCRIPTIONS_VALUE) {
      return `Shows top individual resources across all subscriptions for the selected ${resourceDistributionWindowLabel} window`;
    }
    return `Shows top individual resources in ${effectiveSelectedSubscriptionName} for the selected ${resourceDistributionWindowLabel} window`;
  }, [effectiveSelectedSubscription, effectiveSelectedSubscriptionName, resourceDistributionWindowLabel]);

  const resourceTypeRows = useMemo(
    () => buildResourceTypeRows(byType, byResource),
    [byType, byResource]
  );

  const resourceTypeRows1m = useMemo(
    () => buildResourceTypeWindowRows(resourceTypeRows, '1m'),
    [resourceTypeRows]
  );

  const resourceTypeRows3m = useMemo(
    () => buildResourceTypeWindowRows(resourceTypeRows, '3m'),
    [resourceTypeRows]
  );

  const resourceTypeRows6m = useMemo(
    () => buildResourceTypeWindowRows(resourceTypeRows, '6m'),
    [resourceTypeRows]
  );

  const resourceTypeHint = useMemo(() => {
    for (const row of byType ?? []) {
      const hint = getResourceTypeHint(row.group_key ?? '');
      if (hint) return hint;
    }
    return null;
  }, [byType]);

  const resourceGroupRows = useMemo<ResourceGroupRow[]>(
    () => buildResourceGroupRows(byGroup, subscriptionNames, total6m, resourceGroupWindow),
    [byGroup, subscriptionNames, total6m, resourceGroupWindow]
  );

  const resourceGroupChartRows = useMemo(
    () => buildResourceGroupChartRows(resourceGroupRows),
    [resourceGroupRows]
  );

  const resourceGroupTableRows = useMemo(
    () => filterResourceGroupRows(resourceGroupRows, resourceGroupSearch, resourceGroupSubscriptionFilter),
    [resourceGroupRows, resourceGroupSearch, resourceGroupSubscriptionFilter]
  );

  const resourceGroupExportRows = useMemo<ResourceGroupTableRow[]>(
    () => buildResourceGroupExportRows(resourceGroupTableRows),
    [resourceGroupTableRows]
  );

  const resourceGroupTableColumns = useMemo<ColumnDef<ResourceGroupTableRow>[]>(
    () => [
      { accessorKey: 'resourceGroup', header: 'Resource group' },
      { accessorKey: 'subscription', header: 'Subscription' },
      { accessorKey: 'cost1m', header: 'Last month', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
      { accessorKey: 'cost3m', header: '3 months', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
      { accessorKey: 'cost6m', header: '6 months', cell: ({ getValue }) => formatCurrency(Number(getValue() ?? 0)) },
      { accessorKey: 'share6m', header: 'Share of 6 months' },
    ],
    []
  );

  const resourceGroupSubscriptionIds = useMemo(
    () => [...new Set(resourceGroupRows.map((row) => row.subscriptionId).filter((id) => id))].sort((a, b) => a.localeCompare(b)),
    [resourceGroupRows]
  );

  const topResourceShareRows = useMemo(
    () => buildTopResourceShareRows(byResource, subscriptionNames, totalMonthly),
    [byResource, totalMonthly, subscriptionNames]
  );

  const topResourceSharePercent = useMemo(() => {
    const topValue = topResourceShareRows
      .filter((row) => row.name !== 'Other resources')
      .reduce((sum, row) => sum + row.value, 0);
    return percentOf(topValue, totalMonthly);
  }, [topResourceShareRows, totalMonthly]);

  const topResourceTotalBaseline = totalMonthly;

  const executiveInsights = useMemo(
    () => buildExecutiveCostInsights({
      summary,
      totalMonthly,
      totalForResourceWindow,
      trendRows,
      mergedSubscriptionRows,
      resources: byResource,
      resourceTypeRows,
      resourceGroupRows,
      resourceGroupWindow,
      resourceWindowLabel,
    }),
    [
      summary,
      totalMonthly,
      totalForResourceWindow,
      trendRows,
      mergedSubscriptionRows,
      byResource,
      resourceTypeRows,
      resourceGroupRows,
      resourceGroupWindow,
      resourceWindowLabel,
    ]
  );

  return {
    authError,
    totalMonthly,
    total3m,
    total6m,
    averageMonthly,
    hasAnyCostData,
    totalForResourceWindow,
    resourceWindowLabel,
    resourceDistributionWindowLabel,
    trendRows,
    trendPairs,
    subscriptionNames,
    mergedSubscriptionRows,
    resourceSubscriptionDropdownOptions,
    effectiveSelectedSubscription,
    effectiveSelectedSubscriptionName,
    subscriptionChartRows,
    filteredResourceRows,
    resourceCostTableRows,
    resourceCostTableColumns,
    resourceDistributionSubtitle,
    resourceTypeRows,
    resourceTypeRows1m,
    resourceTypeRows3m,
    resourceTypeRows6m,
    resourceTypeHint,
    resourceGroupRows,
    resourceGroupChartRows,
    resourceGroupTableRows,
    resourceGroupExportRows,
    resourceGroupTableColumns,
    resourceGroupSubscriptionIds,
    topResourceShareRows,
    topResourceSharePercent,
    topResourceTotalBaseline,
    executiveInsights,
  };
}
