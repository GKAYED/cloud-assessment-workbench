/**
 * CostAnalysis.tsx — cost breakdown and trends with multiple views.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { ChartCard } from '../components/shared/ChartCard';
import { DataTable } from '../components/shared/DataTable';
import { SectionNav } from '../components/shared/SectionNav';
import type { SectionDef } from '../components/shared/SectionNav';
import { SummaryBar } from '../components/shared/SummaryBar';
import { FilterBar } from '../components/shared/FilterBar';
import { TrendBadge } from '../components/shared/TrendBadge';
import { useModuleData } from '../hooks/useModuleData';
import { useCostAnalysisShaping } from '../hooks/useCostAnalysisShaping';
import { costsApi } from '../api/costs';
import { inventoryApi } from '../api/inventory';
import { formatCurrency } from '../utils/formatters';
import {
  COST_COLORS,
  CHART_GRID,
  CHART_LABEL_FILL,
  CHART_TICK_FILL,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_TEXT,
} from '../utils/chartPalette';
import type { CostWindow } from '../utils/costAnalysisHelpers';
import { percentOf, subscriptionLabel } from '../utils/costAnalysisHelpers';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import type { CostRecord, CostRollup, CostSummary, Subscription } from '../types';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';

const ALL_SUBSCRIPTIONS_VALUE = '__all__';

function renderBarValueLabel(
  props: { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: unknown },
  formatValue: (value: unknown) => string,
) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  const xNum = Number(x ?? 0);
  const yNum = Number(y ?? 0);
  const widthNum = Number(width ?? 0);
  const heightNum = Number(height ?? 0);
  const label = formatValue(value);
  const hasRoomInside = widthNum >= Math.max(70, label.length * 7);
  const textX = hasRoomInside ? xNum + widthNum - 8 : xNum + widthNum + 6;
  const textY = yNum + heightNum / 2 + 4;

  return (
    <text
      x={textX}
      y={textY}
      textAnchor={hasRoomInside ? 'end' : 'start'}
      fill={hasRoomInside ? 'var(--color-popover-foreground)' : 'var(--color-foreground)'}
      fontSize={11}
      fontWeight={600}
    >
      {label}
    </text>
  );
}

function renderCurrencyBarLabel(props: { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: unknown }) {
  return renderBarValueLabel(props, (value) => formatCurrency(Number(value ?? 0)));
}

function renderPercentBarLabel(props: { x?: string | number; y?: string | number; width?: string | number; height?: string | number; value?: unknown }) {
  return renderBarValueLabel(props, (value) => String(value ?? ''));
}


const costSections: SectionDef[] = [
  { id: 'cost-summary', label: 'Summary' },
  { id: 'cost-trend', label: 'Monthly trend' },
  { id: 'cost-subscription', label: 'By subscription' },
  { id: 'cost-type', label: 'By type' },
  { id: 'cost-group', label: 'By group' },
  { id: 'cost-resource', label: 'By resource' },
  { id: 'cost-insights', label: 'Insights' },
];

export default function CostAnalysis() {
  const navigate = useNavigate();
  const [selectedSubscription, setSelectedSubscription] = useState<string>(ALL_SUBSCRIPTIONS_VALUE);
  const [subscriptionWindow, setSubscriptionWindow] = useState<CostWindow>('3m');
  const [resourceGroupWindow, setResourceGroupWindow] = useState<CostWindow>('3m');
  const [resourceDistributionWindow, setResourceDistributionWindow] = useState<CostWindow>('3m');
  const [resourceGroupSearch, setResourceGroupSearch] = useState('');
  const [resourceGroupSubscriptionFilter, setResourceGroupSubscriptionFilter] = useState('');

  const summary = useModuleData<CostSummary>(() => costsApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.costSummary });
  const bySub = useModuleData<CostRollup[]>(() => costsApi.bySubscription(), [], { cacheKey: MODULE_CACHE_KEYS.costBySubscription });
  const byResource = useModuleData<CostRecord[]>(() => costsApi.byResource(), [], { cacheKey: MODULE_CACHE_KEYS.costByResource });
  const byGroup = useModuleData<CostRollup[]>(() => costsApi.byResourceGroup(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceGroup });
  const byType = useModuleData<CostRollup[]>(() => costsApi.byResourceType(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceType });
  const subscriptions = useModuleData<Subscription[]>(
    () => inventoryApi.subscriptions(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions }
  );
  const {
    authError,
    totalMonthly,
    total3m,
    total6m,
    averageMonthly,
    hasAnyCostData,
    resourceWindowLabel,
    trendRows,
    trendPairs,
    subscriptionNames,
    resourceSubscriptionDropdownOptions,
    effectiveSelectedSubscription,
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
    resourceGroupChartRows,
    resourceGroupTableRows,
    resourceGroupExportRows,
    resourceGroupTableColumns,
    resourceGroupSubscriptionIds,
    topResourceShareRows,
    topResourceSharePercent,
    topResourceTotalBaseline,
    executiveInsights,
  } = useCostAnalysisShaping({
    summary: summary.data,
    bySub: bySub.data,
    byResource: byResource.data,
    byGroup: byGroup.data,
    byType: byType.data,
    subscriptions: subscriptions.data,
    selectedSubscription,
    subscriptionWindow,
    resourceGroupWindow,
    resourceDistributionWindow,
    resourceGroupSearch,
    resourceGroupSubscriptionFilter,
    authErrors: [summary.error, bySub.error, byResource.error, byGroup.error, byType.error],
  });

  if (authError && !hasAnyCostData) {
    return (
      <PageLayout title="Cost analysis" exportId="cost-page">
        <div className="data-gap-banner" role="alert">
          <span>Cost data is unavailable: your profile session expired. Reconnect the profile to pull live costs.</span>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/profiles')}>
          Go To Profiles
        </button>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Cost analysis" exportId="cost-page">
      <SectionNav sections={costSections} />
      {summary.status === 'success' && summary.data && (
        <SummaryBar id="cost-summary">
          <div className="summary-item">
            <span className="summary-label">Average monthly spend</span>
            <span className="big-number">{formatCurrency(averageMonthly)}</span>
            <span className="summary-note">Calculated as the average monthly spend across the last 6 months.</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total 1 month</span>
            <span className="big-number">{formatCurrency(totalMonthly)}</span>
            <span className="summary-note">Calculated across all subscriptions for the selected 1 month window.</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total 3 months</span>
            <span className="big-number">{formatCurrency(total3m)}</span>
            <span className="summary-note">Calculated across all subscriptions for the selected 3 months window.</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total 6 months</span>
            <span className="big-number">{formatCurrency(total6m)}</span>
            <span className="summary-note">Calculated across all subscriptions for the selected 6 months window.</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Trend</span>
            {trendPairs.previous ? (
              <>
                <TrendBadge trend={trendPairs.previous.trend} label={`${trendPairs.previous.pct.toFixed(1)}%`} />
                <span className="summary-note">Full-month month over month: {trendPairs.previous.fromMonth}/{trendPairs.previous.toMonth}</span>
                {trendPairs.current && (
                  <>
                    <TrendBadge trend={trendPairs.current.trend} label={`${trendPairs.current.pct.toFixed(1)}%`} />
                    <span className="summary-note">Current month vs previous: {trendPairs.current.toMonth}/{trendPairs.current.fromMonth}</span>
                  </>
                )}
              </>
            ) : (
              <span className="summary-note">Not enough monthly data returned for month over month comparison.</span>
            )}
          </div>
        </SummaryBar>
      )}

      {summary.status === 'loading' ? (
        <p className="loading-text">Loading monthly trend…</p>
      ) : summary.status === 'error' ? (
        <p className="error-text">Failed to load trend data: {summary.error}</p>
      ) : trendRows.length > 0 ? (
        <ChartCard
          id="cost-trend"
          title="Monthly spending trend"
          subtitle="Shows total monthly cloud spend across the last 6 months"
        >
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={trendRows}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="month" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
              <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_TEXT}
                itemStyle={CHART_TOOLTIP_TEXT}
                formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Monthly Cost']}
              />
              <Line type="monotone" dataKey="amount" stroke={COST_COLORS[0]} strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <p className="empty-state">No monthly trend data returned yet.</p>
      )}

      {bySub.status === 'loading' ? (
        <p className="loading-text">Loading subscription breakdown…</p>
      ) : bySub.status === 'error' ? (
        <p className="error-text">Failed to load subscription costs: {bySub.error}</p>
      ) : subscriptionChartRows.length > 0 ? (
        <ChartCard id="cost-subscription" title="Cost per subscription" subtitle="Shows cost comparison between subscriptions for the selected range">
          <div className="cost-range-row">
            <span className="cost-range-label">Range</span>
            <label className="cost-range-option">
              <input
                type="radio"
                name="cost-range"
                checked={subscriptionWindow === '1m'}
                onChange={() => setSubscriptionWindow('1m')}
              />
              Last month
            </label>
            <label className="cost-range-option">
              <input
                type="radio"
                name="cost-range"
                checked={subscriptionWindow === '3m'}
                onChange={() => setSubscriptionWindow('3m')}
              />
              3 months
            </label>
            <label className="cost-range-option">
              <input
                type="radio"
                name="cost-range"
                checked={subscriptionWindow === '6m'}
                onChange={() => setSubscriptionWindow('6m')}
              />
              6 months
            </label>
          </div>
          <p className="cost-subscription-count">
            {subscriptionChartRows.length} subscription(s) shown.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(360, subscriptionChartRows.length * 34)}>
              <BarChart data={subscriptionChartRows} layout="vertical" margin={{ top: 8, right: 16, left: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={250}
                  tick={{ fill: CHART_TICK_FILL, fontSize: 11 }}
                  tickFormatter={(v: string) => (v.length > 42 ? `${v.slice(0, 42)}…` : v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                labelFormatter={(_, payload) => {
                  const fullName = String(payload?.[0]?.payload?.fullName ?? '');
                  return fullName;
                }}
                formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Cost']}
                />
                <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
                  {subscriptionChartRows.map((_, idx) => (
                    <Cell key={`sub-${idx}`} fill={COST_COLORS[idx % COST_COLORS.length]} />
                  ))}
                  <LabelList dataKey="cost" content={renderCurrencyBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        </ChartCard>
      ) : (
        <p className="empty-state">No subscription cost data returned yet.</p>
      )}

      {byType.status === 'loading' ? (
        <p className="loading-text">Loading resource type breakdown…</p>
      ) : resourceTypeRows.length > 0 ? (
        <ChartCard id="cost-type" title="Cost by resource type" subtitle="Aggregates resource spend by Azure resource type for last month, 3 months, and 6 months">
          <div className="cost-three-grid">
            <div className="cost-mini-chart">
              <h4>Last month</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resourceTypeRows1m} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: CHART_TICK_FILL, fontSize: 10 }} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 24)}…` : v)} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Cost']} />
                  <Bar dataKey="cost" radius={[0, 6, 6, 0]} fill={COST_COLORS[0]}>
                    <LabelList dataKey="pctLabel" position="insideRight" fill={CHART_LABEL_FILL} fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="cost-mini-chart">
              <h4>3 months</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resourceTypeRows3m} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: CHART_TICK_FILL, fontSize: 10 }} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 24)}…` : v)} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Cost']} />
                  <Bar dataKey="cost" radius={[0, 6, 6, 0]} fill={COST_COLORS[1]}>
                    <LabelList dataKey="pctLabel" position="insideRight" fill={CHART_LABEL_FILL} fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="cost-mini-chart">
              <h4>6 months</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resourceTypeRows6m} layout="vertical" margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: CHART_TICK_FILL, fontSize: 10 }} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 24)}…` : v)} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Cost']} />
                  <Bar dataKey="cost" radius={[0, 6, 6, 0]} fill={COST_COLORS[2]}>
                    <LabelList dataKey="pctLabel" position="insideRight" fill={CHART_LABEL_FILL} fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {resourceTypeHint && <p className="cost-chart-note">{resourceTypeHint}</p>}
        </ChartCard>
      ) : (
        <p className="empty-state">No resource type cost data returned yet.</p>
      )}

      {byGroup.status === 'loading' ? (
        <p className="loading-text">Loading resource group costs…</p>
      ) : resourceGroupChartRows.length > 0 ? (
        <>
          <ChartCard id="cost-group" title="Cost by resource group" subtitle={`Shows resource groups and spend in the selected ${resourceWindowLabel} window`}>
            <p className="cost-chart-note">
              Each row combines a resource group with its subscription and shows spend for the selected time window.
            </p>
            <div className="cost-range-row">
              <span className="cost-range-label">Range</span>
              <label className="cost-range-option">
                <input type="radio" name="resource-group-range" checked={resourceGroupWindow === '1m'} onChange={() => setResourceGroupWindow('1m')} />
                Last month
              </label>
              <label className="cost-range-option">
                <input type="radio" name="resource-group-range" checked={resourceGroupWindow === '3m'} onChange={() => setResourceGroupWindow('3m')} />
                3 months
              </label>
              <label className="cost-range-option">
                <input type="radio" name="resource-group-range" checked={resourceGroupWindow === '6m'} onChange={() => setResourceGroupWindow('6m')} />
                6 months
              </label>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(340, resourceGroupChartRows.length * 30)}>
              <BarChart data={resourceGroupChartRows} layout="vertical" margin={{ top: 8, right: 14, left: 160, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={260}
                  tick={{ fill: CHART_TICK_FILL, fontSize: 11 }}
                  tickFormatter={(v: string) => (v.length > 42 ? `${v.slice(0, 42)}…` : v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                  formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), `Cost (${resourceWindowLabel})`]}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload;
                    if (!row) return '';
                    return `${String(row.fullName)} | ${String(row.subscriptionName)}`;
                  }}
                />
                <Bar dataKey="cost" radius={[0, 6, 6, 0]} fill={COST_COLORS[2]} barSize={16}>
                  <LabelList dataKey="cost" content={renderCurrencyBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Resource group spend table" subtitle="Shows 1 month, 3 months, 6 months spend and 6-month share by resource group">
            <FilterBar
              className="cost-table-filters"
              search={resourceGroupSearch}
              onSearchChange={setResourceGroupSearch}
              searchPlaceholder="Filter by resource group or subscription..."
              filters={[
                { ariaLabel: 'Subscription filter', value: resourceGroupSubscriptionFilter, onChange: setResourceGroupSubscriptionFilter, allLabel: 'All subscriptions', options: resourceGroupSubscriptionIds.map((subId) => ({ value: subId, label: subscriptionLabel(subId, undefined, subscriptionNames) })) },
              ]}
            />
            <p className="cost-subscription-count">{resourceGroupTableRows.length} resource group row(s) shown.</p>
            <DataTable
              data={resourceGroupExportRows}
              columns={resourceGroupTableColumns}
              filterPlaceholder="Filter by resource group or subscription..."
              exportFileName="cost-resource-groups"
              stickyFirstColumn
            />
          </ChartCard>
        </>
      ) : (
        <p className="empty-state">No resource group cost data returned yet.</p>
      )}

      <div className="cost-filter-row">
        <label htmlFor="subscription-cost-filter">Resource cost distribution for subscription</label>
        <select
          id="subscription-cost-filter"
          className="cost-subscription-select"
          value={effectiveSelectedSubscription}
          onChange={(e) => setSelectedSubscription(e.target.value)}
        >
          {resourceSubscriptionDropdownOptions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.fullName}
            </option>
          ))}
        </select>
      </div>

      {byResource.status === 'loading' ? (
        <p className="loading-text">Loading resource distribution…</p>
      ) : byResource.status === 'error' ? (
        <p className="error-text">Failed to load resource costs: {byResource.error}</p>
      ) : filteredResourceRows.length > 0 ? (
        <>
          <ChartCard
            id="cost-resource"
            title="Cost distribution by resource"
            subtitle={resourceDistributionSubtitle}
          >
            <div className="cost-range-row">
              <span className="cost-range-label">Range</span>
              <label className="cost-range-option">
                  <input
                    type="radio"
                    name="resource-distribution-range"
                    checked={resourceDistributionWindow === '1m'}
                    onChange={() => setResourceDistributionWindow('1m')}
                  />
                  Last month
                </label>
              <label className="cost-range-option">
                  <input
                    type="radio"
                    name="resource-distribution-range"
                    checked={resourceDistributionWindow === '3m'}
                    onChange={() => setResourceDistributionWindow('3m')}
                  />
                  3 months
                </label>
              <label className="cost-range-option">
                  <input
                    type="radio"
                    name="resource-distribution-range"
                    checked={resourceDistributionWindow === '6m'}
                    onChange={() => setResourceDistributionWindow('6m')}
                  />
                  6 months
                </label>
            </div>
            <p className="cost-chart-note">
              Each bar is one Azure resource. Use this to pinpoint the exact services and workloads driving subscription spend.
            </p>
            <div className="cost-resource-distribution-chart">
              <ResponsiveContainer width="100%" height={Math.max(340, filteredResourceRows.length * 32)}>
                <BarChart data={filteredResourceRows} layout="vertical" margin={{ top: 8, right: 16, left: 120, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fill: CHART_TICK_FILL, fontSize: 12 }}
                    tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 26)}…` : v)}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_TEXT}
                    itemStyle={CHART_TOOLTIP_TEXT}
                    formatter={(value: number | string | undefined) => [formatCurrency(Number(value ?? 0)), 'Cost']}
                    labelFormatter={(label, payload) => {
                      const type = String(payload?.[0]?.payload?.type ?? '');
                      const full = String(payload?.[0]?.payload?.fullName ?? label ?? '');
                      const caption = `${full}${type ? ` (${type})` : ''}`;
                      return caption;
                    }}
                  />
                  <Bar dataKey="cost" radius={[0, 6, 6, 0]} fill={COST_COLORS[0]} barSize={18}>
                    <LabelList dataKey="cost" content={renderCurrencyBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Resource cost register"
            subtitle="Shows every discovered resource with subscription, resource group, and 1 month / 3 months / 6 months cost."
          >
            <p className="cost-subscription-count">{resourceCostTableRows.length} resource row(s) shown.</p>
            <DataTable
              data={resourceCostTableRows}
              columns={resourceCostTableColumns}
              filterPlaceholder="Search subscriptions, resource groups, or resources..."
              exportFileName="cost-resource-register"
              stickyFirstColumn
            />
          </ChartCard>
        </>
      ) : (
        <p className="empty-state">No resource cost data returned for the selected range and subscription.</p>
      )}

      {byResource.status === 'success' && topResourceShareRows.length > 0 && (
        <ChartCard
          title="Top resource concentration"
          subtitle="Shows named resources that together account for 75% of monthly spend, plus all other resources"
        >
          <p className="cost-subscription-count">{topResourceSharePercent.toFixed(1)}% of total monthly spend is driven by named resources in the chart.</p>
          <div className="cost-concentration-grid">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={topResourceShareRows.map((row) => ({
                  ...row,
                  pctLabel: `${percentOf(row.value, topResourceTotalBaseline).toFixed(1)}%`,
                }))}
                layout="vertical"
                margin={{ top: 8, right: 22, left: 12, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={190}
                  tick={{ fill: CHART_TICK_FILL, fontSize: 11 }}
                  tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 30)}…` : v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                  formatter={(value: number | string | undefined, name: string | undefined) => {
                    const amount = Number(value ?? 0);
                    const pct = percentOf(amount, topResourceTotalBaseline);
                    return [`${formatCurrency(amount)} (${pct.toFixed(1)}%)`, name ?? 'Share'];
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={COST_COLORS[2]} barSize={18}>
                  <LabelList dataKey="pctLabel" content={renderPercentBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="cost-concentration-list">
              {topResourceShareRows.map((row) => {
                const pct = percentOf(row.value, topResourceTotalBaseline);
                return (
                  <div key={row.name} className="cost-concentration-item">
                    <span className="cost-concentration-name">{row.name}</span>
                    <span className="cost-concentration-value">{formatCurrency(row.value)} ({pct.toFixed(1)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      )}

      <section id="cost-insights" className="cost-golden-section">
        <div className="cost-golden-header">
          <h2>Cost Insights</h2>
          <p>Insights derived from trend, subscription mix, resource type, resource group, and resource concentration signals.</p>
        </div>
        {executiveInsights.length > 0 ? (
          <div className="cost-golden-grid">
            {executiveInsights.map((insight, idx) => (
              <article key={`${insight.title}-${idx}`} className={`cost-golden-card tone-${insight.tone}`}>
                <h3>{insight.title}</h3>
                <p>{insight.finding}</p>
                <p className="recommendation">{insight.recommendation}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">Not enough cost data yet to generate executive insights.</p>
        )}
      </section>
    </PageLayout>
  );
}
