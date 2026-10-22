import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Upload } from 'lucide-react';
import { applicationDiscoveryApi } from '../api/applicationDiscovery';
import { costsApi } from '../api/costs';
import { inventoryApi } from '../api/inventory';
import { PageLayout } from '../components/layout/PageLayout';
import { ChartCard } from '../components/shared/ChartCard';
import { DataTable } from '../components/shared/DataTable';
import { FilterBar } from '../components/shared/FilterBar';
import { SidePanel } from '../components/shared/SidePanel';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { useModuleData } from '../hooks/useModuleData';
import { useProfile } from '../hooks/useProfile';
import type {
  ApplicationDiscoveryAnnotation,
  ApplicationDiscoveryAnnotationCreate,
  Resource,
  Subscription,
} from '../types';
import {
  buildResourceGroupApplicationProfile,
  summarizeComponentTypes,
  type ResourceGroupApplicationProfile,
} from '../utils/applicationDiscovery';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { isRequestCancellationError } from '../utils/requestErrors';

interface DiscoveryGroup {
  resourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
  resources: Resource[];
}

interface DiscoveryDisplayRow {
  group: DiscoveryGroup;
  profile: ResourceGroupApplicationProfile;
  annotation: ApplicationDiscoveryAnnotation | null;
  avgMonthly: number;
  spendSharePct: number;
}

interface DiscoveryTableRow {
  resourceGroup: string;
  subscription: string;
  subscriptionId: string;
  archetype: string;
  confidence: number;
  resourceCount: number;
  spendShare: string;
  purpose: string;
  businessDescription: string;
  owningDepartment: string;
  avgMonthly: number;
  avgMonthlyDisplay: string;
  row: DiscoveryDisplayRow;
}

interface AnnotationCsvRow extends ApplicationDiscoveryAnnotationCreate {
  subscription_name?: string;
}

interface CostLookupRow {
  group_key?: string;
  resource_group?: string;
  subscription_id?: string;
  cost_3m?: number | string;
  cost3m?: number | string;
  monthly_avg_3m?: number | string;
  monthly_avg?: number | string;
  resource_id?: string;
}

function groupKey(subscriptionId: string, resourceGroup: string): string {
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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }
  return rows;
}

