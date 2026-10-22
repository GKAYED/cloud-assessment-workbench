/**
 * Recommendations.tsx — profile-scoped recommendation register with manual CRUD.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { recommendationsApi } from '../api/recommendations';
import { PageLayout } from '../components/layout/PageLayout';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { DataTable } from '../components/shared/DataTable';
import { SidePanel } from '../components/shared/SidePanel';
import { useProfile } from '../hooks/useProfile';
import type { Recommendation, RecommendationCreate } from '../types';
import { downloadWorkbook } from '../utils/excel';
import { isRequestCancellationError } from '../utils/requestErrors';

const PRIORITY_OPTIONS = ['P1', 'P2', 'P3'];
const CATEGORY_OPTIONS = ['Governance', 'Operating Model', 'Capability', 'Architecture', 'Migration', 'Dynamics', 'Reporting', 'FinOps', 'Security', 'Other'];
const TYPE_OPTIONS = ['Recommendation', 'Recommendation-candidate', 'Workstream input', 'Resourcing', 'Operating rhythm'];
const REINFORCEMENT_OPTIONS = ['Emerging but clear', 'Strong domain-specific', 'Strong cross-transcript', 'Focused but well evidenced'];
const VALIDATION_OPTIONS = ['Draft', 'Customer Review', 'Confirmed'];

const emptyForm: RecommendationCreate = {
  recommendation_id: '',
  title: '',
  description: '',
  priority: 'P2',
  category: 'Other',
  recommendation_type: 'Recommendation',
  primary_outcome: '',
  why_it_matters: '',
  practical_next_step: '',
  evidence_sources: [],
  reinforcement_level: 'Emerging but clear',
  manual_entry: true,
  validation_status: 'Draft',
  notes: '',
};

const col = createColumnHelper<Recommendation>();

function buildColumns(
  onEdit: (entry: Recommendation) => void,
  onDelete: (id: number) => void,
) {
  return [
    col.accessor((row) => row.recommendation_id ?? '—', {
      id: 'recommendation_id',
      header: 'ID',
    }),
    col.accessor('title', { header: 'Recommendation' }),
    col.accessor('priority', { header: 'Priority' }),
    col.accessor((row) => row.category ?? '—', {
      id: 'category',
      header: 'Category',
    }),
    col.accessor((row) => row.recommendation_type ?? '—', {
      id: 'recommendation_type',
      header: 'Type',
    }),
    col.accessor((row) => row.reinforcement_level ?? '—', {
      id: 'reinforcement_level',
      header: 'Evidence breadth',
    }),
    col.accessor((row) => row.evidence_sources?.join(', ') ?? '—', {
      id: 'evidence_sources',
      header: 'Sources',
    }),
    col.accessor((row) => row.validation_status ?? '—', {
      id: 'validation_status',
      header: 'Validation',
    }),
    col.accessor((row) => (row.manual_entry ? 'Yes' : 'No'), {
      id: 'manual_entry',
      header: 'Manual',
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

export default function Recommendations() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RecommendationCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const profileEpochRef = useRef(0);
  const deleteSeqRef = useRef(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Recommendation[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [viewingItem, setViewingItem] = useState<Recommendation | null>(null);

  useEffect(() => {
    requestSeqRef.current += 1;
    saveSeqRef.current += 1;
    profileEpochRef.current += 1;
    deleteSeqRef.current += 1;
    setItems([]);
    setSelectedItems([]);
    setShowBulkDelete(false);
    setDeleteId(null);
    setViewingItem(null);
    setEditingId(null);
    setShowForm(false);
    setForm({ ...emptyForm });
    setOperationError('');
    setLoading(false);
    setSaving(false);
  }, [profileId]);

  const loadItems = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const data = await recommendationsApi.list(profileId);
      if (requestSeqRef.current === requestSeq) {
        setItems(data);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load recommendations', err);
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
  };

  const handleAddNew = () => {
    setForm({ ...emptyForm, manual_entry: true });
    setEditingId(null);
    setShowForm(true);
  };

  const updateField = <K extends keyof RecommendationCreate>(key: K, value: RecommendationCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleEdit = (entry: Recommendation) => {
    setForm({
      recommendation_id: entry.recommendation_id ?? '',
      title: entry.title,
      description: entry.description ?? '',
      priority: entry.priority,
      category: entry.category ?? 'Other',
      recommendation_type: entry.recommendation_type ?? 'Recommendation',
      primary_outcome: entry.primary_outcome ?? '',
      why_it_matters: entry.why_it_matters ?? '',
      practical_next_step: entry.practical_next_step ?? '',
      evidence_sources: entry.evidence_sources ?? [],
      reinforcement_level: entry.reinforcement_level ?? 'Emerging but clear',
      manual_entry: entry.manual_entry,
      validation_status: entry.validation_status ?? 'Draft',
      notes: entry.notes ?? '',
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!profileId || !form.title?.trim()) return;
    const profileEpoch = profileEpochRef.current;
    const saveSeq = ++saveSeqRef.current;
    setOperationError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        evidence_sources: (form.evidence_sources ?? []).filter(Boolean),
      };
      if (editingId) {
        await recommendationsApi.update(editingId, payload);
      } else {
        await recommendationsApi.create(profileId, payload);
      }
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadItems();
    } catch (err) {
      if (!isRequestCancellationError(err) && saveSeqRef.current === saveSeq) {
        console.error('Failed to save recommendation', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to save recommendation.');
      }
    } finally {
      if (saveSeqRef.current === saveSeq) {
        setSaving(false);
      }
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      await recommendationsApi.delete(deleteId);
      if (deleteSeqRef.current !== deleteSeq) return;
      setDeleteId(null);
      if (requestSeqRef.current === requestSeq) {
        await loadItems();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to delete recommendation', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete recommendation.');
      }
    }
  };

  const confirmBulkDelete = async () => {
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      for (const item of selectedItems) {
        await recommendationsApi.delete(item.id);
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
        console.error('Failed to bulk delete recommendations', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete selected recommendations.');
      }
    }
  };

  const summary = useMemo(() => ({
    total: items.length,
    p1: items.filter((item) => item.priority === 'P1').length,
    manual: items.filter((item) => item.manual_entry).length,
    awaitingReview: items.filter((item) => item.validation_status === 'Customer Review').length,
  }), [items]);

  const columns = buildColumns(handleEdit, setDeleteId);

  const exportDetailedCsv = () => {
    downloadWorkbook('recommendations-detailed', [{
      name: 'Recommendations',
      rows: items.map((item) => ({
        ID: item.recommendation_id ?? '',
        Recommendation: item.title,
        Priority: item.priority,
        Category: item.category ?? '',
        Type: item.recommendation_type ?? '',
        'Primary Outcome': item.primary_outcome ?? '',
        'Why It Matters': item.why_it_matters ?? '',
        'Practical Next Step': item.practical_next_step ?? '',
        'Evidence Sources': item.evidence_sources ?? [],
        'Reinforcement Level': item.reinforcement_level ?? '',
        'Manual Entry': item.manual_entry ? 'Yes' : 'No',
        Validation: item.validation_status ?? '',
        Notes: item.notes ?? '',
      })),
    }]);
  };

  if (!profileId) {
    return (
      <PageLayout title="Recommendations" exportId="recommendations-page">
        <p className="empty-state">Select a customer profile to view recommendations.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Recommendations" exportId="recommendations-page">
      <div className="initiative-summary-grid">
        <div className="initiative-summary-card initiative-summary-card--blue">
          <span className="initiative-summary-label">Total recommendations</span>
          <strong>{summary.total}</strong>
          <p>Consolidated recommendation set for this customer profile.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--green">
          <span className="initiative-summary-label">Priority 1</span>
          <strong>{summary.p1}</strong>
          <p>Highest-priority items to shape the near-term recommendation story.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--amber">
          <span className="initiative-summary-label">Manual entries</span>
          <strong>{summary.manual}</strong>
          <p>Recommendations added directly in the app and awaiting transcript reconciliation.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--rose">
          <span className="initiative-summary-label">Awaiting validation</span>
          <strong>{summary.awaitingReview}</strong>
          <p>Items still marked for customer review before they are treated as confirmed.</p>
        </div>
      </div>

      <div className="profiles-toolbar initiatives-toolbar">
        <button className="btn btn-primary" onClick={handleAddNew}>
          + Add Recommendation
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
      </div>
      {operationError && <p className="error-text">{operationError}</p>}

      {items.length > 0 && (
        <section className="initiative-overview-section">
          <div className="initiative-overview-header">
            <div>
              <h3>Recommendation context</h3>
              <p>Customer-facing recommendation summaries, including evidence breadth, next-step framing, and whether the item was manually added.</p>
            </div>
            <span className="initiative-overview-badge">
              <Sparkles size={15} />
              Included in assessment report generation
            </span>
          </div>
          <div className="initiative-overview-grid">
            {items
              .slice()
              .sort((a, b) => a.priority.localeCompare(b.priority) || a.title.localeCompare(b.title))
              .map((item) => (
                <article key={item.id} className="initiative-overview-card">
                  <div className="initiative-overview-topline">
                    <div>
                      <h4>{[item.recommendation_id, item.title].filter(Boolean).join(' ')}</h4>
                      <p>{item.description || item.why_it_matters || 'No summary captured yet.'}</p>
                    </div>
                    <div className="initiative-overview-card-actions">
                      <button
                        className="initiative-overview-view-btn"
                        type="button"
                        title="Edit recommendation"
                        onClick={() => handleEdit(item)}
                      >
                        Edit
                      </button>
                      <span className={`priority-badge priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                    </div>
                  </div>
                  <div className="initiative-overview-meta">
                    <span>{item.category ?? 'Uncategorised'}</span>
                    {item.recommendation_type && <span>{item.recommendation_type}</span>}
                    {item.reinforcement_level && <span>{item.reinforcement_level}</span>}
                    {item.validation_status && <span>{item.validation_status}</span>}
                    <span>{item.manual_entry ? 'Manual entry' : 'Transcript-aligned'}</span>
                  </div>
                  {item.primary_outcome && (
                    <div className="initiative-overview-detail">
                      <strong>Primary outcome:</strong> {item.primary_outcome}
                    </div>
                  )}
                  {item.practical_next_step && (
                    <div className="initiative-overview-detail">
                      <strong>Practical next step:</strong> {item.practical_next_step}
                    </div>
                  )}
                  {item.evidence_sources && item.evidence_sources.length > 0 && (
                    <div className="initiative-overview-detail">
                      <strong>Evidence sources:</strong> {item.evidence_sources.join(', ')}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </section>
      )}

      <SidePanel open={showForm} title={editingId ? 'Edit Recommendation' : 'Add Recommendation'} onClose={resetForm}>
        <div className="crud-form-grid">
          <label>
            Recommendation ID
            <input value={form.recommendation_id ?? ''} onChange={(e) => updateField('recommendation_id', e.target.value)} placeholder="e.g. R11" />
          </label>
          <label>
            Priority
            <select value={form.priority ?? 'P2'} onChange={(e) => updateField('priority', e.target.value)}>
              {PRIORITY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="span-full">
            Recommendation *
            <input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Customer-facing recommendation title" />
          </label>
          <label>
            Category
            <select value={form.category ?? 'Other'} onChange={(e) => updateField('category', e.target.value)}>
              {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Type
            <select value={form.recommendation_type ?? 'Recommendation'} onChange={(e) => updateField('recommendation_type', e.target.value)}>
              {TYPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Evidence breadth
            <select value={form.reinforcement_level ?? 'Emerging but clear'} onChange={(e) => updateField('reinforcement_level', e.target.value)}>
              {REINFORCEMENT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Validation Status
            <select value={form.validation_status ?? 'Draft'} onChange={(e) => updateField('validation_status', e.target.value)}>
              {VALIDATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Manual entry
            <select value={form.manual_entry ? 'Yes' : 'No'} onChange={(e) => updateField('manual_entry', e.target.value === 'Yes')}>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>
          <label className="span-full">
            Summary
            <textarea rows={2} value={form.description ?? ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Short customer-facing summary" />
          </label>
          <label className="span-full">
            Primary outcome
            <textarea rows={2} value={form.primary_outcome ?? ''} onChange={(e) => updateField('primary_outcome', e.target.value)} placeholder="What this recommendation should achieve" />
          </label>
          <label className="span-full">
            Why it matters
            <textarea rows={3} value={form.why_it_matters ?? ''} onChange={(e) => updateField('why_it_matters', e.target.value)} placeholder="Why this recommendation matters" />
          </label>
          <label className="span-full">
            Practical next step
            <textarea rows={2} value={form.practical_next_step ?? ''} onChange={(e) => updateField('practical_next_step', e.target.value)} placeholder="Most sensible next action" />
          </label>
          <label className="span-full">
            Evidence sources
            <input
              value={(form.evidence_sources ?? []).join(', ')}
              onChange={(e) => updateField('evidence_sources', e.target.value.split(',').map((part) => part.trim()).filter(Boolean))}
              placeholder="e.g. INIT, AZ, DYN"
            />
          </label>
          <label className="span-full">
            Notes
            <textarea rows={2} value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Future update notes, reconciliation reminders, frontend status, etc." />
          </label>
        </div>

        <div className="crud-form-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save Recommendation'}
          </button>
          <button className="btn" onClick={resetForm}>Cancel</button>
        </div>
      </SidePanel>

      <SidePanel open={!!viewingItem} title="Edit Recommendation" onClose={() => setViewingItem(null)}>
        {viewingItem && (
          <div className="detail-view-stack">
            <div className="detail-view-intro">
              <h4>{[viewingItem.recommendation_id, viewingItem.title].filter(Boolean).join(' ')}</h4>
              <p>{viewingItem.description || 'No summary captured yet.'}</p>
            </div>
            <div className="detail-view-meta">
              <span>{viewingItem.priority}</span>
              {viewingItem.category && <span>{viewingItem.category}</span>}
              {viewingItem.recommendation_type && <span>{viewingItem.recommendation_type}</span>}
              {viewingItem.reinforcement_level && <span>{viewingItem.reinforcement_level}</span>}
              {viewingItem.validation_status && <span>{viewingItem.validation_status}</span>}
              <span>{viewingItem.manual_entry ? 'Manual entry' : 'Transcript-aligned'}</span>
            </div>
            {viewingItem.primary_outcome && (
              <div className="detail-view-section">
                <strong>Primary outcome</strong>
                <p>{viewingItem.primary_outcome}</p>
              </div>
            )}
            {viewingItem.why_it_matters && (
              <div className="detail-view-section">
                <strong>Why it matters</strong>
                <p>{viewingItem.why_it_matters}</p>
              </div>
            )}
            {viewingItem.practical_next_step && (
              <div className="detail-view-section">
                <strong>Practical next step</strong>
                <p>{viewingItem.practical_next_step}</p>
              </div>
            )}
            {viewingItem.evidence_sources && viewingItem.evidence_sources.length > 0 && (
              <div className="detail-view-section">
                <strong>Evidence sources</strong>
                <p>{viewingItem.evidence_sources.join(', ')}</p>
              </div>
            )}
            {viewingItem.notes && (
              <div className="detail-view-section">
                <strong>Notes</strong>
                <p>{viewingItem.notes}</p>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      {loading ? (
        <p className="loading-text">Loading recommendations…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No recommendations defined yet. Click "+ Add Recommendation" to get started.</p>
      ) : (
        <DataTable
          data={items}
          columns={columns}
          exportFileName="recommendations"
          stickyFirstColumn
          enableRowSelection
          onSelectionChange={setSelectedItems}
        />
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete recommendation"
        message="Delete this recommendation? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showBulkDelete}
        title="Delete selected recommendations"
        message={`Delete ${selectedItems.length} selected recommendation(s)? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </PageLayout>
  );
}
