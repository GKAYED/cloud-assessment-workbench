/**
 * Initiatives.tsx — strategic initiative tracker with prioritisation and roadmap.
 * Full CRUD: add, edit, delete initiatives. Includes timeline view.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { DataTable } from '../components/shared/DataTable';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SidePanel } from '../components/shared/SidePanel';
import { RAGStatus } from '../components/shared/RAGStatus';
import { FilterBar } from '../components/shared/FilterBar';
import { useProfile } from '../hooks/useProfile';
import { initiativesApi } from '../api/initiatives';
import { portfolioApi } from '../api/portfolio';
import type { Initiative, InitiativeCreate, AppPortfolioEntry } from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { downloadWorkbook } from '../utils/excel';
import { InitiativesRoadmap } from '../components/InitiativesRoadmap';
import { isRequestCancellationError } from '../utils/requestErrors';

/* ── constants ─────────────────────────────────────────────────────── */

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const STATUS_OPTIONS = ['Proposed', 'Approved', 'Planning', 'In Progress', 'On Hold', 'Completed'];
const CATEGORY_OPTIONS = ['Security', 'Cost Optimization', 'Migration', 'Modernization', 'Governance', 'Compliance', 'Integration', 'Operating Model', 'Capability Uplift', 'Platform Management', 'Deprecation', 'Other'];
const VALIDATION_OPTIONS = ['Draft', 'Customer Review', 'Confirmed', 'Rejected'];
const CONFIDENCE_OPTIONS = ['Low', 'Medium', 'High'];
const AZURE_APP_OPTION: AppPortfolioEntry = {
  id: -1,
  profile_id: -1,
  app_name: 'Azure',
  created_at: '',
  updated_at: '',
};

const PRIORITY_WEIGHTS: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const emptyForm: InitiativeCreate = {
  name: '',
  description: '',
  status: 'Proposed',
  priority: 'Medium',
  complexity: undefined,
  strategic_fit: undefined,
  lane: '',
  planned_start_quarter: '',
  planned_end_quarter: '',
  target_quarter: '',
  category: 'Other',
  estimated_effort_weeks: undefined,
  estimated_cost_saving: undefined,
  business_owner: '',
  technical_owner: '',
  validation_status: 'Draft',
  evidence_confidence: 'Medium',
  parent_initiative_id: undefined,
  dependency_ids: [],
  linked_app_ids: [],
  deprecation_aligned: false,
};

/* ── column defs ───────────────────────────────────────────────────── */

const col = createColumnHelper<Initiative>();

