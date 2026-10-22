/**
 * Inventory.tsx — inventory analytics with filters, charts, tree, and tables.
 */

import { useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { SectionNav } from '../components/shared/SectionNav';
import type { SectionDef } from '../components/shared/SectionNav';
import { SummaryBar } from '../components/shared/SummaryBar';
import { FilterBar } from '../components/shared/FilterBar';
import { TreeView } from '../components/shared/TreeView';
import { DataTable } from '../components/shared/DataTable';
import { ChartCard } from '../components/shared/ChartCard';
import { useModuleData } from '../hooks/useModuleData';
import { useInventoryHierarchy } from '../hooks/useInventoryHierarchy';
import { inventoryApi } from '../api/inventory';
import type { InventoryTreeNode, Resource, InventorySummary, DatabaseOverview, Subscription, ResourceGroup } from '../types';
import { formatCompact } from '../utils/formatters';
import { INVENTORY_PRIMARY, INVENTORY_COLORS, SECURITY_PRIMARY, CHART_GRID, CHART_TICK_FILL, CHART_LABEL_FILL, CHART_TOOLTIP_STYLE, CHART_TOOLTIP_TEXT } from '../utils/chartPalette';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from 'recharts';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';

// Tagging pie chart semantic colors — teal = tagged, red = untagged
const TAG_COLORS = [INVENTORY_COLORS[0], SECURITY_PRIMARY];
const BAR_COLOR = INVENTORY_PRIMARY;

function shortenLabel(value: string, max = 28): string {
  if (!value) return 'Unknown';
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function inventoryTick(value: string) {
  return shortenLabel(String(value ?? ''), 28);
}

function inventoryValueLabel(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}

const invSections: SectionDef[] = [
  { id: 'inv-summary', label: 'Summary' },
  { id: 'inv-charts', label: 'Charts' },
  { id: 'inv-subscriptions', label: 'Subscriptions' },
  { id: 'inv-groups', label: 'Resource Groups' },
  { id: 'inv-resources', label: 'Resources' },
  { id: 'inv-databases', label: 'Databases' },
];

export default function Inventory() {
  const [view, setView] = useState<'tree' | 'table'>('table');
  const [search, setSearch] = useState('');
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [selectedResourceGroup, setSelectedResourceGroup] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [tagFilter, setTagFilter] = useState<'all' | 'tagged' | 'untagged'>('all');
  // database filters
  const [dbGroupFilter, setDbGroupFilter] = useState('');
  const [dbTypeFilter, setDbTypeFilter] = useState('');
  const [dbSubscriptionFilter, setDbSubscriptionFilter] = useState('');
  const [dbStatusFilter, setDbStatusFilter] = useState('');
  const [dbSearch, setDbSearch] = useState('');

  const tree = useModuleData<InventoryTreeNode[]>(() => inventoryApi.tree(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventoryTree,
  });
  const resources = useModuleData<Resource[]>(() => inventoryApi.resources(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventoryResources,
  });
  const summary = useModuleData<InventorySummary>(() => inventoryApi.summary(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventorySummary,
  });
  const databases = useModuleData<DatabaseOverview[]>(() => inventoryApi.databases(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventoryDatabases,
  });
  const subscriptions = useModuleData<Subscription[]>(() => inventoryApi.subscriptions(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions,
  });
  const resourceGroups = useModuleData<ResourceGroup[]>(() => inventoryApi.resourceGroups(), [], {
    cacheKey: MODULE_CACHE_KEYS.inventoryResourceGroups,
  });

  const {
    treeNodes,
    summaryData,
    subscriptionOptions,
    subscriptionTableRows,
    resourceGroupTableRows,
    resourceColumns,
    dbColumns,
    subscriptionColumns,
    resourceGroupColumns,
    resourceGroupOptions,
    dbGroupOptions,
    dbTypeOptions,
    dbSubscriptionOptions,
    dbStatusOptions,
    filteredDatabases,
    databaseChartRows,
    databaseChartMetricLabel,
    typeOptions,
    locationOptions,
    filteredResources,
    topTypes,
    topLocations,
    taggingSplit,
  } = useInventoryHierarchy({
    tree: tree.data,
    resources: resources.data,
    summary: summary.data,
    databases: databases.data,
    subscriptions: subscriptions.data,
    resourceGroups: resourceGroups.data,
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
  });

  return (
    <PageLayout title="Azure Inventory" exportId="inventory-page">
      <SectionNav sections={invSections} />
      {summary.status === 'success' && summaryData && (
        <>
          <SummaryBar id="inv-summary">
            <span>{formatCompact(summaryData.total_resources)} Resources</span>
            <span>{summaryData.total_subscriptions} Subscriptions</span>
            <span>{summaryData.total_resource_groups} Resource Groups</span>
            <span>{summaryData.untagged_percentage.toFixed(1)}% Untagged</span>
          </SummaryBar>
          <p className="inventory-summary-note">Counts derived from Azure Resource Graph; portal numbers may vary due to hidden or system resources.</p>
        </>
      )}

      {summary.status === 'success' && summaryData ? (
        <div id="inv-charts" className="inventory-chart-grid">
          {summaryData.resources_by_resource_group && (
            <ChartCard title="Resources by Group" subtitle="Count per resource group">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={
                  Object.entries(summaryData.resources_by_resource_group!)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 10)
                } layout="vertical" margin={{ top: 8, right: 26, left: 10, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={inventoryTick} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_TEXT}
                    itemStyle={CHART_TOOLTIP_TEXT}
                  />
                  <Bar dataKey="value" fill={BAR_COLOR} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} fontSize={11} formatter={inventoryValueLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          <ChartCard title="Top Resource Types" subtitle="Most prevalent Azure resource types">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topTypes} layout="vertical" margin={{ top: 8, right: 26, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={inventoryTick} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                />
                <Bar dataKey="value" fill={BAR_COLOR} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} fontSize={11} formatter={inventoryValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Resources by Location" subtitle="Geographic distribution">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topLocations} layout="vertical" margin={{ top: 8, right: 26, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} tickFormatter={inventoryTick} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                />
                <Bar dataKey="value" fill={INVENTORY_PRIMARY} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="value" position="right" fill={CHART_LABEL_FILL} fontSize={11} formatter={inventoryValueLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tagging Coverage" subtitle="Tagged vs untagged resources">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={taggingSplit}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={110}
                  innerRadius={60}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {taggingSplit.map((_, idx) => (
                    <Cell key={`tag-${idx}`} fill={TAG_COLORS[idx % TAG_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_TEXT}
                  itemStyle={CHART_TOOLTIP_TEXT}
                  formatter={(value: number | string | undefined, name: string | undefined) => {
                    const total = taggingSplit.reduce((sum, row) => sum + row.value, 0);
                    const amount = Number(value ?? 0);
                    const percent = total > 0 ? (amount / total) * 100 : 0;
                    return [`${amount.toLocaleString()} of ${total.toLocaleString()} (${percent.toFixed(1)}%)`, name ?? 'Resources'];
                  }}
                />
                <Legend formatter={(value) => String(value)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : summary.status === 'error' ? (
        <p className="error-text">Failed to load inventory summary: {summary.error}</p>
      ) : (
        <p className="loading-text">Loading inventory summary…</p>
      )}

      <div id="inv-subscriptions" className="inventory-databases">
        <h3>Subscription overview</h3>
        {subscriptions.status === 'success' ? (
          subscriptionTableRows.length > 0 ? (
            <>
              <p className="inventory-filter-result">
                {subscriptionTableRows.length} subscription(s) discovered across the current inventory snapshot.
              </p>
              <DataTable
                data={subscriptionTableRows}
                columns={subscriptionColumns}
                filterPlaceholder="Search subscription name, state, tenant, or ID..."
                exportFileName="subscription overview"
              />
            </>
          ) : (
            <p className="empty-state">No subscriptions discovered.</p>
          )
        ) : subscriptions.status === 'error' ? (
          <p className="error-text">Failed to load subscriptions: {subscriptions.error}</p>
        ) : (
          <p className="loading-text">Loading subscriptions…</p>
        )}
      </div>

      <div id="inv-groups" className="inventory-databases">
        <h3>Resource group overview</h3>
        {resourceGroups.status === 'success' ? (
          resourceGroupTableRows.length > 0 ? (
            <>
              <p className="inventory-filter-result">
                {resourceGroupTableRows.length} resource group(s) discovered across the current inventory snapshot.
              </p>
              <DataTable
                data={resourceGroupTableRows}
                columns={resourceGroupColumns}
                filterPlaceholder="Search group, subscription, location, or provisioning state..."
                exportFileName="resource group overview"
              />
            </>
          ) : (
            <p className="empty-state">No resource groups discovered.</p>
          )
        ) : resourceGroups.status === 'error' ? (
          <p className="error-text">Failed to load resource groups: {resourceGroups.error}</p>
        ) : (
          <p className="loading-text">Loading resource groups…</p>
        )}
      </div>

      <div id="inv-resources" className="inventory-databases">
        <h3>Resource overview</h3>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search name, type, group, location, subscription..."
          filters={[
            { ariaLabel: 'Subscription filter', value: selectedSubscription, onChange: setSelectedSubscription, allLabel: 'All Subscriptions', options: subscriptionOptions.map((s) => ({ value: s.id, label: s.label })) },
            { ariaLabel: 'Resource group filter', value: selectedResourceGroup, onChange: setSelectedResourceGroup, allLabel: 'All Resource Groups', options: resourceGroupOptions },
            { ariaLabel: 'Resource type filter', value: selectedType, onChange: setSelectedType, allLabel: 'All Types', options: typeOptions },
            { ariaLabel: 'Location filter', value: selectedLocation, onChange: setSelectedLocation, allLabel: 'All Locations', options: locationOptions },
            { ariaLabel: 'Tag state filter', value: tagFilter, onChange: (v) => setTagFilter(v as 'all' | 'tagged' | 'untagged'), allLabel: undefined, options: [{ value: 'all', label: 'All Tag States' }, { value: 'tagged', label: 'Tagged Only' }, { value: 'untagged', label: 'Untagged Only' }] },
          ]}
        />

        <div className="view-toggle">
          <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Table</button>
          <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>Tree</button>
        </div>

        {view === 'tree' ? (
          tree.status === 'success' && tree.data ? (
            <TreeView nodes={treeNodes} />
          ) : tree.status === 'error' ? (
            <p className="error-text">Failed to load tree: {tree.error}</p>
          ) : (
            <p className="loading-text">Loading tree…</p>
          )
        ) : resources.status === 'success' ? (
          <div className="inventory-table-container">
            <p className="inventory-filter-result">{filteredResources.length} resource(s) match current filters.</p>
            <DataTable data={filteredResources} columns={resourceColumns} exportFileName="resource overview" />
          </div>
        ) : resources.status === 'error' ? (
          <p className="error-text">Failed to load resources: {resources.error}</p>
        ) : (
          <p className="loading-text">Loading resources…</p>
        )}
      </div>

      <div id="inv-databases" className="inventory-databases">
        <h3>Database and data warehouse overview</h3>
        <FilterBar
          search={dbSearch}
          onSearchChange={setDbSearch}
          searchAriaLabel="Database search"
          searchPlaceholder="Search database name, status, SKU, subscription..."
          filters={[
            { ariaLabel: 'Database subscription filter', value: dbSubscriptionFilter, onChange: setDbSubscriptionFilter, allLabel: 'All Subscriptions', options: dbSubscriptionOptions.map((o) => ({ value: o.id, label: o.label })) },
            { ariaLabel: 'Database resource group filter', value: dbGroupFilter, onChange: setDbGroupFilter, allLabel: 'All Groups', options: dbGroupOptions },
            { ariaLabel: 'Database type filter', value: dbTypeFilter, onChange: setDbTypeFilter, allLabel: 'All Types', options: dbTypeOptions },
            { ariaLabel: 'Database status filter', value: dbStatusFilter, onChange: setDbStatusFilter, allLabel: 'All Statuses', options: dbStatusOptions },
          ]}
        />
        {databases.status === 'success' && <p className="inventory-filter-result">{filteredDatabases.length} database resource(s) match current filters.</p>}
        {databases.status === 'success' && databases.data ? (
          databases.data.length > 0 ? (
            <>
              {databaseChartRows.length > 0 ? (
                <ChartCard title="Top databases by size" subtitle={`Largest database resources by ${databaseChartMetricLabel.toLowerCase()}`}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={databaseChartRows} layout="vertical" margin={{ top: 6, right: 26, left: 10, bottom: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={0} hide />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={CHART_TOOLTIP_TEXT}
                        itemStyle={CHART_TOOLTIP_TEXT}
                        formatter={(value: number | string | undefined) => [`${Number(value ?? 0).toLocaleString()} GB`, databaseChartMetricLabel]}
                        labelFormatter={(label, payload) => {
                          const source = String(payload?.[0]?.payload?.source ?? '');
                          return source ? `${String(label)} (${source})` : String(label);
                        }}
                      />
                      <Bar dataKey="value" fill={BAR_COLOR} radius={[0, 4, 4, 0]}>
                        <LabelList
                          dataKey="name"
                          position="insideLeft"
                          offset={10}
                          fill={CHART_LABEL_FILL}
                          fontSize={11}
                          formatter={(value: unknown) => String(value ?? '')}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : (
                <p className="empty-state">No database size data returned for the selected filters.</p>
              )}
              <DataTable
                data={filteredDatabases}
                columns={dbColumns}
                filterPlaceholder="Search database table..."
                exportFileName="database and data warehouse overview"
              />
            </>
          ) : (
            <p className="empty-state">No databases discovered.</p>
          )
        ) : databases.status === 'error' ? (
          <p className="error-text">Failed to load databases: {databases.error}</p>
        ) : (
          <p className="loading-text">Loading databases…</p>
        )}
      </div>
    </PageLayout>
  );
}
