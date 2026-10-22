/**
 * StakeholderInterviews.tsx — capture stakeholder interview notes,
 * key findings, pain points, and link to apps / initiatives.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { DataTable } from '../components/shared/DataTable';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SidePanel } from '../components/shared/SidePanel';
import { useProfile } from '../hooks/useProfile';
import { stakeholdersApi } from '../api/stakeholders';
import { portfolioApi } from '../api/portfolio';
import { initiativesApi } from '../api/initiatives';
import type { StakeholderNote, StakeholderNoteCreate, AppPortfolioEntry, Initiative } from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import { Sparkles, Trash2 } from 'lucide-react';
import { isRequestCancellationError } from '../utils/requestErrors';

const col = createColumnHelper<StakeholderNote>();

const columns = [
  col.accessor('stakeholder_name', { header: 'Name' }),
  col.accessor((r) => r.role ?? '', { id: 'role', header: 'Role' }),
  col.accessor((r) => r.department ?? '', { id: 'department', header: 'Department' }),
  col.accessor((r) => r.validation_status ?? '', { id: 'validation_status', header: 'Validation' }),
  col.accessor((r) => r.interview_date ?? '', { id: 'date', header: 'Date' }),
  col.accessor((r) => r.source_meeting ?? '', { id: 'source_meeting', header: 'Source' }),
  col.accessor((r) => (r.key_findings ?? '').slice(0, 80) + ((r.key_findings ?? '').length > 80 ? '…' : ''), {
    id: 'findings',
    header: 'Key Findings',
  }),
  col.accessor((r) => (r.pain_points ?? '').slice(0, 60) + ((r.pain_points ?? '').length > 60 ? '…' : ''), {
    id: 'pain_points',
    header: 'Pain Points',
  }),
  col.accessor((r) => (r.tags ?? []).join(', '), { id: 'tags', header: 'Tags' }),
];

const emptyForm: StakeholderNoteCreate = {
  stakeholder_name: '',
  role: '',
  department: '',
  interview_date: '',
  notes: '',
  key_findings: '',
  pain_points: '',
  source_meeting: '',
  validation_status: 'Transcript-derived / needs validation',
  linked_app_ids: [],
  linked_initiative_ids: [],
  tags: [],
};

function withFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((err: unknown) => {
    if (isRequestCancellationError(err)) throw err;
    return fallback;
  });
}

export default function StakeholderInterviews() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const [items, setItems] = useState<StakeholderNote[]>([]);
  const [apps, setApps] = useState<AppPortfolioEntry[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StakeholderNoteCreate>({ ...emptyForm });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [viewingItem, setViewingItem] = useState<StakeholderNote | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<StakeholderNote[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const profileEpochRef = useRef(0);
  const deleteSeqRef = useRef(0);

  const loadItems = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const [notes, appList, initList] = await Promise.all([
        stakeholdersApi.list(profileId),
        withFallback(portfolioApi.list(profileId), [] as AppPortfolioEntry[]),
        withFallback(initiativesApi.list(profileId), [] as Initiative[]),
      ]);
      if (requestSeqRef.current === requestSeq) {
        setItems(notes);
        setApps(appList);
        setInitiatives(initList);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load stakeholder notes', err);
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    requestSeqRef.current += 1;
    saveSeqRef.current += 1;
    profileEpochRef.current += 1;
    deleteSeqRef.current += 1;
    setLoading(false);
    setSaving(false);
    setOperationError('');
    setItems([]);
    setApps([]);
    setInitiatives([]);
    setEditingId(null);
    setShowForm(false);
    setForm({ ...emptyForm });
    setTagInput('');
    setExpandedId(null);
    setViewingItem(null);
    setDeleteId(null);
    setSelectedItems([]);
    setShowBulkDelete(false);
    if (profileId) {
      void loadItems();
    }
  }, [loadItems, profileId]);

  const updateField = <K extends keyof StakeholderNoteCreate>(key: K, val: StakeholderNoteCreate[K]) =>
    setForm((p) => ({ ...p, [key]: val }));

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
    setTagInput('');
  };

  const handleEdit = (item: StakeholderNote) => {
    setForm({
      stakeholder_name: item.stakeholder_name,
      role: item.role ?? '',
      department: item.department ?? '',
      interview_date: item.interview_date ?? '',
      notes: item.notes ?? '',
      key_findings: item.key_findings ?? '',
      pain_points: item.pain_points ?? '',
      source_meeting: item.source_meeting ?? '',
      validation_status: item.validation_status ?? 'Transcript-derived / needs validation',
      linked_app_ids: item.linked_app_ids ?? [],
      linked_initiative_ids: item.linked_initiative_ids ?? [],
      tags: item.tags ?? [],
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!profileId || !form.stakeholder_name.trim()) return;
    const profileEpoch = profileEpochRef.current;
    const saveSeq = ++saveSeqRef.current;
    setOperationError('');
    setSaving(true);
    try {
      if (editingId) {
        await stakeholdersApi.update(editingId, form);
      } else {
        await stakeholdersApi.create(profileId, form);
      }
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadItems();
    } catch (err) {
      if (!isRequestCancellationError(err) && saveSeqRef.current === saveSeq) {
        console.error('Failed to save stakeholder interview note', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to save stakeholder interview note.');
      }
    } finally {
      if (saveSeqRef.current === saveSeq) {
        setSaving(false);
      }
    }
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
      await stakeholdersApi.delete(deleteId);
      if (deleteSeqRef.current !== deleteSeq) return;
      setDeleteId(null);
      if (requestSeqRef.current === requestSeq) {
        await loadItems();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to delete stakeholder interview note', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete stakeholder interview note.');
      }
    }
  };

  const confirmBulkDelete = async () => {
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      for (const item of selectedItems) {
        await stakeholdersApi.delete(item.id);
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
        console.error('Failed to bulk delete stakeholder interview notes', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete selected stakeholder interview notes.');
      }
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !(form.tags ?? []).includes(t)) {
      updateField('tags', [...(form.tags ?? []), t]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    updateField('tags', (form.tags ?? []).filter((t) => t !== tag));
  };

  // Build lookup maps
  const appMap = new Map(apps.map((a) => [a.id, a.app_name]));
  const initMap = new Map(initiatives.map((i) => [i.id, i.name]));

  // Extended columns with actions
  const actionColumns = [
    ...columns,
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const row = info.row.original;
        return (
          <span className="action-buttons">
            <button className="btn btn-sm" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}>
              {expandedId === row.id ? 'Collapse' : 'View'}
            </button>
            <button className="btn btn-sm" onClick={() => handleEdit(row)}>Edit</button>
            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(row.id)}>Delete</button>
          </span>
        );
      },
    }),
  ];

  if (!profileId) {
    return (
      <PageLayout title="Stakeholder Interviews" exportId="stakeholder-page">
        <p className="empty-state">Select a customer profile to view stakeholder interview notes.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Stakeholder Interviews" exportId="stakeholder-page">
      {/* toolbar */}
      <div className="profiles-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Interview Note
        </button>
        {selectedItems.length > 0 && (
          <button className="btn btn-danger" onClick={() => setShowBulkDelete(true)}>
            <Trash2 size={15} /> Delete {selectedItems.length} selected
          </button>
        )}
      </div>
      {operationError && <p className="error-text">{operationError}</p>}

      <SidePanel open={showForm} title={editingId ? 'Edit Interview Note' : 'New Interview Note'} onClose={resetForm}>
          <div className="crud-form-grid">
            <label>
              Stakeholder Name *
              <input value={form.stakeholder_name} onChange={(e) => updateField('stakeholder_name', e.target.value)} placeholder="e.g. Jane Smith" />
            </label>
            <label>
              Role
              <input value={form.role ?? ''} onChange={(e) => updateField('role', e.target.value)} placeholder="e.g. CTO, IT Director" />
            </label>
            <label>
              Department
              <input value={form.department ?? ''} onChange={(e) => updateField('department', e.target.value)} placeholder="e.g. IT, Finance" />
            </label>
            <label>
              Interview Date
              <input type="date" value={form.interview_date ?? ''} onChange={(e) => updateField('interview_date', e.target.value)} />
            </label>
            <label>
              Validation Status
              <input
                value={form.validation_status ?? ''}
                onChange={(e) => updateField('validation_status', e.target.value)}
                placeholder="e.g. Transcript-derived / needs validation"
              />
            </label>
            <label className="span-full">
              Source Meeting
              <input
                value={form.source_meeting ?? ''}
                onChange={(e) => updateField('source_meeting', e.target.value)}
                placeholder="Structured meeting note source"
              />
            </label>

            <label>
              Linked Applications
              <select
                multiple
                value={(form.linked_app_ids ?? []).map(String)}
                onChange={(e) => updateField('linked_app_ids', Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
                style={{ minHeight: '60px' }}
              >
                {apps.map((a) => <option key={a.id} value={a.id}>{a.app_name}</option>)}
              </select>
            </label>
            <label>
              Linked Initiatives
              <select
                multiple
                value={(form.linked_initiative_ids ?? []).map(String)}
                onChange={(e) => updateField('linked_initiative_ids', Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
                style={{ minHeight: '60px' }}
              >
                {initiatives.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>

            <label className="span-full">
              Key Findings
              <textarea rows={2} value={form.key_findings ?? ''} onChange={(e) => updateField('key_findings', e.target.value)} placeholder="Main discoveries from the interview" />
            </label>
            <label className="span-full">
              Pain Points
              <textarea rows={2} value={form.pain_points ?? ''} onChange={(e) => updateField('pain_points', e.target.value)} placeholder="Problems or frustrations raised" />
            </label>
            <label className="span-full">
              General Notes
              <textarea rows={3} value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Detailed interview notes…" />
            </label>

            <label className="span-full">
              Tags
              <div className="tag-input-row">
                {(form.tags ?? []).map((t) => (
                  <span key={t} className="tag-badge">
                    {t} <button type="button" className="tag-remove-btn" aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}>×</button>
                  </span>
                ))}
                <input
                  className="tag-input-field"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag + Enter"
                />
              </div>
            </label>
          </div>

          <div className="crud-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.stakeholder_name.trim()}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
            <button className="btn" onClick={resetForm}>Cancel</button>
          </div>
      </SidePanel>

      <SidePanel open={!!viewingItem} title="View Stakeholder Note" onClose={() => setViewingItem(null)}>
        {viewingItem && (
          <div className="detail-view-stack">
            <div className="detail-view-intro">
              <h4>{viewingItem.stakeholder_name}</h4>
              <p>{viewingItem.key_findings || viewingItem.notes || 'No stakeholder summary captured yet.'}</p>
            </div>
            <div className="detail-view-meta">
              {viewingItem.role && <span>{viewingItem.role}</span>}
              {viewingItem.department && <span>{viewingItem.department}</span>}
              {viewingItem.validation_status && <span>{viewingItem.validation_status}</span>}
              {viewingItem.source_meeting && <span>{viewingItem.source_meeting}</span>}
              {viewingItem.interview_date && <span>{viewingItem.interview_date}</span>}
            </div>
            {viewingItem.pain_points && (
              <div className="detail-view-section">
                <strong>Pain points</strong>
                <p>{viewingItem.pain_points}</p>
              </div>
            )}
            {viewingItem.notes && (
              <div className="detail-view-section">
                <strong>Notes</strong>
                <p>{viewingItem.notes}</p>
              </div>
            )}
            {viewingItem.linked_app_ids && viewingItem.linked_app_ids.length > 0 && (
              <div className="detail-view-section">
                <strong>Linked applications</strong>
                <p>{viewingItem.linked_app_ids.map((id) => appMap.get(id) ?? `#${id}`).join(', ')}</p>
              </div>
            )}
            {viewingItem.linked_initiative_ids && viewingItem.linked_initiative_ids.length > 0 && (
              <div className="detail-view-section">
                <strong>Linked initiatives</strong>
                <p>{viewingItem.linked_initiative_ids.map((id) => initMap.get(id) ?? `#${id}`).join(', ')}</p>
              </div>
            )}
            {viewingItem.tags && viewingItem.tags.length > 0 && (
              <div className="detail-view-section">
                <strong>Tags</strong>
                <p>{viewingItem.tags.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      {/* table + expanded detail */}
      {loading ? (
        <p className="loading-text">Loading stakeholder notes…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No stakeholder interview notes yet. Click "+ Add Interview Note" to record findings.</p>
      ) : (
        <>
          <section className="initiative-overview-section">
            <div className="initiative-overview-header">
              <div>
                <h3>Stakeholder context</h3>
                <p>Visual summaries of stakeholder interview notes, making key findings, pain points, and linked delivery context easier to scan.</p>
              </div>
              <span className="initiative-overview-badge">
                <Sparkles size={15} />
                Table view remains below
              </span>
            </div>
            <div className="initiative-overview-grid">
              {items.map((item) => (
                <article key={item.id} className="initiative-overview-card">
                  <div className="initiative-overview-topline">
                    <div>
                      <h4>{item.stakeholder_name}</h4>
                      <p>{item.key_findings || item.notes || 'No stakeholder summary captured yet.'}</p>
                    </div>
                    <div className="initiative-overview-card-actions">
                      <button
                        className="initiative-overview-view-btn"
                        type="button"
                        title="View stakeholder note"
                        onClick={() => setViewingItem(item)}
                      >
                        View
                      </button>
                      <span className="priority-badge priority-medium">{item.validation_status || 'Captured'}</span>
                    </div>
                  </div>
                  <div className="initiative-overview-meta">
                    {item.role && <span>{item.role}</span>}
                    {item.department && <span>{item.department}</span>}
                    {item.source_meeting && <span>{item.source_meeting}</span>}
                    {item.interview_date && <span>{item.interview_date}</span>}
                  </div>
                  {item.pain_points && (
                    <div className="initiative-overview-detail">
                      <strong>Pain points:</strong> {item.pain_points}
                    </div>
                  )}
                  {item.linked_app_ids && item.linked_app_ids.length > 0 && (
                    <div className="initiative-overview-detail">
                      <strong>Linked apps:</strong> {item.linked_app_ids.map((id) => appMap.get(id) ?? `#${id}`).join(', ')}
                    </div>
                  )}
                  {item.linked_initiative_ids && item.linked_initiative_ids.length > 0 && (
                    <div className="initiative-overview-detail">
                      <strong>Linked initiatives:</strong> {item.linked_initiative_ids.map((id) => initMap.get(id) ?? `#${id}`).join(', ')}
                    </div>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="initiative-overview-meta">
                      {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
          <DataTable data={items} columns={actionColumns} enableRowSelection onSelectionChange={setSelectedItems} />
          {expandedId && (() => {
            const item = items.find((i) => i.id === expandedId);
            if (!item) return null;
            return (
              <div className="stakeholder-detail">
                <h4>{item.stakeholder_name} — {item.role ?? 'N/A'} ({item.department ?? 'N/A'})</h4>
                {item.interview_date && <p><strong>Date:</strong> {item.interview_date}</p>}
                {item.validation_status && <p><strong>Validation:</strong> {item.validation_status}</p>}
                {item.source_meeting && <p><strong>Source:</strong> {item.source_meeting}</p>}

                {item.key_findings && (
                  <div className="stakeholder-detail-section">
                    <strong>Key Findings:</strong>
                    <p>{item.key_findings}</p>
                  </div>
                )}
                {item.pain_points && (
                  <div className="stakeholder-detail-section">
                    <strong>Pain Points:</strong>
                    <p>{item.pain_points}</p>
                  </div>
                )}
                {item.notes && (
                  <div className="stakeholder-detail-section">
                    <strong>Notes:</strong>
                    <p>{item.notes}</p>
                  </div>
                )}

                {item.linked_app_ids && item.linked_app_ids.length > 0 && (
                  <p><strong>Linked Apps:</strong> {item.linked_app_ids.map((id) => appMap.get(id) ?? `#${id}`).join(', ')}</p>
                )}
                {item.linked_initiative_ids && item.linked_initiative_ids.length > 0 && (
                  <p><strong>Linked Initiatives:</strong> {item.linked_initiative_ids.map((id) => initMap.get(id) ?? `#${id}`).join(', ')}</p>
                )}
                {item.tags && item.tags.length > 0 && (
                  <p><strong>Tags:</strong> {item.tags.map((t) => <span key={t} className="tag-badge stakeholder-tag">{t}</span>)}</p>
                )}
              </div>
            );
          })()}
        </>
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete stakeholder"
        message="Delete this stakeholder interview record? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showBulkDelete}
        title="Delete selected interviews"
        message={`Delete ${selectedItems.length} selected interview(s)? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </PageLayout>
  );
}