export default function ApplicationsDiscovery() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const [selectedSubscription, setSelectedSubscription] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [annotations, setAnnotations] = useState<ApplicationDiscoveryAnnotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationError, setAnnotationError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DiscoveryDisplayRow | null>(null);
  const [businessDescription, setBusinessDescription] = useState('');
  const [owningDepartment, setOwningDepartment] = useState('');
  const [saving, setSaving] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const annotationsLoadRequestSeqRef = useRef(0);
  const annotationsSaveRequestSeqRef = useRef(0);
  const annotationsImportRequestSeqRef = useRef(0);
  const annotationsProfileEpochRef = useRef(0);

  useEffect(() => {
    annotationsProfileEpochRef.current += 1;
    annotationsLoadRequestSeqRef.current += 1;
    annotationsSaveRequestSeqRef.current += 1;
    annotationsImportRequestSeqRef.current += 1;
    setSelectedSubscription('');
    setSearch('');
    setViewMode('cards');
    setAnnotations([]);
    setAnnotationsLoading(false);
    setAnnotationError(null);
    setPanelOpen(false);
    setEditingRow(null);
    setBusinessDescription('');
    setOwningDepartment('');
    setSaving(false);
    setImportMessage(null);
    setImporting(false);
  }, [profileId]);

  const resources = useModuleData<Resource[]>(
    () => inventoryApi.resources(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.inventoryResources },
  );
  const subscriptions = useModuleData<Subscription[]>(
    () => inventoryApi.subscriptions(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions },
  );
  const byGroupCosts = useModuleData(
    () => costsApi.byResourceGroup(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.costByResourceGroup },
  );
  const byResourceCosts = useModuleData(
    () => costsApi.byResource(),
    [],
    { cacheKey: MODULE_CACHE_KEYS.costByResource },
  );

  const loadAnnotations = useCallback(async () => {
    if (!profileId) {
      setAnnotations([]);
      return;
    }
    const requestSeq = ++annotationsLoadRequestSeqRef.current;
    setAnnotationsLoading(true);
    setAnnotationError(null);
    try {
      const rows = await applicationDiscoveryApi.listAnnotations(profileId);
      if (annotationsLoadRequestSeqRef.current === requestSeq) {
        setAnnotations(rows);
      }
    } catch (err) {
      if (isRequestCancellationError(err)) return;
      if (annotationsLoadRequestSeqRef.current === requestSeq) {
        setAnnotationError(err instanceof Error ? err.message : 'Failed to load application annotations.');
      }
    } finally {
      if (annotationsLoadRequestSeqRef.current === requestSeq) {
        setAnnotationsLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations]);

  const subscriptionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sub of subscriptions.data ?? []) {
      map.set(sub.subscription_id, sub.display_name ?? sub.subscription_id);
    }
    for (const resource of resources.data ?? []) {
      if (!map.has(resource.subscription_id) && resource.subscription_name) {
        map.set(resource.subscription_id, resource.subscription_name);
      }
    }
    return map;
  }, [resources.data, subscriptions.data]);

  const grouped = useMemo<DiscoveryGroup[]>(() => {
    const map = new Map<string, DiscoveryGroup>();
    for (const resource of resources.data ?? []) {
      const rg = (resource.resource_group ?? '').trim();
      const subscriptionId = (resource.subscription_id ?? '').trim();
      if (!rg || !subscriptionId) continue;
      const key = groupKey(subscriptionId, rg);
      const existing = map.get(key);
      if (existing) {
        existing.resources.push(resource);
        continue;
      }
      map.set(key, {
        resourceGroup: rg,
        subscriptionId,
        subscriptionName: subscriptionNameById.get(subscriptionId) ?? resource.subscription_name ?? subscriptionId,
        resources: [resource],
      });
    }
    return [...map.values()].sort((a, b) => {
      if (b.resources.length !== a.resources.length) return b.resources.length - a.resources.length;
      return a.resourceGroup.localeCompare(b.resourceGroup);
    });
  }, [resources.data, subscriptionNameById]);

  const profiles = useMemo<ResourceGroupApplicationProfile[]>(
    () => grouped.map((group) => buildResourceGroupApplicationProfile(group.resourceGroup, group.subscriptionId, group.resources)),
    [grouped],
  );

  const profileByGroupKey = useMemo(() => {
    const map = new Map<string, ResourceGroupApplicationProfile>();
    for (const profile of profiles) {
      map.set(groupKey(profile.subscriptionId, profile.resourceGroup), profile);
    }
    return map;
  }, [profiles]);

  const annotationByGroupKey = useMemo(() => {
    const map = new Map<string, ApplicationDiscoveryAnnotation>();
    for (const annotation of annotations) {
      map.set(groupKey(annotation.subscription_id, annotation.resource_group), annotation);
    }
    return map;
  }, [annotations]);

  const costByGroupMap = useMemo(() => {
    const map = new Map<string, CostLookupRow>();
    for (const row of byGroupCosts.data ?? []) {
      const rg = normalizeResourceGroupName(String(row.group_key || row.resource_group || ''));
      const sub = String(row.subscription_id || '');
      if (!rg || !sub) continue;
      map.set(groupKey(sub, rg), row);
    }
    return map;
  }, [byGroupCosts.data]);

  const resourceCostMap = useMemo(() => {
    const map = new Map<string, CostLookupRow>();
    for (const row of byResourceCosts.data ?? []) {
      if (!row || !row.resource_id) continue;
      map.set(String(row.resource_id), row);
    }
    return map;
  }, [byResourceCosts.data]);

  const baseRows = useMemo(() => {
    return grouped
      .map((group) => {
        const profile = profileByGroupKey.get(groupKey(group.subscriptionId, group.resourceGroup));
        if (!profile) return null;
        const annotation = annotationByGroupKey.get(groupKey(group.subscriptionId, group.resourceGroup)) ?? null;
        const costRow = costByGroupMap.get(groupKey(group.subscriptionId, group.resourceGroup));
        const avgMonthly = costRow ? Math.round(Number(costRow.cost_3m ?? costRow.cost3m ?? 0) / 3) : 0;
        return { group, profile, annotation, avgMonthly };
      })
      .filter((row): row is Omit<DiscoveryDisplayRow, 'spendSharePct'> => !!row);
  }, [annotationByGroupKey, costByGroupMap, grouped, profileByGroupKey]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = baseRows.filter((row) => {
      if (selectedSubscription && row.group.subscriptionId !== selectedSubscription) return false;
      if (!needle) return true;
      const composite = [
        row.group.resourceGroup,
        row.group.subscriptionName,
        row.group.subscriptionId,
        row.profile.applicationName,
        row.profile.archetype,
        row.profile.purposeSummary,
        row.annotation?.business_description ?? '',
        row.annotation?.owning_department ?? '',
      ].join(' ').toLowerCase();
      return composite.includes(needle);
    });

    const totalAvgMonthly = rows.reduce((sum, row) => sum + row.avgMonthly, 0);
    return rows.map((row) => ({
      ...row,
      spendSharePct: totalAvgMonthly > 0 ? (row.avgMonthly / totalAvgMonthly) * 100 : 0,
    }));
  }, [baseRows, search, selectedSubscription]);

  const displayRows = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      if (b.avgMonthly !== a.avgMonthly) return b.avgMonthly - a.avgMonthly;
      if (b.group.resources.length !== a.group.resources.length) return b.group.resources.length - a.group.resources.length;
      return a.group.resourceGroup.localeCompare(b.group.resourceGroup);
    });
    return rows;
  }, [filtered]);

  const archetypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of filtered) {
      counts.set(row.profile.archetype, (counts.get(row.profile.archetype) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [filtered]);

  const highConfidenceCount = useMemo(
    () => filtered.filter((row) => row.profile.confidence >= 75).length,
    [filtered],
  );

  const subscriptionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const group of grouped) options.set(group.subscriptionId, group.subscriptionName);
    return [...options.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [grouped]);

  const totalResources = useMemo(() => (resources.data ?? []).length, [resources.data]);

  const openEditor = useCallback((row: DiscoveryDisplayRow) => {
    setEditingRow(row);
    setBusinessDescription(row.annotation?.business_description ?? '');
    setOwningDepartment(row.annotation?.owning_department ?? '');
    setPanelOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setPanelOpen(false);
    setEditingRow(null);
    setBusinessDescription('');
    setOwningDepartment('');
  }, []);

  const handleSaveAnnotation = useCallback(async () => {
    if (!profileId || !editingRow) return;
    const requestSeq = ++annotationsSaveRequestSeqRef.current;
    const profileEpoch = annotationsProfileEpochRef.current;
    setSaving(true);
    setImportMessage(null);
    try {
      const saved = await applicationDiscoveryApi.upsertAnnotation(profileId, {
        subscription_id: editingRow.group.subscriptionId,
        resource_group: editingRow.group.resourceGroup,
        business_description: businessDescription.trim() || undefined,
        owning_department: owningDepartment.trim() || undefined,
      });
      if (annotationsSaveRequestSeqRef.current !== requestSeq || annotationsProfileEpochRef.current !== profileEpoch) return;
      setAnnotations((prev) => {
        const key = groupKey(saved.subscription_id, saved.resource_group);
        const next = prev.filter((item) => groupKey(item.subscription_id, item.resource_group) !== key);
        next.push(saved);
        return next;
      });
      closeEditor();
    } catch (err) {
      if (annotationsSaveRequestSeqRef.current === requestSeq && annotationsProfileEpochRef.current === profileEpoch) {
        setImportMessage(err instanceof Error ? err.message : 'Failed to save discovery annotation.');
      }
    } finally {
      if (annotationsSaveRequestSeqRef.current === requestSeq && annotationsProfileEpochRef.current === profileEpoch) {
        setSaving(false);
      }
    }
  }, [businessDescription, closeEditor, editingRow, owningDepartment, profileId]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!profileId) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportMessage(null);
    const requestSeq = ++annotationsImportRequestSeqRef.current;
    const profileEpoch = annotationsProfileEpochRef.current;
    const isCurrentImportRequest = () =>
      annotationsImportRequestSeqRef.current === requestSeq &&
      annotationsProfileEpochRef.current === profileEpoch;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        if (!isCurrentImportRequest()) return;
        setImportMessage('CSV file did not contain any data rows.');
        return;
      }
      const headers = rows[0].map((header) => header.trim());
      const indexOf = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
      const subscriptionIdIdx = indexOf('Subscription ID');
      const resourceGroupIdx = indexOf('Resource Group');
      const subscriptionNameIdx = indexOf('Subscription');
      const businessDescriptionIdx = indexOf('Business Description');
      const owningDepartmentIdx = indexOf('Owning Department');

      if (subscriptionIdIdx < 0 || resourceGroupIdx < 0 || businessDescriptionIdx < 0 || owningDepartmentIdx < 0) {
        if (!isCurrentImportRequest()) return;
        setImportMessage('CSV must include Subscription ID, Resource Group, Business Description, and Owning Department columns.');
        return;
      }

      const payload: AnnotationCsvRow[] = rows.slice(1).map((cells) => ({
        subscription_id: (cells[subscriptionIdIdx] ?? '').trim(),
        subscription_name: subscriptionNameIdx >= 0 ? (cells[subscriptionNameIdx] ?? '').trim() : undefined,
        resource_group: (cells[resourceGroupIdx] ?? '').trim(),
        business_description: (cells[businessDescriptionIdx] ?? '').trim() || undefined,
        owning_department: (cells[owningDepartmentIdx] ?? '').trim() || undefined,
      }));

      const saved = await applicationDiscoveryApi.importAnnotations(profileId, payload);
      if (!isCurrentImportRequest()) return;
      if (saved.length === 0) {
        setImportMessage('No filled annotation rows were found to import.');
        return;
      }
      setAnnotations((prev) => {
        const next = [...prev];
        for (const item of saved) {
          const key = groupKey(item.subscription_id, item.resource_group);
          const existingIndex = next.findIndex((candidate) => groupKey(candidate.subscription_id, candidate.resource_group) === key);
          if (existingIndex >= 0) next.splice(existingIndex, 1, item);
          else next.push(item);
        }
        return next;
      });
      setImportMessage(`Imported ${saved.length} application annotation row(s).`);
    } catch (err) {
      if (isCurrentImportRequest()) {
        setImportMessage(err instanceof Error ? err.message : 'Failed to import CSV.');
      }
    } finally {
      if (isCurrentImportRequest()) {
        setImporting(false);
      }
    }
  }, [profileId]);

  const tableCol = createColumnHelper<DiscoveryTableRow>();
  const tableColumns = useMemo(
    () => [
      tableCol.accessor('resourceGroup', { header: 'Resource Group' }),
      tableCol.accessor('subscription', { header: 'Subscription' }),
      tableCol.accessor('subscriptionId', { header: 'Subscription ID' }),
      tableCol.accessor('archetype', { header: 'Archetype' }),
      tableCol.accessor('confidence', {
        header: 'Confidence',
        cell: (info) => `${info.getValue()}%`,
      }),
      tableCol.accessor('resourceCount', { header: 'Resources' }),
      tableCol.accessor('spendShare', { header: 'Spend Share' }),
      tableCol.accessor('purpose', { header: 'Purpose' }),
      tableCol.accessor('businessDescription', { header: 'Business Description' }),
      tableCol.accessor('owningDepartment', { header: 'Owning Department' }),
      tableCol.accessor('avgMonthlyDisplay', { header: 'Avg Monthly' }),
      tableCol.display({
        id: 'actions',
        header: '',
        meta: { exportable: false },
        cell: ({ row }) => (
          <span className="row-actions">
            <button
              type="button"
              className="btn-icon"
              title="Edit business context"
              onClick={() => openEditor(row.original.row)}
            >
              <Pencil size={15} />
            </button>
          </span>
        ),
      }),
    ],
    [openEditor, tableCol],
  );

  const tableData = useMemo<DiscoveryTableRow[]>(
    () =>
      displayRows.map((row) => ({
        resourceGroup: row.group.resourceGroup,
        subscription: row.group.subscriptionName,
        subscriptionId: row.group.subscriptionId,
        archetype: row.profile.archetype,
        confidence: row.profile.confidence,
        resourceCount: row.profile.resourceCount,
        spendShare: row.avgMonthly > 0 ? formatPercent(row.spendSharePct, 1) : '—',
        purpose: row.profile.purposeSummary,
        businessDescription: row.annotation?.business_description ?? '',
        owningDepartment: row.annotation?.owning_department ?? '',
        avgMonthly: row.avgMonthly,
        avgMonthlyDisplay: row.avgMonthly ? formatCurrency(row.avgMonthly) : '—',
        row,
      })),
    [displayRows],
  );

  return (
    <PageLayout
      title="Applications Discovery"
      subtitle="Surface likely application boundaries, workload purpose, and supporting component relationships across the environment."
      exportId="applications-discovery-page"
    >
      <div className="appdisc-summary">
        <span>{grouped.length} resource groups analyzed</span>
        <span>{filtered.length} in current filter</span>
        <span>{highConfidenceCount} high-confidence mappings</span>
        <span>{annotations.length} annotation overlays saved</span>
      </div>

      <FilterBar
        className="appdisc-filters"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search resource group, application, archetype..."
        filters={[
          {
            ariaLabel: 'Subscription filter',
            value: selectedSubscription,
            onChange: setSelectedSubscription,
            allLabel: 'All Subscriptions',
            options: subscriptionOptions.map((s) => ({ value: s.id, label: s.label })),
          },
        ]}
      />

      <div className="profiles-toolbar appdisc-toolbar">
        <div className="view-toggle">
          <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')}>Cards</button>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button>
        </div>
        <div className="appdisc-toolbar-actions">
          <button type="button" className="btn" onClick={handleImportClick} disabled={!profileId || importing}>
            <Upload size={15} /> {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(event) => void handleImportFile(event)}
          />
        </div>
      </div>

      {importMessage ? <p className="pull-status-message">{importMessage}</p> : null}
      {annotationError ? <p className="error-text">{annotationError}</p> : null}
      {annotationsLoading ? <p className="loading-text">Loading saved application annotations…</p> : null}

      {resources.status === 'loading' || subscriptions.status === 'loading' ? (
        <p className="loading-text">Loading application discovery inputs…</p>
      ) : null}
      {resources.status === 'error' ? <p className="error-text">Failed to load resources: {resources.error}</p> : null}
      {subscriptions.status === 'error' ? <p className="error-text">Failed to load subscriptions: {subscriptions.error}</p> : null}

      {filtered.length > 0 && (
        <div className="appdisc-top-grid">
          <ChartCard title="Top inferred application patterns" subtitle="Most frequent workload archetypes in current scope">
            <ul className="appdisc-list">
              {archetypeCounts.map(([archetype, count]) => (
                <li key={archetype}>
                  <span>{archetype}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      )}

      {filtered.length === 0 && resources.status === 'success' ? (
        <p className="empty-state">No resource groups match current filters.</p>
      ) : null}

      {viewMode === 'table' ? (
        <DataTable data={tableData} columns={tableColumns} exportFileName="applications-discovery" />
      ) : (
        <div className="appdisc-grid">
          {displayRows.map((row) => {
            const { group, profile, annotation, avgMonthly, spendSharePct } = row;
            const topTypes = summarizeComponentTypes(group.resources);
            return (
              <article key={groupKey(group.subscriptionId, group.resourceGroup)} className="appdisc-card">
                <div className="appdisc-card-head">
                  <div>
                    <h3>{group.resourceGroup}</h3>
                    <p>{group.subscriptionName} · {group.subscriptionId}</p>
                  </div>
                  <div className="appdisc-badges-grid">
                    <div className="appdisc-badges-row">
                      <span className="appdisc-badge">{profile.resourceCount} resources</span>
                      <span className="appdisc-badge"><strong>Share:</strong> {totalResources > 0 ? `${Math.round((profile.resourceCount / totalResources) * 100)}%` : '—'}</span>
                    </div>
                    <div className="appdisc-badges-row">
                      <span className="appdisc-badge appdisc-badge-confidence">{profile.confidence}% confidence</span>
                      <span className="appdisc-badge"><strong>Avg/mo:</strong> {avgMonthly ? formatCurrency(avgMonthly) : '—'}</span>
                    </div>
                    <div className="appdisc-badges-row">
                      <span className="appdisc-badge"><strong>Spend share:</strong> {avgMonthly ? formatPercent(spendSharePct, 1) : '—'}</span>
                    </div>
                  </div>
                </div>

                {(annotation?.business_description || annotation?.owning_department) && (
                  <div className="appdisc-section">
                    <h4>Customer context</h4>
                    <div className="appdisc-annotation-grid">
                      {annotation.business_description ? (
                        <p><strong>Business description:</strong> {annotation.business_description}</p>
                      ) : null}
                      {annotation.owning_department ? (
                        <p><strong>Owning department:</strong> {annotation.owning_department}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                <div className="appdisc-section">
                  <h4>Application intent</h4>
                  {/unclassified|unknown/i.test(profile.archetype) ? (
                    <p>
                      <strong>{profile.archetype}.</strong>{' '}
                      Top resource types: {summarizeComponentTypes(group.resources).slice(0, 3).join(', ')}. Examples:{' '}
                      {group.resources.slice(0, 3).map((r) => `${r.name} (${r.type.split('/').pop()})`).join(', ')}.
                    </p>
                  ) : (
                    <p>
                      <strong>{profile.archetype}.</strong> {profile.purposeSummary}
                    </p>
                  )}
                </div>

                <div className="appdisc-section">
                  <h4>Likely component relationships</h4>
                  <ul className="appdisc-bullet-list">
                    {profile.inferredFlows.map((flow) => (
                      <li key={flow}>{flow}</li>
                    ))}
                  </ul>
                </div>

                <div className="appdisc-section">
                  <h4>Component map</h4>
                  <div className="appdisc-table-wrap">
                    <table className="appdisc-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Count</th>
                          <th>Example names</th>
                          <th style={{ textAlign: 'right' }}>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.componentMap.map((component) => {
                          function findCostForResource(resource: Resource) {
                            const candidates = [
                              resource.id,
                              resource.name,
                              resource.id.toLowerCase(),
                              resource.name.toLowerCase(),
                            ];
                            for (const key of candidates) {
                              const byId = resourceCostMap.get(key);
                              if (byId) return byId;
                              const last = String(key).split('/').pop();
                              if (last) {
                                for (const [candidateKey, value] of resourceCostMap.entries()) {
                                  if (String(candidateKey).toLowerCase().endsWith(last.toLowerCase())) return value;
                                }
                              }
                            }
                            return null;
                          }

                          const componentMonthly = component.resources.reduce((sum, resource) => {
                            const cost = findCostForResource(resource);
                            const monthly = Number(
                              cost?.monthly_avg_3m ?? cost?.monthly_avg ?? (cost?.cost_3m ? Number(cost.cost_3m) / 3 : 0),
                            );
                            return sum + (Number.isFinite(monthly) ? monthly : 0);
                          }, 0);
                          const pct = avgMonthly > 0 ? (componentMonthly / avgMonthly) * 100 : 0;
                          return (
                            <tr key={component.id}>
                              <td>{component.label}</td>
                              <td>{component.resources.length}</td>
                              <td>{component.resources.slice(0, 3).map((resource) => resource.name).join(', ') || '-'}</td>
                              <td style={{ textAlign: 'right' }}>{formatPercent(pct, 1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="appdisc-section">
                  <h4>Top resource types</h4>
                  <p>{topTypes.join(' | ')}</p>
                </div>

                <div className="appdisc-section">
                  <h4>Recommended validation actions</h4>
                  <ul className="appdisc-bullet-list">
                    {profile.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SidePanel open={panelOpen} title="Edit application context" onClose={closeEditor}>
        <div className="crud-form-grid">
          <label>
            Subscription
            <input value={editingRow ? `${editingRow.group.subscriptionName} (${editingRow.group.subscriptionId})` : ''} disabled />
          </label>
          <label>
            Resource Group
            <input value={editingRow?.group.resourceGroup ?? ''} disabled />
          </label>
          <label className="span-full">
            Business Description
            <textarea
              rows={4}
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value)}
              placeholder="Describe what this application/workload is for."
            />
          </label>
          <label className="span-full">
            Owning Department
            <input
              value={owningDepartment}
              onChange={(event) => setOwningDepartment(event.target.value)}
              placeholder="e.g. Marketing, Operations, Finance"
            />
          </label>
        </div>
        <div className="crud-form-actions">
          <button type="button" className="btn btn-primary" onClick={() => void handleSaveAnnotation()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn" onClick={closeEditor}>Cancel</button>
        </div>
      </SidePanel>
    </PageLayout>
  );
}