function buildColumns(
  items: Initiative[],
  onEdit: (entry: Initiative) => void,
  onDelete: (id: number) => void,
) {
  const itemMap = new Map(items.map((item) => [item.id, item.name]));
  return [
    col.accessor('name', { header: 'Initiative' }),
    col.accessor((row) => row.description ?? '', {
      id: 'overview',
      header: 'Overview',
      cell: (info) => {
        const text = info.getValue();
        if (!text) return '—';
        return text.length > 140 ? `${text.slice(0, 140)}…` : text;
      },
    }),
    col.accessor('category', { header: 'Category' }),
    col.accessor((row) => row.lane ?? '—', { id: 'lane', header: 'Lane' }),
    col.accessor('priority', { header: 'Priority' }),
    col.accessor('status', { header: 'Status' }),
    col.accessor((row) => row.validation_status ?? '—', { id: 'validation_status', header: 'Validation' }),
    col.accessor((row) => row.business_owner ?? row.technical_owner ?? '—', {
      id: 'owner',
      header: 'Owner',
    }),
    col.accessor((row) => row.planned_start_quarter ?? '—', {
      id: 'planned_start_quarter',
      header: 'Start',
    }),
    col.accessor((row) => row.planned_end_quarter ?? '—', {
      id: 'planned_end_quarter',
      header: 'End',
    }),
    col.accessor((row) => row.target_quarter ?? '—', {
      id: 'target_quarter',
      header: 'Target',
    }),
    col.accessor((row) => row.evidence_confidence ?? '—', {
      id: 'evidence_confidence',
      header: 'Confidence',
    }),
    col.accessor((row) => row.parent_initiative_id ? itemMap.get(row.parent_initiative_id) ?? `#${row.parent_initiative_id}` : '—', {
      id: 'workstream',
      header: 'Parent / Workstream',
    }),
    col.accessor((row) => row.estimated_effort_weeks ?? 0, {
      id: 'effort',
      header: 'Effort (wk)',
      cell: (info) => info.getValue() || '—',
    }),
    col.accessor((row) => row.estimated_cost_saving ?? 0, {
      id: 'savings',
      header: 'Savings',
      cell: (info) => info.getValue() ? `$${info.getValue()?.toLocaleString()}` : '—',
    }),
    col.accessor('prioritization_score', {
      header: 'Score',
      cell: (info) => info.getValue()?.toFixed(1) ?? '—',
    }),
    col.accessor('deprecation_aligned', {
      header: 'Depr. Aligned',
      cell: (info) => {
        const v = info.getValue();
        if (v === undefined || v === null) return '—';
        return <RAGStatus status={v ? 'green' : 'amber'} label={v ? 'Yes' : 'No'} />;
      },
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <span className="row-actions">
          <button className="btn-icon" title="Edit" aria-label="Edit" onClick={() => onEdit(row.original)}>
            <Pencil size={15} />
          </button>
          <button className="btn-icon btn-icon-danger" title="Delete" aria-label="Delete" onClick={() => onDelete(row.original.id)}>
            <Trash2 size={15} />
          </button>
        </span>
      ),
    }),
  ];
}

/* ── main component ────────────────────────────────────────────────── */

