/**
 * AppPortfolio.tsx — application portfolio with TIME classification.
 * Full CRUD: add, edit inline, delete applications.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { DataTable } from '../components/shared/DataTable';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { SidePanel } from '../components/shared/SidePanel';
import { useProfile } from '../hooks/useProfile';
import { portfolioApi } from '../api/portfolio';
import type { AppPortfolioEntry, AppPortfolioEntryCreate } from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../utils/formatters';
import { isRequestCancellationError } from '../utils/requestErrors';
import { Pencil, Trash2 } from 'lucide-react';
import { PortfolioMatrix } from '../components/charts/PortfolioMatrix';

/* ── constants ─────────────────────────────────────────────────────── */

const CRITICALITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const STATUS_OPTIONS = ['Active', 'Retiring', 'Planned', 'Decommissioned'];
const SUPPORT_OPTIONS = ['Internal', 'Vendor Managed', 'Co-Managed', 'Community', 'None'];
const TIME_OPTIONS = ['Invest', 'Migrate', 'Tolerate', 'Eliminate'];
const TIME_LEGEND = [
  { letter: 'I', value: 'Invest', meaning: 'High business value and strong technical fit. Continue investing and scaling deliberately.' },
  { letter: 'M', value: 'Migrate', meaning: 'High business value but weaker technical fit. Prioritise transition or modernisation.' },
  { letter: 'T', value: 'Tolerate', meaning: 'Lower business value but acceptable technical fit. Keep stable with controlled effort.' },
  { letter: 'E', value: 'Eliminate', meaning: 'Lower business value and weaker technical fit. Consider retirement or replacement.' },
];

const emptyForm: AppPortfolioEntryCreate = {
  app_name: '',
  purpose: '',
  business_owner: '',
  technical_owner: '',
  vendor: '',
  support_model: '',
  current_hosting: '',
  criticality: 'Medium',
  status: 'Active',
  monthly_cost: undefined,
  business_value: undefined,
  technical_fitness: undefined,
  strategic_fit: undefined,
  time_classification: '',
  future_state: '',
  known_risks: '',
  notes: '',
};

/* ── helpers ───────────────────────────────────────────────────────── */

function computeTIME(bv?: number | null, tf?: number | null): string {
  if (bv == null || tf == null) return '—';
  if (bv >= 4 && tf >= 4) return 'Invest';
  if (bv >= 4 && tf < 4) return 'Migrate';
  if (bv < 4 && tf >= 4) return 'Tolerate';
  return 'Eliminate';
}

function hostingTone(hosting?: string | null): string {
  const value = (hosting ?? '').toLowerCase();
  if (value.includes('aws')) return 'amber';
  if (value.includes('azure')) return 'blue';
  if (value.includes('saa')) return 'green';
  if (value.includes('legacy') || value.includes('vendor')) return 'rose';
  return 'slate';
}

/* ── column defs ───────────────────────────────────────────────────── */

const col = createColumnHelper<AppPortfolioEntry>();

