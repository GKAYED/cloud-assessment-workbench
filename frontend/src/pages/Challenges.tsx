/**
 * Challenges.tsx — profile-scoped challenge register with linked capability opportunities.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Download, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { challengesApi } from '../api/challenges';
import { PageLayout } from '../components/layout/PageLayout';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { DataTable } from '../components/shared/DataTable';
import { SidePanel } from '../components/shared/SidePanel';
import { useProfile } from '../hooks/useProfile';
import type { Challenge, ChallengeCreate } from '../types';
import { downloadWorkbook } from '../utils/excel';
import { isRequestCancellationError } from '../utils/requestErrors';

const IMPACT_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const CATEGORY_OPTIONS = ['Governance', 'Operating Model', 'Capability', 'Architecture', 'Integration', 'Reporting', 'Dynamics', 'Resourcing', 'Delivery', 'Other'];
const REINFORCEMENT_OPTIONS = ['Emerging but clear', 'Strong domain-specific', 'Strong cross-transcript', 'Focused but well evidenced'];
const VALIDATION_OPTIONS = ['Draft', 'Customer Review', 'Confirmed'];
const EVIDENCE_SOURCE_LEGEND: Array<{ code: string; meaning: string }> = [
  { code: 'AZ', meaning: 'Azure data and platform telemetry' },
  { code: 'DYN', meaning: 'Dynamics 365 / Dataverse evidence' },
  { code: 'INIT', meaning: 'Initiatives and roadmap workshops' },
  { code: 'INT', meaning: 'Integration analysis and mapping' },
  { code: 'KICK', meaning: 'Kick-off and stakeholder meetings' },
  { code: 'RPT', meaning: 'Reporting / Power BI context' },
  { code: 'WEB', meaning: 'Website and web-platform evidence' },
];

const emptyForm: ChallengeCreate = {
  challenge_id: '',
  title: '',
  description: '',
  category: 'Other',
  impact_level: 'High',
  primary_effect: '',
  why_it_matters: '',
  evidence_sources: [],
  reinforcement_level: 'Emerging but clear',
  capability_opportunities: [],
  manual_entry: true,
  validation_status: 'Draft',
  notes: '',
};

const col = createColumnHelper<Challenge>();

function buildColumns(
  onEdit: (entry: Challenge) => void,
  onDelete: (id: number) => void,
) {
  return [
    col.accessor((row) => row.challenge_id ?? '—', {
      id: 'challenge_id',
      header: 'ID',
    }),
    col.accessor('title', { header: 'Challenge' }),
    col.accessor('impact_level', { header: 'Impact' }),
    col.accessor((row) => row.category ?? '—', {
      id: 'category',
      header: 'Category',
    }),
    col.accessor((row) => row.primary_effect ?? '—', {
      id: 'primary_effect',
      header: 'Primary Effect',
    }),
    col.accessor((row) => row.reinforcement_level ?? '—', {
      id: 'reinforcement_level',
      header: 'Evidence breadth',
    }),
    col.accessor((row) => row.evidence_sources?.join(', ') ?? '—', {
      id: 'evidence_sources',
      header: 'Sources',
    }),
    col.accessor((row) => row.capability_opportunities?.length ?? 0, {
      id: 'capability_opportunities',
      header: 'Capability Links',
      cell: (info) => info.getValue() || '—',
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

export default function Challenges() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  const [items, setItems] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ChallengeCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const profileEpochRef = useRef(0);
  const deleteSeqRef = useRef(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Challenge[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [viewingItem, setViewingItem] = useState<Challenge | null>(null);

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
      const data = await challengesApi.list(profileId);
      if (requestSeqRef.current === requestSeq) {
        setItems(data);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load challenges', err);
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

  const updateField = <K extends keyof ChallengeCreate>(key: K, value: ChallengeCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleEdit = (entry: Challenge) => {
    setForm({
      challenge_id: entry.challenge_id ?? '',
      title: entry.title,
      description: entry.description ?? '',
      category: entry.category ?? 'Other',
      impact_level: entry.impact_level,
      primary_effect: entry.primary_effect ?? '',
      why_it_matters: entry.why_it_matters ?? '',
      evidence_sources: entry.evidence_sources ?? [],
      reinforcement_level: entry.reinforcement_level ?? 'Emerging but clear',
      capability_opportunities: entry.capability_opportunities ?? [],
      manual_entry: entry.manual_entry,
      validation_status: entry.validation_status ?? 'Draft',
      notes: entry.notes ?? '',
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!profileId || !form.title.trim()) return;
    const profileEpoch = profileEpochRef.current;
    const saveSeq = ++saveSeqRef.current;
    setOperationError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        evidence_sources: (form.evidence_sources ?? []).filter(Boolean),
        capability_opportunities: (form.capability_opportunities ?? []).filter(Boolean),
      };
      if (editingId) {
        await challengesApi.update(editingId, payload);
      } else {
        await challengesApi.create(profileId, payload);
      }
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadItems();
    } catch (err) {
      if (!isRequestCancellationError(err) && saveSeqRef.current === saveSeq) {
        console.error('Failed to save challenge', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to save challenge.');
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
      await challengesApi.delete(deleteId);
      if (deleteSeqRef.current !== deleteSeq) return;
      setDeleteId(null);
      if (requestSeqRef.current === requestSeq) {
        await loadItems();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to delete challenge', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete challenge.');
      }
    }
  };

  const confirmBulkDelete = async () => {
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      for (const item of selectedItems) {
        await challengesApi.delete(item.id);
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
        console.error('Failed to bulk delete challenges', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete selected challenges.');
      }
    }
  };

  const summary = useMemo(() => ({
    total: items.length,
    highImpact: items.filter((item) => item.impact_level === 'High' || item.impact_level === 'Critical').length,
    capabilityLinked: items.filter((item) => (item.capability_opportunities?.length ?? 0) > 0).length,
    manual: items.filter((item) => item.manual_entry).length,
  }), [items]);

  const columns = buildColumns(handleEdit, setDeleteId);

  const exportDetailedCsv = () => {
    downloadWorkbook('challenges-detailed', [{
      name: 'Challenges',
      rows: items.map((item) => ({
        ID: item.challenge_id ?? '',
        Challenge: item.title,
        Impact: item.impact_level,
        Category: item.category ?? '',
        'Primary Effect': item.primary_effect ?? '',
        'Why It Matters': item.why_it_matters ?? '',
        'Evidence Sources': item.evidence_sources ?? [],
        'Capability Opportunities': item.capability_opportunities ?? [],
        'Reinforcement Level': item.reinforcement_level ?? '',
        'Manual Entry': item.manual_entry ? 'Yes' : 'No',
        Validation: item.validation_status ?? '',
        Notes: item.notes ?? '',
      })),
    }]);
  };

  if (!profileId) {
    return (
      <PageLayout title="Challenges" exportId="challenges-page">
        <p className="empty-state">Select a customer profile to view challenges.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Challenges" exportId="challenges-page">
      <div className="initiative-summary-grid">
        <div className="initiative-summary-card initiative-summary-card--blue">
          <span className="initiative-summary-label">Total challenges</span>
          <strong>{summary.total}</strong>
          <p>Recurring challenge themes consolidated from transcript evidence.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--green">
          <span className="initiative-summary-label">High impact</span>
          <strong>{summary.highImpact}</strong>
          <p>The challenge set currently carrying the strongest operational or strategic impact.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--amber">
          <span className="initiative-summary-label">Capability-linked</span>
          <strong>{summary.capabilityLinked}</strong>
          <p>Challenges already linked to one or more upskilling or resourcing opportunities.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--rose">
          <span className="initiative-summary-label">Manual entries</span>
          <strong>{summary.manual}</strong>
          <p>Challenge entries added directly in the app and awaiting source reconciliation.</p>
        </div>
      </div>

      <div className="profiles-toolbar initiatives-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Challenge
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

      <section className="report-note challenge-legend-note">
        <strong>Evidence source legend</strong>
        <div className="challenge-evidence-legend">
          {EVIDENCE_SOURCE_LEGEND.map((item) => (
            <span key={item.code} className="challenge-evidence-legend__item">
              <strong>{item.code}</strong> = {item.meaning}
            </span>
          ))}
        </div>
      </section>

      {items.length > 0 && (
        <section className="initiative-overview-section">
          <div className="initiative-overview-header">
            <div>
              <h3>Challenge context</h3>
              <p>Customer-facing challenge summaries, with evidence breadth and linked capability opportunities visible in one place.</p>
            </div>
            <span className="initiative-overview-badge">
              <Sparkles size={15} />
              Included in assessment report generation
            </span>
          </div>
          <div className="initiative-overview-grid">
            {items
              .slice()
              .sort((a, b) => a.impact_level.localeCompare(b.impact_level) || a.title.localeCompare(b.title))
              .map((item) => (
                <article key={item.id} className="initiative-overview-card">
                  <div className="initiative-overview-topline">
                    <div>
                      <h4>{[item.challenge_id, item.title].filter(Boolean).join(' ')}</h4>
                      <p>{item.description || item.why_it_matters || 'No summary captured yet.'}</p>
                    </div>
                    <div className="initiative-overview-card-actions">
                      <button
                        className="initiative-overview-view-btn"
                        type="button"
                        title="Edit challenge"
                        onClick={() => handleEdit(item)}
                      >
                        Edit
                      </button>
                      <span className={`priority-badge priority-${item.impact_level.toLowerCase()}`}>{item.impact_level}</span>
                    </div>
                  </div>
                  <div className="initiative-overview-meta">
                    <span>{item.category ?? 'Uncategorised'}</span>
                    {item.reinforcement_level && <span>{item.reinforcement_level}</span>}
                    {item.validation_status && <span>{item.validation_status}</span>}
                    <span>{item.manual_entry ? 'Manual entry' : 'Transcript-aligned'}</span>
                  </div>
                  {item.primary_effect && (
                    <div className="initiative-overview-detail">
                      <strong>Primary effect:</strong> {item.primary_effect}
                    </div>
                  )}
                  {item.capability_opportunities && item.capability_opportunities.length > 0 && (
                    <div className="initiative-overview-detail">
                      <strong>Capability opportunities:</strong> {item.capability_opportunities.join('; ')}
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

      <SidePanel open={showForm} title={editingId ? 'Edit Challenge' : 'New Challenge'} onClose={resetForm}>
        <div className="crud-form-grid">
          <label>
            Challenge ID
            <input value={form.challenge_id ?? ''} onChange={(e) => updateField('challenge_id', e.target.value)} placeholder="e.g. C1" />
          </label>
          <label>
            Impact
            <select value={form.impact_level ?? 'High'} onChange={(e) => updateField('impact_level', e.target.value)}>
              {IMPACT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="span-full">
            Challenge *
            <input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Recurring cross-transcript challenge title" />
          </label>
          <label>
            Category
            <select value={form.category ?? 'Other'} onChange={(e) => updateField('category', e.target.value)}>
              {CATEGORY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
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
            <textarea rows={2} value={form.description ?? ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Short customer-facing challenge summary" />
          </label>
          <label className="span-full">
            Primary effect
            <textarea rows={2} value={form.primary_effect ?? ''} onChange={(e) => updateField('primary_effect', e.target.value)} placeholder="How this challenge affects the estate or delivery model" />
          </label>
          <label className="span-full">
            Why it matters
            <textarea rows={3} value={form.why_it_matters ?? ''} onChange={(e) => updateField('why_it_matters', e.target.value)} placeholder="Why this challenge matters in customer terms" />
          </label>
          <label className="span-full">
            Evidence sources
            <input value={(form.evidence_sources ?? []).join(', ')} onChange={(e) => updateField('evidence_sources', e.target.value.split(',').map((part) => part.trim()).filter(Boolean))} placeholder="e.g. INIT, KICK, AZ" />
          </label>
          <label className="span-full">
            Capability opportunities
            <textarea rows={3} value={(form.capability_opportunities ?? []).join('\n')} onChange={(e) => updateField('capability_opportunities', e.target.value.split(/\r?\n/).map((part) => part.trim()).filter(Boolean))} placeholder="One capability/upskilling opportunity per line" />
          </label>
          <label className="span-full">
            Notes
            <textarea rows={2} value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Future update notes or reconciliation reminders" />
          </label>
        </div>

        <div className="crud-form-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
          </button>
          <button className="btn" onClick={resetForm}>Cancel</button>
        </div>
      </SidePanel>

      <SidePanel open={!!viewingItem} title="Edit Challenge" onClose={() => setViewingItem(null)}>
        {viewingItem && (
          <div className="detail-view-stack">
            <div className="detail-view-intro">
              <h4>{[viewingItem.challenge_id, viewingItem.title].filter(Boolean).join(' ')}</h4>
              <p>{viewingItem.description || 'No summary captured yet.'}</p>
            </div>
            <div className="detail-view-meta">
              <span>{viewingItem.impact_level}</span>
              {viewingItem.category && <span>{viewingItem.category}</span>}
              {viewingItem.reinforcement_level && <span>{viewingItem.reinforcement_level}</span>}
              {viewingItem.validation_status && <span>{viewingItem.validation_status}</span>}
              <span>{viewingItem.manual_entry ? 'Manual entry' : 'Transcript-aligned'}</span>
            </div>
            {viewingItem.primary_effect && (
              <div className="detail-view-section">
                <strong>Primary effect</strong>
                <p>{viewingItem.primary_effect}</p>
              </div>
            )}
            {viewingItem.why_it_matters && (
              <div className="detail-view-section">
                <strong>Why it matters</strong>
                <p>{viewingItem.why_it_matters}</p>
              </div>
            )}
            {viewingItem.capability_opportunities && viewingItem.capability_opportunities.length > 0 && (
              <div className="detail-view-section">
                <strong>Capability opportunities</strong>
                <p>{viewingItem.capability_opportunities.join('; ')}</p>
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
        <p className="loading-text">Loading challenges…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">No challenges defined yet. Click "+ Add Challenge" to get started.</p>
      ) : (
        <DataTable data={items} columns={columns} exportFileName="challenges" stickyFirstColumn enableRowSelection onSelectionChange={setSelectedItems} />
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete challenge"
        message="Delete this challenge? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showBulkDelete}
        title="Delete selected challenges"
        message={`Delete ${selectedItems.length} selected challenge(s)? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </PageLayout>
  );
}