export default function Initiatives() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  const [items, setItems] = useState<Initiative[]>([]);
  const [apps, setApps] = useState<AppPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<InitiativeCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'roadmap'>('table');
  const [viewingItem, setViewingItem] = useState<Initiative | null>(null);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [validationFilter, setValidationFilter] = useState('');
  const [deprecationFilter, setDeprecationFilter] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Initiative[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const profileEpochRef = useRef(0);
  const deleteSeqRef = useRef(0);

  useEffect(() => {
    requestSeqRef.current += 1;
    saveSeqRef.current += 1;
    profileEpochRef.current += 1;
    deleteSeqRef.current += 1;
    setItems([]);
    setApps([]);
    setEditingId(null);
    setShowForm(false);
    setForm({ ...emptyForm });
    setViewingItem(null);
    setSearch('');
    setPriorityFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setValidationFilter('');
    setDeprecationFilter('');
    setViewMode('table');
    setOperationError('');
    setDeleteId(null);
    setSelectedItems([]);
    setShowBulkDelete(false);
    setLoading(false);
    setSaving(false);
  }, [profileId]);

  /* ── load data ───────────────────────────────────────────────────── */

  const loadItems = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const [data, appData] = await Promise.all([
        initiativesApi.list(profileId),
        portfolioApi.list(profileId),
      ]);
      if (requestSeqRef.current === requestSeq) {
        setItems(data);
        setApps(appData);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load initiatives', err);
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  /* ── form helpers ────────────────────────────────────────────────── */

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (entry: Initiative) => {
    setForm({
      name: entry.name,
      description: entry.description ?? '',
      status: entry.status ?? 'Proposed',
      priority: entry.priority ?? 'Medium',
      complexity: entry.complexity ?? undefined,
      strategic_fit: entry.strategic_fit ?? undefined,
      planned_start_quarter: entry.planned_start_quarter ?? '',
      planned_end_quarter: entry.planned_end_quarter ?? '',
      target_quarter: entry.target_quarter ?? '',
      category: entry.category ?? 'Other',
      estimated_effort_weeks: entry.estimated_effort_weeks ?? undefined,
      estimated_cost_saving: entry.estimated_cost_saving ?? undefined,
      business_owner: entry.business_owner ?? '',
      technical_owner: entry.technical_owner ?? '',
      validation_status: entry.validation_status ?? 'Draft',
      lane: entry.lane ?? '',
      evidence_confidence: entry.evidence_confidence ?? 'Medium',
      parent_initiative_id: entry.parent_initiative_id ?? undefined,
      dependency_ids: entry.dependency_ids ?? [],
      linked_app_ids: entry.linked_app_ids ?? [],
      deprecation_aligned: entry.deprecation_aligned ?? false,
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      await initiativesApi.delete(deleteId);
      if (deleteSeqRef.current !== deleteSeq) return;
      setDeleteId(null);
      if (requestSeqRef.current === requestSeq) {
        await loadItems();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to delete initiative', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete initiative.');
      }
    }
  };

  const confirmBulkDelete = async () => {
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      for (const item of selectedItems) {
        await initiativesApi.delete(item.id);
        if (deleteSeqRef.current !== deleteSeq) return;
      }
      if (deleteSeqRef.current !== deleteSeq) return;
      setShowBulkDelete(false);
      setSelectedItems([]);
      if (requestSeqRef.current === requestSeq) {
        await loadItems();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to bulk delete initiatives', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete selected initiatives.');
      }
    }
  };

  const handleSave = async () => {
    if (!profileId || !form.name.trim()) return;
    const profileEpoch = profileEpochRef.current;
    const saveSeq = ++saveSeqRef.current;
    setOperationError('');
    setSaving(true);
    try {
      if (editingId) {
        await initiativesApi.update(editingId, form);
      } else {
        await initiativesApi.create(profileId, form);
      }
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadItems();
    } catch (err) {
      if (!isRequestCancellationError(err) && saveSeqRef.current === saveSeq) {
        console.error('Failed to save initiative', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to save initiative.');
      }
    } finally {
      if (saveSeqRef.current === saveSeq) {
        setSaving(false);
      }
    }
  };

  const updateField = <K extends keyof InitiativeCreate>(
    key: K,
    value: InitiativeCreate[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleIdField = (key: 'linked_app_ids' | 'dependency_ids', id: number) => {
    setForm((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(id)
        ? current.filter((existingId) => existingId !== id)
        : [...current, id];
      return { ...prev, [key]: next };
    });
  };

  const columns = buildColumns(items, handleEdit, handleDelete);
  const categoryOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.category?.trim()).filter((value): value is string => Boolean(value)))).sort(),
    [items],
  );
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (priorityFilter && item.priority !== priorityFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && (item.category ?? '') !== categoryFilter) return false;
      if (validationFilter && (item.validation_status ?? '') !== validationFilter) return false;
      if (deprecationFilter) {
        const expects = deprecationFilter === 'Yes';
        if (Boolean(item.deprecation_aligned) !== expects) return false;
      }
      if (!needle) return true;
      const haystack = [
        item.name,
        item.description,
        item.category,
        item.lane,
        item.priority,
        item.status,
        item.validation_status,
        item.business_owner,
        item.technical_owner,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, search, priorityFilter, statusFilter, categoryFilter, validationFilter, deprecationFilter]);

  const parentMap = new Map(items.map((item) => [item.id, item.name]));
  const linkedAppOptions = apps.some((app) => app.id === AZURE_APP_OPTION.id)
    ? apps
    : [AZURE_APP_OPTION, ...apps];
  const appMap = new Map(linkedAppOptions.map((app) => [app.id, app.app_name]));

  const summary = {
    total: items.length,
    inProgress: items.filter((item) => item.status === 'In Progress').length,
    highPriority: items.filter((item) => item.priority === 'High' || item.priority === 'Critical').length,
    awaitingReview: items.filter((item) => item.validation_status === 'Customer Review').length,
  };

  const exportDetailedCsv = () => {
    downloadWorkbook('strategic-initiatives-detailed', [{
      name: 'Initiatives',
      rows: items.map((item) => ({
        Initiative: item.name,
        Overview: item.description ?? '',
        Category: item.category ?? '',
        Priority: item.priority,
        Status: item.status,
        Validation: item.validation_status ?? '',
        Confidence: item.evidence_confidence ?? '',
        'Business Owner': item.business_owner ?? '',
        'Technical Owner': item.technical_owner ?? '',
        'Parent / Workstream': item.parent_initiative_id ? parentMap.get(item.parent_initiative_id) ?? `#${item.parent_initiative_id}` : '',
        'Planned Start Quarter': item.planned_start_quarter ?? '',
        'Planned End Quarter': item.planned_end_quarter ?? '',
        'Target Horizon': item.target_quarter ?? '',
        'Effort Weeks': item.estimated_effort_weeks ?? '',
        'Estimated Cost Saving': item.estimated_cost_saving ?? '',
        'Prioritization Score': item.prioritization_score?.toFixed(1) ?? '',
        'Deprecation Aligned': item.deprecation_aligned ? 'Yes' : 'No',
        'Linked Applications': (item.linked_app_ids ?? []).map((id) => appMap.get(id) ?? `#${id}`),
        Dependencies: (item.dependency_ids ?? []).map((id) => parentMap.get(id) ?? `#${id}`),
      })),
    }]);
  };

  /* ── render ──────────────────────────────────────────────────────── */

  if (!profileId) {
    return (
      <PageLayout title="Strategic Initiatives" exportId="initiatives-page">
        <p className="empty-state">Select a customer profile to view initiatives.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Strategic Initiatives" exportId="initiatives-page">
      <div className="initiative-summary-grid">
        <div className="initiative-summary-card initiative-summary-card--blue">
          <span className="initiative-summary-label">Total initiatives</span>
          <strong>{summary.total}</strong>
          <p>Current working initiative set consolidated from transcript analysis and customer context.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--green">
          <span className="initiative-summary-label">In progress</span>
          <strong>{summary.inProgress}</strong>
          <p>Initiatives already underway or materially in motion.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--amber">
          <span className="initiative-summary-label">High or critical</span>
          <strong>{summary.highPriority}</strong>
          <p>Items currently carrying the strongest urgency or strategic pressure.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--rose">
          <span className="initiative-summary-label">Awaiting validation</span>
          <strong>{summary.awaitingReview}</strong>
          <p>Initiatives still marked for customer review rather than final confirmation.</p>
        </div>
      </div>

      {/* toolbar */}
      <div className="profiles-toolbar initiatives-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Initiative
        </button>
        {selectedItems.length > 0 && (
          <button className="btn btn-danger" onClick={() => setShowBulkDelete(true)}>
            <Trash2 size={15} /> Delete {selectedItems.length} selected
          </button>
        )}
        <button className="btn" onClick={exportDetailedCsv}>
          <Download size={15} />
          Export Detailed Excel
        </button>
        <div className="view-toggle" style={{ marginLeft: 'auto' }}>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Table</button>
          <button className={viewMode === 'roadmap' ? 'active' : ''} onClick={() => setViewMode('roadmap')}>Roadmap</button>
        </div>
      </div>
      {operationError && <p className="error-text">{operationError}</p>}

      <section className="report-note initiative-score-note">
        <strong>Score calculation</strong>
        <p>
          Prioritization score is calculated as <code>(priority weight × strategic fit) / complexity</code>.
          Priority weights are Critical = {PRIORITY_WEIGHTS.Critical}, High = {PRIORITY_WEIGHTS.High},
          Medium = {PRIORITY_WEIGHTS.Medium}, and Low = {PRIORITY_WEIGHTS.Low}. Higher scores indicate stronger
          return on effort.
        </p>
      </section>

      {items.length > 0 && (
        <section className="initiative-overview-section">
          <div className="initiative-overview-header">
            <div>
              <h3>Initiative context</h3>
              <p>Customer-facing summaries derived from transcript evidence, showing why each initiative exists and what it is trying to achieve.</p>
            </div>
            <span className="initiative-overview-badge">
              <Sparkles size={15} />
              Derived from transcript evidence
            </span>
          </div>
          <div className="initiative-overview-grid">
            {items
              .slice()
              .sort((a, b) => (b.prioritization_score ?? 0) - (a.prioritization_score ?? 0))
              .map((item) => (
                <article key={item.id} className="initiative-overview-card">
                  <div className="initiative-overview-topline">
                    <div>
                      <h4>{item.name}</h4>
                      <p>{item.description || 'No overview captured yet.'}</p>
                    </div>
                    <div className="initiative-overview-card-actions">
                      <button
                        className="initiative-overview-view-btn"
                        type="button"
                        title="Edit initiative"
                        onClick={() => handleEdit(item)}
                      >
                        Edit
                      </button>
                      <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                    </div>
                  </div>
                  <div className="initiative-overview-meta">
                    <span>{item.category ?? 'Uncategorised'}</span>
                    <span>{item.status}</span>
                    {item.validation_status && <span>{item.validation_status}</span>}
                    {item.evidence_confidence && <span>{item.evidence_confidence} confidence</span>}
                    {item.planned_start_quarter && <span>Start: {item.planned_start_quarter}</span>}
                    {item.planned_end_quarter && <span>End: {item.planned_end_quarter}</span>}
                    {item.target_quarter && <span>{item.target_quarter}</span>}
                  </div>
                  {(item.business_owner || item.technical_owner) && (
                    <div className="initiative-overview-owner">
                      Owner: {[item.business_owner, item.technical_owner].filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {item.parent_initiative_id && (
                    <div className="initiative-overview-detail">
                      <strong>Parent / workstream:</strong> {parentMap.get(item.parent_initiative_id) ?? `#${item.parent_initiative_id}`}
                    </div>
                  )}
                  {item.linked_app_ids && item.linked_app_ids.length > 0 && (
                    <div className="initiative-overview-detail">
                      <strong>Linked apps:</strong> {item.linked_app_ids.map((id) => appMap.get(id) ?? `#${id}`).join(', ')}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </section>
      )}

      <SidePanel open={showForm} title={editingId ? 'Edit Initiative' : 'New Initiative'} onClose={resetForm}>
          <div className="crud-form-grid">
            <label>
              Name *
              <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. Migrate SQL to Azure SQL" />
            </label>
            <label>
              Category
              <select value={form.category ?? 'Other'} onChange={(e) => updateField('category', e.target.value)}>
                {CATEGORY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Lane / Team
              <input value={form.lane ?? ''} onChange={(e) => updateField('lane', e.target.value)} placeholder="e.g. Web Team" />
            </label>
            <label>
              Priority
              <select value={form.priority ?? 'Medium'} onChange={(e) => updateField('priority', e.target.value)}>
                {PRIORITY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={form.status ?? 'Proposed'} onChange={(e) => updateField('status', e.target.value)}>
                {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Complexity (1-5)
              <input type="number" min={1} max={5} value={form.complexity ?? ''} onChange={(e) => updateField('complexity', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Strategic Fit (1-10)
              <input type="number" min={1} max={10} value={form.strategic_fit ?? ''} onChange={(e) => updateField('strategic_fit', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Estimated Effort (weeks)
              <input type="number" min={0} value={form.estimated_effort_weeks ?? ''} onChange={(e) => updateField('estimated_effort_weeks', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Estimated Cost Saving ($)
              <input type="number" min={0} value={form.estimated_cost_saving ?? ''} onChange={(e) => updateField('estimated_cost_saving', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Planned Start Quarter
              <input value={form.planned_start_quarter ?? ''} onChange={(e) => updateField('planned_start_quarter', e.target.value)} placeholder="e.g. 2026-Q2" />
            </label>
            <label>
              Planned End Quarter
              <input value={form.planned_end_quarter ?? ''} onChange={(e) => updateField('planned_end_quarter', e.target.value)} placeholder="e.g. 2026-Q4" />
            </label>
            <label>
              Target Quarter
              <input value={form.target_quarter ?? ''} onChange={(e) => updateField('target_quarter', e.target.value)} placeholder="e.g. 2026-Q4" />
            </label>
            <label>
              Business Owner
              <input value={form.business_owner ?? ''} onChange={(e) => updateField('business_owner', e.target.value)} placeholder="Business sponsor or owner" />
            </label>
            <label>
              Technical Owner
              <input value={form.technical_owner ?? ''} onChange={(e) => updateField('technical_owner', e.target.value)} placeholder="Technical lead or owner" />
            </label>
            <label>
              Validation Status
              <select value={form.validation_status ?? 'Draft'} onChange={(e) => updateField('validation_status', e.target.value)}>
                {VALIDATION_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Evidence Confidence
              <select value={form.evidence_confidence ?? 'Medium'} onChange={(e) => updateField('evidence_confidence', e.target.value)}>
                {CONFIDENCE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Parent Initiative / Workstream
              <select value={form.parent_initiative_id ?? ''} onChange={(e) => updateField('parent_initiative_id', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">None</option>
                {items.filter((i) => i.id !== editingId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label className="initiative-checkbox-field">
              <span>Deprecation Aligned</span>
              <input
                type="checkbox"
                checked={Boolean(form.deprecation_aligned)}
                onChange={(e) => updateField('deprecation_aligned', e.target.checked)}
              />
            </label>
            <div className="initiative-toggle-field span-full">
              <div className="initiative-toggle-field__label">Linked Applications</div>
              <p className="initiative-toggle-field__hint">Click to select or unselect related applications.</p>
              <div className="initiative-toggle-list">
                {linkedAppOptions.map((a) => {
                  const selected = (form.linked_app_ids ?? []).includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`initiative-toggle-chip ${selected ? 'initiative-toggle-chip--selected' : ''}`}
                      onClick={() => toggleIdField('linked_app_ids', a.id)}
                    >
                      {a.app_name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="initiative-toggle-field span-full">
              <div className="initiative-toggle-field__label">Dependencies (other initiatives)</div>
              <p className="initiative-toggle-field__hint">Click to select or unselect prerequisite initiatives.</p>
              <div className="initiative-toggle-list">
                {items.filter((i) => i.id !== editingId).map((i) => {
                  const selected = (form.dependency_ids ?? []).includes(i.id);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      className={`initiative-toggle-chip ${selected ? 'initiative-toggle-chip--selected' : ''}`}
                      onClick={() => toggleIdField('dependency_ids', i.id)}
                    >
                      {i.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="span-full">
              Description
              <textarea rows={2} value={form.description ?? ''} onChange={(e) => updateField('description', e.target.value)} placeholder="What does this initiative achieve?" />
            </label>
          </div>

          <div className="crud-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
            <button className="btn" onClick={resetForm}>Cancel</button>
          </div>
      </SidePanel>

      <SidePanel open={!!viewingItem} title="Edit Initiative" onClose={() => setViewingItem(null)}>
        {viewingItem && (
          <div className="detail-view-stack">
            <div className="detail-view-intro">
              <h4>{viewingItem.name}</h4>
              <p>{viewingItem.description || 'No overview captured yet.'}</p>
            </div>
            <div className="detail-view-meta">
              <span>{viewingItem.priority}</span>
              <span>{viewingItem.status}</span>
              {viewingItem.category && <span>{viewingItem.category}</span>}
              {viewingItem.validation_status && <span>{viewingItem.validation_status}</span>}
              {viewingItem.evidence_confidence && <span>{viewingItem.evidence_confidence} confidence</span>}
              {viewingItem.planned_start_quarter && <span>Start: {viewingItem.planned_start_quarter}</span>}
              {viewingItem.planned_end_quarter && <span>End: {viewingItem.planned_end_quarter}</span>}
              {viewingItem.target_quarter && <span>{viewingItem.target_quarter}</span>}
            </div>
            {(viewingItem.business_owner || viewingItem.technical_owner) && (
              <div className="detail-view-section">
                <strong>Owners</strong>
                <p>{[viewingItem.business_owner, viewingItem.technical_owner].filter(Boolean).join(' / ')}</p>
              </div>
            )}
            {viewingItem.parent_initiative_id && (
              <div className="detail-view-section">
                <strong>Parent / workstream</strong>
                <p>{parentMap.get(viewingItem.parent_initiative_id) ?? `#${viewingItem.parent_initiative_id}`}</p>
              </div>
            )}
            {(viewingItem.estimated_effort_weeks || viewingItem.estimated_cost_saving || viewingItem.prioritization_score != null) && (
              <div className="detail-view-section">
                <strong>Planning signals</strong>
                <p>
                  {[
                    viewingItem.estimated_effort_weeks ? `${viewingItem.estimated_effort_weeks} week effort` : '',
                    viewingItem.estimated_cost_saving ? `$${viewingItem.estimated_cost_saving.toLocaleString()} estimated saving` : '',
                    viewingItem.prioritization_score != null ? `Score ${viewingItem.prioritization_score.toFixed(1)}` : '',
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
            {viewingItem.linked_app_ids && viewingItem.linked_app_ids.length > 0 && (
              <div className="detail-view-section">
                <strong>Linked applications</strong>
                <p>{viewingItem.linked_app_ids.map((id) => appMap.get(id) ?? `#${id}`).join(', ')}</p>
              </div>
            )}
            {viewingItem.dependency_ids && viewingItem.dependency_ids.length > 0 && (
              <div className="detail-view-section">
                <strong>Dependencies</strong>
                <p>{viewingItem.dependency_ids.map((id) => parentMap.get(id) ?? `#${id}`).join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      {/* content */}
      {loading ? (
        <p className="loading-text">Loading initiatives…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No initiatives defined yet. Click "+ Add Initiative" to get started.</p>
      ) : viewMode === 'table' ? (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search initiatives..."
            searchAriaLabel="Search initiatives"
            filters={[
              { ariaLabel: 'Filter by priority', value: priorityFilter, onChange: setPriorityFilter, options: PRIORITY_OPTIONS, allLabel: 'All priorities' },
              { ariaLabel: 'Filter by status', value: statusFilter, onChange: setStatusFilter, options: STATUS_OPTIONS, allLabel: 'All statuses' },
              { ariaLabel: 'Filter by category', value: categoryFilter, onChange: setCategoryFilter, options: categoryOptions, allLabel: 'All categories' },
              { ariaLabel: 'Filter by validation', value: validationFilter, onChange: setValidationFilter, options: VALIDATION_OPTIONS, allLabel: 'All validation states' },
              { ariaLabel: 'Filter by deprecation alignment', value: deprecationFilter, onChange: setDeprecationFilter, options: ['Yes', 'No'], allLabel: 'All deprecation states' },
            ]}
          />
          <DataTable data={filteredItems} columns={columns} exportFileName="strategic-initiatives" stickyFirstColumn enableRowSelection onSelectionChange={setSelectedItems} enableGlobalFilter={false} />
        </>
      ) : (
        <InitiativesRoadmap items={items} />
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete initiative"
        message="Delete this initiative? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showBulkDelete}
        title="Delete selected initiatives"
        message={`Delete ${selectedItems.length} selected initiative(s)? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </PageLayout>
  );
}