function buildColumns(
  onEdit: (entry: AppPortfolioEntry) => void,
  onDelete: (id: number) => void,
) {
  return [
    col.accessor('app_name', { header: 'Application' }),
    col.accessor((r) => r.purpose ?? '', { id: 'purpose', header: 'Purpose' }),
    col.accessor('business_owner', { header: 'Business Owner' }),
    col.accessor((r) => r.technical_owner ?? '', { id: 'technical_owner', header: 'Technical Owner' }),
    col.accessor((r) => r.vendor ?? '', { id: 'vendor', header: 'Vendor' }),
    col.accessor((r) => r.support_model ?? '', { id: 'support_model', header: 'Support Model' }),
    col.accessor((r) => r.current_hosting ?? '', { id: 'current_hosting', header: 'Current Hosting' }),
    col.accessor((r) => r.business_criticality ?? r.criticality ?? '', {
      id: 'criticality',
      header: 'Criticality',
    }),
    col.accessor('status', { header: 'Status' }),
    col.accessor((r) => r.future_state ?? '', { id: 'future_state', header: 'Future State' }),
    col.accessor('time_classification', {
      header: 'TIME',
      cell: (info) => {
        const v = info.getValue();
        return v
          ? <span className={`time-badge time-${v.toLowerCase()}`}>{v}</span>
          : '—';
      },
    }),
    col.accessor('monthly_cost', {
      header: 'Monthly Cost',
      cell: (info) => info.getValue() ? formatCurrency(Number(info.getValue())) : '—',
    }),
    col.accessor((r) => r.known_risks ?? '', { id: 'known_risks', header: 'Known Risks' }),
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

export default function AppPortfolio() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  const [apps, setApps] = useState<AppPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AppPortfolioEntryCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState('');
  const requestSeqRef = useRef(0);
  const saveSeqRef = useRef(0);
  const deleteSeqRef = useRef(0);
  const profileEpochRef = useRef(0);

  /* ── load data ───────────────────────────────────────────────────── */

  const loadApps = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const data = await portfolioApi.list(profileId);
      if (requestSeqRef.current === requestSeq) {
        setApps(data);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load portfolio entries', err);
      }
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [profileId]);

  /* ── form helpers ────────────────────────────────────────────────── */

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (entry: AppPortfolioEntry) => {
    setForm({
      app_name: entry.app_name,
      purpose: entry.purpose ?? '',
      business_owner: entry.business_owner ?? '',
      technical_owner: entry.technical_owner ?? '',
      vendor: entry.vendor ?? '',
      support_model: entry.support_model ?? '',
      current_hosting: entry.current_hosting ?? '',
      criticality: entry.criticality ?? 'Medium',
      status: entry.status ?? 'Active',
      monthly_cost: entry.monthly_cost ?? undefined,
      business_value: entry.business_value ?? undefined,
      technical_fitness: entry.technical_fitness ?? undefined,
      strategic_fit: entry.strategic_fit ?? undefined,
      time_classification: entry.time_classification ?? '',
      future_state: entry.future_state ?? '',
      known_risks: entry.known_risks ?? '',
      notes: entry.notes ?? '',
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedApps, setSelectedApps] = useState<AppPortfolioEntry[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  useEffect(() => {
    profileEpochRef.current += 1;
    requestSeqRef.current += 1;
    saveSeqRef.current += 1;
    deleteSeqRef.current += 1;
    setApps([]);
    setSelectedApps([]);
    setShowBulkDelete(false);
    setDeleteId(null);
    setEditingId(null);
    setShowForm(false);
    setForm({ ...emptyForm });
    setOperationError('');
    setLoading(false);
    setSaving(false);
    if (profileId) {
      void loadApps();
    }
  }, [loadApps, profileId]);

  const handleDelete = async (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      await portfolioApi.delete(deleteId);
      if (deleteSeqRef.current !== deleteSeq) return;
      setDeleteId(null);
      if (requestSeqRef.current === requestSeq) {
        await loadApps();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to delete portfolio entry', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete application.');
      }
    }
  };

  const confirmBulkDelete = async () => {
    const requestSeq = requestSeqRef.current;
    const deleteSeq = ++deleteSeqRef.current;
    setOperationError('');
    try {
      for (const app of selectedApps) {
        await portfolioApi.delete(app.id);
        if (deleteSeqRef.current !== deleteSeq) return;
      }
      if (deleteSeqRef.current !== deleteSeq) return;
      setShowBulkDelete(false);
      setSelectedApps([]);
      if (requestSeqRef.current === requestSeq) {
        await loadApps();
      }
    } catch (err) {
      if (!isRequestCancellationError(err) && deleteSeqRef.current === deleteSeq) {
        console.error('Failed to bulk delete portfolio entries', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to delete selected applications.');
      }
    }
  };

  const handleSave = async () => {
    if (!profileId || !form.app_name.trim()) return;
    const profileEpoch = profileEpochRef.current;
    const saveSeq = ++saveSeqRef.current;
    setOperationError('');
    setSaving(true);
    try {
      if (editingId) {
        await portfolioApi.update(editingId, form);
      } else {
        await portfolioApi.create(profileId, form);
      }
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadApps();
    } catch (err) {
      if (!isRequestCancellationError(err) && saveSeqRef.current === saveSeq) {
        console.error('Failed to save portfolio entry', err);
        setOperationError(err instanceof Error ? err.message : 'Failed to save application.');
      }
    } finally {
      if (saveSeqRef.current === saveSeq) {
        setSaving(false);
      }
    }
  };

  const updateField = <K extends keyof AppPortfolioEntryCreate>(
    key: K,
    value: AppPortfolioEntryCreate[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const columns = buildColumns(handleEdit, handleDelete);

  /* ── render ──────────────────────────────────────────────────────── */

  if (!profileId) {
    return (
      <PageLayout title="Application Portfolio" exportId="portfolio-page">
        <p className="empty-state">Select a customer profile to view the application portfolio.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Application Portfolio" exportId="portfolio-page">
      {/* toolbar */}
      <div className="profiles-toolbar">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Application
        </button>
        {selectedApps.length > 0 && (
          <button className="btn btn-danger" onClick={() => setShowBulkDelete(true)}>
            <Trash2 size={15} /> Delete {selectedApps.length} selected
          </button>
        )}
      </div>
      {operationError && <p className="error-text">{operationError}</p>}

      <SidePanel open={showForm} title={editingId ? 'Edit Application' : 'New Application'} onClose={resetForm}>
          <div className="crud-form-grid">
            <label>
              App Name *
              <input value={form.app_name} onChange={(e) => updateField('app_name', e.target.value)} placeholder="e.g. Dynamics 365 Finance" />
            </label>
            <label className="span-full">
              Purpose
              <input value={form.purpose ?? ''} onChange={(e) => updateField('purpose', e.target.value)} placeholder="What does this application do?" />
            </label>
            <label>
              Business Owner
              <input value={form.business_owner ?? ''} onChange={(e) => updateField('business_owner', e.target.value)} placeholder="Owner name" />
            </label>
            <label>
              Technical Owner
              <input value={form.technical_owner ?? ''} onChange={(e) => updateField('technical_owner', e.target.value)} placeholder="Tech owner" />
            </label>
            <label>
              Vendor
              <input value={form.vendor ?? ''} onChange={(e) => updateField('vendor', e.target.value)} placeholder="e.g. Microsoft" />
            </label>
            <label>
              Support Model
              <select value={form.support_model ?? ''} onChange={(e) => updateField('support_model', e.target.value)}>
                <option value="">— Select —</option>
                {SUPPORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Current Hosting
              <input value={form.current_hosting ?? ''} onChange={(e) => updateField('current_hosting', e.target.value)} placeholder="e.g. Azure, AWS, SaaS, Vendor-hosted" />
            </label>
            <label>
              Criticality
              <select value={form.criticality ?? 'Medium'} onChange={(e) => updateField('criticality', e.target.value)}>
                {CRITICALITY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={form.status ?? 'Active'} onChange={(e) => updateField('status', e.target.value)}>
                {STATUS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Monthly Cost ($)
              <input type="number" min={0} value={form.monthly_cost ?? ''} onChange={(e) => updateField('monthly_cost', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Business Value (1-5)
              <input type="number" min={1} max={5} value={form.business_value ?? ''} onChange={(e) => updateField('business_value', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Technical Fitness (1-5)
              <input type="number" min={1} max={5} value={form.technical_fitness ?? ''} onChange={(e) => updateField('technical_fitness', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              Strategic Fit (1-10)
              <input type="number" min={1} max={10} value={form.strategic_fit ?? ''} onChange={(e) => updateField('strategic_fit', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
            <label>
              TIME Classification
              <select value={form.time_classification ?? ''} onChange={(e) => updateField('time_classification', e.target.value)}>
                <option value="">— Use score-based suggestion —</option>
                {TIME_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              Future State
              <input value={form.future_state ?? ''} onChange={(e) => updateField('future_state', e.target.value)} placeholder="e.g. Migrate to SaaS" />
            </label>
            <label className="span-full">
              Known Risks
              <textarea rows={2} value={form.known_risks ?? ''} onChange={(e) => updateField('known_risks', e.target.value)} placeholder="Known issues, risks, or concerns…" />
            </label>
            <label className="span-full">
              Notes
              <textarea rows={2} value={form.notes ?? ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Additional notes…" />
            </label>
          </div>

          {/* TIME preview */}
          {(form.business_value != null && form.technical_fitness != null) && (
            <p className="time-preview">
              Suggested TIME from score: <strong className={`time-badge time-${computeTIME(form.business_value, form.technical_fitness).toLowerCase()}`}>
                {computeTIME(form.business_value, form.technical_fitness)}
              </strong>
            </p>
          )}

          {form.time_classification && (
            <p className="time-preview">
              Stored TIME classification: <strong className={`time-badge time-${form.time_classification.toLowerCase()}`}>
                {form.time_classification}
              </strong>
            </p>
          )}

          <div className="crud-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.app_name.trim()}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
            </button>
            <button className="btn" onClick={resetForm}>Cancel</button>
          </div>
      </SidePanel>

      {/* table */}
      {loading ? (
        <p className="loading-text">Loading portfolio…</p>
      ) : apps.length === 0 ? (
        <p className="empty-state">No applications in portfolio yet. Click "+ Add Application" to get started.</p>
      ) : (
        <>
          <PortfolioSummary apps={apps} />
          <section className="portfolio-panel portfolio-panel--matrix">
            <div className="portfolio-panel__header">
              <div>
                <h3>Portfolio matrix</h3>
                <p>Applications positioned by business value and technical fitness to support TIME-style discussion.</p>
              </div>
            </div>
            <PortfolioMatrix apps={apps} />
          </section>
          <PortfolioOverview apps={apps} />
          <section className="portfolio-panel">
            <div className="portfolio-panel__header">
              <div>
                <h3>Detailed register</h3>
                <p>Working application register for customer review, export, and refinement.</p>
              </div>
            </div>
            <div className="time-legend" aria-label="TIME legend">
              {TIME_LEGEND.map((item) => (
                <div key={item.value} className="time-legend__item">
                  <span className={`time-badge time-${item.value.toLowerCase()}`}>{item.letter}</span>
                  <div>
                    <strong>{item.value}</strong>
                    <p>{item.meaning}</p>
                  </div>
                </div>
              ))}
            </div>
            <DataTable data={apps} columns={columns} exportFileName="application-portfolio" enableRowSelection onSelectionChange={setSelectedApps} />
          </section>
        </>
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete application"
        message="Delete this application from the portfolio? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showBulkDelete}
        title="Delete selected applications"
        message={`Delete ${selectedApps.length} selected application(s)? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDelete(false)}
      />
    </PageLayout>
  );
}

function PortfolioSummary({ apps }: { apps: AppPortfolioEntry[] }) {
  const active = apps.filter((app) => app.status === 'Active').length;
  const critical = apps.filter((app) => (app.business_criticality ?? app.criticality) === 'Critical').length;
  const hostedPlatforms = new Set(apps.map((app) => (app.current_hosting ?? '').trim()).filter(Boolean)).size;
  return (
    <div className="portfolio-summary-grid">
      <div className="portfolio-summary-card portfolio-summary-card--blue">
        <span className="portfolio-summary-label">Applications</span>
        <strong>{apps.length}</strong>
        <p>Current portfolio entries derived from transcript evidence and discovery context.</p>
      </div>
      <div className="portfolio-summary-card portfolio-summary-card--green">
        <span className="portfolio-summary-label">Active</span>
        <strong>{active}</strong>
        <p>Applications currently treated as live operating services.</p>
      </div>
      <div className="portfolio-summary-card portfolio-summary-card--amber">
        <span className="portfolio-summary-label">Critical</span>
        <strong>{critical}</strong>
        <p>High-business-impact applications that need stronger support confidence.</p>
      </div>
      <div className="portfolio-summary-card portfolio-summary-card--rose">
        <span className="portfolio-summary-label">Hosting spread</span>
        <strong>{hostedPlatforms}</strong>
        <p>Distinct hosting patterns currently represented across the application estate.</p>
      </div>
    </div>
  );
}

function PortfolioOverview({ apps }: { apps: AppPortfolioEntry[] }) {
  return (
    <section className="portfolio-overview-section">
      <div className="portfolio-panel__header">
        <div>
          <h3>Application context</h3>
          <p>Short customer-facing context for each application, using the transcript set and current discovery signals.</p>
        </div>
      </div>
      <div className="portfolio-overview-grid">
        {apps.map((app) => (
          <article key={app.id} className={`portfolio-overview-card portfolio-overview-card--${hostingTone(app.current_hosting)}`}>
            <div className="portfolio-overview-topline">
              <div>
                <h4>{app.app_name}</h4>
                <p>{app.purpose || 'No purpose recorded yet.'}</p>
              </div>
              <span className={`priority-badge priority-${(app.business_criticality ?? app.criticality ?? 'medium').toLowerCase()}`}>
                {app.business_criticality ?? app.criticality ?? 'Unrated'}
              </span>
            </div>
            <div className="portfolio-overview-meta">
              {app.current_hosting && <span>{app.current_hosting}</span>}
              {app.status && <span>{app.status}</span>}
              {app.support_model && <span>{app.support_model}</span>}
              {app.vendor && <span>{app.vendor}</span>}
            </div>
            {(app.business_owner || app.technical_owner) && (
              <div className="portfolio-overview-owner">
                Owner: {[app.business_owner, app.technical_owner].filter(Boolean).join(' / ')}
              </div>
            )}
            {app.future_state && (
              <p className="portfolio-overview-detail"><strong>Future state:</strong> {app.future_state}</p>
            )}
            {app.known_risks && (
              <p className="portfolio-overview-detail"><strong>Known risks:</strong> {app.known_risks}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
