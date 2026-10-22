/**
 * DataPull — atomic all-or-nothing data fetch page with live progress tracker.
 *
 * When the user starts a data pull:
 *  1. Connects via SSE to the backend orchestrator.
 *  2. Displays real-time per-module progress.
 *  3. If ALL modules succeed → backend commits to DB and cache is refreshed from snapshot.
 *  4. If ANY module fails  → nothing is written; previous data stays intact.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from '../components/shared/DataTable';
import { RAGStatus } from '../components/shared/RAGStatus';
import { useProfile } from '../hooks/useProfile';
import { profilesApi } from '../api/profiles';
import { dataGapsApi } from '../api/dataGaps';
import { useModuleData } from '../hooks/useModuleData';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { bumpDataVersion } from '../hooks/useAppSettings';
import { buildContextKey, clearContextModuleCache, writeModuleCache } from '../cache/moduleCache';
import { normalizeModuleCacheData } from '../cache/normalizeModuleData';
import { API_BASE } from '../config';
import { sessionFetch } from '../api/localSession';
import {
  Database,
  CheckCircle2,
  XCircle,
  Circle,
  Trash2,
  Play,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  Info,
} from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import type { DataGap } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

type PullPhase = 'idle' | 'running' | 'committing' | 'success' | 'failed' | 'error';

interface StepState {
  name: string;
  moduleKey: string;
  status: 'pending' | 'fetching' | 'success' | 'failed';
  error?: string;
}

interface LastPullInfo {
  has_data: boolean;
  module_count: number;
  snapshot_at: string | null;
  expected_modules: number;
}

const gapColumn = createColumnHelper<DataGap>();

const DATA_GAP_COLUMNS = [
  gapColumn.accessor('module', { header: 'Module' }),
  gapColumn.accessor('severity', {
    header: 'Severity',
    cell: (info) => {
      const v = info.getValue();
      const status = v === 'high' ? 'red' : v === 'medium' ? 'amber' : 'green';
      return <RAGStatus status={status} label={v} />;
    },
  }),
  gapColumn.accessor((row) => row.field ?? row.missing_data, { id: 'field', header: 'Field' }),
  gapColumn.accessor('reason', { header: 'Reason' }),
  gapColumn.accessor((row) => row.remediation ?? row.recommendation, { id: 'remediation', header: 'Remediation' }),
];

// ─── SSE event parsers ──────────────────────────────────────────────────────

interface SSEChunk {
  event: string;
  data: Record<string, unknown>;
}

function parseSSEBuffer(buffer: string): { events: SSEChunk[]; remaining: string } {
  const events: SSEChunk[] = [];
  let remaining = buffer;

  while (true) {
    const idx = remaining.indexOf('\n\n');
    if (idx === -1) break;

    const raw = remaining.slice(0, idx);
    remaining = remaining.slice(idx + 2);

    let eventType = 'message';
    let dataStr = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr += line.slice(6);
      else if (line.startsWith(':')) continue; // SSE comment
    }

    if (!dataStr) continue;
    try {
      events.push({ event: eventType, data: JSON.parse(dataStr) });
    } catch {
      // Ignore malformed JSON
    }
  }

  return { events, remaining };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function DataPull() {
  const [phase, setPhase] = useState<PullPhase>('idle');
  const [steps, setSteps] = useState<StepState[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [lastPull, setLastPull] = useState<LastPullInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const { activeProfile } = useProfile();
  const dataGaps = useModuleData<DataGap[]>(() => dataGapsApi.list(), [], {
    cacheKey: MODULE_CACHE_KEYS.dataGaps,
  });
  const profileId = activeProfile?.id ?? null;

  // Track current profileId so in-flight callbacks can detect stale responses.
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;

  // ── Load last-pull metadata on mount ────────────────────────
  const refreshLastPull = useCallback(() => {
    const pid = profileId;
    if (!pid) return Promise.resolve();
    return sessionFetch(`${API_BASE}/api/data-pull/last/${pid}`)
      .then((r) => r.json())
      .then((d) => {
        if (profileIdRef.current === pid) setLastPull(d as LastPullInfo);
      })
      .catch(() => {});
  }, [profileId]);

  const refreshDataGapsCache = useCallback(async () => {
    if (!profileId) return;
    try {
      const gaps = await dataGapsApi.list();
      writeModuleCache(buildContextKey(profileId), 'data_gaps.list', normalizeModuleCacheData('data_gaps.list', gaps));
      bumpDataVersion();
    } catch {
      // Best-effort sync only.
    }
  }, [profileId]);

  useEffect(() => {
    void refreshLastPull();
  }, [refreshLastPull]);

  // ── Cleanup SSE connection on unmount ───────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Start the pull ───────────────────────────────────────
  async function startPull() {
    if (!profileId) {
      setErrorMessage('No active profile. Select a profile from the header first.');
      setPhase('error');
      return;
    }

    setPhase('running');
    setSteps([]);
    setErrorMessage('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await sessionFetch(
        `${API_BASE}/api/data-pull/stream/${profileId}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error((err as { detail?: string }).detail || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { events, remaining } = parseSSEBuffer(buffer);
        buffer = remaining;

        for (const evt of events) {
          handleSSEEvent(evt.event, evt.data);
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setErrorMessage((err as Error).message || 'Connection lost');
      setPhase('error');
    }
  }

  // ── Handle each SSE event ─────────────────────────────────
  // (using ref-stable handler to avoid stale closure issues)
  function handleSSEEvent(eventType: string, data: Record<string, unknown>) {
    switch (eventType) {
      case 'start': {
        const manifest = data.steps as { name: string; module_key: string }[];
        setSteps(
          manifest.map((s) => ({
            name: s.name,
            moduleKey: s.module_key,
            status: 'pending' as const,
          })),
        );
        break;
      }

      case 'progress': {
        const idx = (data.step as number) - 1;
        setSteps((prev) => {
          const next = [...prev];
          if (next[idx]) {
            next[idx] = {
              ...next[idx],
              status: data.status as StepState['status'],
              error: data.error as string | undefined,
            };
          }
          return next;
        });
        break;
      }

      case 'complete':
        setPhase('committing');
        void populateCacheFromSnapshot();
        break;

      case 'failed':
        setPhase('failed');
        setErrorMessage(
          `${data.failed} of ${data.total} modules failed. Data was NOT saved — previous pull remains intact.`,
        );
        void refreshDataGapsCache();
        void refreshLastPull();
        break;

      case 'error':
        setPhase('error');
        setErrorMessage(
          (data.message as string) || (data.error as string) || 'Unknown error',
        );
        void refreshDataGapsCache();
        void refreshLastPull();
        break;
    }
  }

  async function populateCacheFromSnapshot() {
    if (!profileId) return;
    try {
      const snapshot = await profilesApi.loadSnapshot(profileId);
      const contextKey = buildContextKey(profileId);
      clearContextModuleCache(contextKey);

      for (const [moduleKey, moduleData] of Object.entries(snapshot.modules)) {
        writeModuleCache(contextKey, moduleKey, normalizeModuleCacheData(moduleKey, moduleData));
      }

      bumpDataVersion();
      await refreshDataGapsCache();
      await refreshLastPull();
      setPhase('success');
    } catch {
      bumpDataVersion();
      await refreshDataGapsCache();
      await refreshLastPull();
      setPhase('success');
      setErrorMessage('Data was saved, but cache refresh fell back to direct snapshot loading.');
    }
  }

  // ── Wipe all data ──────────────────────────────────────────
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  const wipeData = useCallback(async () => {
    if (!profileId) return;

    setIsWiping(true);
    try {
      await sessionFetch(`${API_BASE}/api/data-pull/wipe/${profileId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      await dataGapsApi.clear().catch(() => {});
      clearContextModuleCache(buildContextKey(profileId));
      bumpDataVersion();

      setSteps([]);
      setPhase('idle');
      setErrorMessage('');
      setLastPull({ has_data: false, module_count: 0, snapshot_at: null, expected_modules: 32 });
    } catch (err) {
      setErrorMessage(`Wipe failed: ${(err as Error).message}`);
    } finally {
      setIsWiping(false);
    }
  }, [profileId]);

  // ── Derived values ─────────────────────────────────────────
  const successCount = steps.filter((s) => s.status === 'success').length;
  const failedCount = steps.filter((s) => s.status === 'failed').length;
  const completedCount = successCount + failedCount;
  const totalCount = steps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isRunning = phase === 'running' || phase === 'committing';
  const canStart = !isRunning && !!profileId;

  // ── Status icon per step ───────────────────────────────────
  const statusIcon = (status: StepState['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={16} className="dp-icon dp-icon-success" />;
      case 'failed':
        return <XCircle size={16} className="dp-icon dp-icon-failed" />;
      case 'fetching':
        return (
          <div aria-hidden="true" className="dp-icon dp-icon-fetching">
            <Skeleton className="dp-icon-fetching--skeleton" />
          </div>
        );
      default:
        return <Circle size={16} className="dp-icon dp-icon-pending" />;
    }
  };

  // ── Format timestamp ───────────────────────────────────────
  const fmtDate = (iso: string | null) => {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      <div className="dp-page">
        {/* Page header */}
        <div className="dp-page-header">
          <div className="dp-page-title-row">
            <Database size={28} className="dp-page-icon" />
            <div>
              <h1 className="dp-page-title">Data pull</h1>
              <p className="dp-page-subtitle">
                Fetch all assessment data from Azure. Data is only saved when every module succeeds.
              </p>
            </div>
          </div>
        </div>

        {/* Last pull info card */}
        {lastPull && phase === 'idle' && (
          <div className="dp-info-card">
            <Info size={16} />
            <span>
              {lastPull.has_data
                ? `Last successful pull: ${fmtDate(lastPull.snapshot_at)} — ${lastPull.module_count}/${lastPull.expected_modules} modules`
                : 'No assessment data exists yet. Run a data pull to get started.'}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="dp-actions">
          {canStart && (
            <>
              <button className="dp-btn dp-btn-primary" onClick={startPull}>
                {phase === 'failed' || phase === 'error' ? (
                  <>
                    <RotateCcw size={16} />
                    Retry data pull
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Start data pull
                  </>
                )}
              </button>
              <button
                className="dp-btn dp-btn-danger"
                onClick={() => setShowWipeConfirm(true)}
                disabled={isWiping}
              >
                <Trash2 size={16} />
                {isWiping ? 'Wiping...' : 'Wipe all data'}
              </button>
            </>
          )}
          {phase === 'success' && (
            <button className="dp-btn dp-btn-primary" onClick={() => navigate('/')}>
              <ArrowRight size={16} />
              Go to dashboard
            </button>
          )}
        </div>

        {/* Success banner */}
        {phase === 'success' && (
          <div className="dp-banner dp-banner-success">
            <CheckCircle2 size={18} />
            <span>
              All {totalCount} modules fetched and saved successfully. Your assessment data is
              complete and up to date.
            </span>
          </div>
        )}

        {/* Error / failure banner */}
        {errorMessage && phase !== 'success' && (
          <div className={`dp-banner ${phase === 'failed' ? 'dp-banner-warn' : 'dp-banner-error'}`}>
            {phase === 'failed' ? <AlertTriangle size={18} /> : <XCircle size={18} />}
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Progress bar */}
        {(isRunning || phase === 'success' || phase === 'failed') && totalCount > 0 && (
          <div className="dp-progress-section">
            <div className="dp-progress-header">
              <span className="dp-progress-label">
                {phase === 'running'
                  ? 'Fetching…'
                  : phase === 'committing'
                    ? 'Saving to database…'
                    : phase === 'success'
                      ? 'Complete'
                      : 'Stopped'}
              </span>
              <span className="dp-progress-count">
                {completedCount} / {totalCount}
                {failedCount > 0 && (
                  <span className="dp-progress-failed-count"> ({failedCount} failed)</span>
                )}
              </span>
            </div>
            <div className="dp-progress-track">
              <div
                className={[
                  'dp-progress-fill',
                  failedCount > 0 ? 'dp-progress-fill--warn' : '',
                  phase === 'success' ? 'dp-progress-fill--done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Step list */}
        {steps.length > 0 && (
          <div className="dp-step-list">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={[
                  'dp-step',
                  step.status === 'fetching' ? 'dp-step--active' : '',
                  step.status === 'success' ? 'dp-step--success' : '',
                  step.status === 'failed' ? 'dp-step--failed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {statusIcon(step.status)}
                <span className="dp-step-name">{step.name}</span>
                {step.error && <span className="dp-step-error">{step.error}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Idle help text */}
        {phase === 'idle' && steps.length === 0 && (
          <div className="dp-help">
            <h3>How it works</h3>
            <ol>
              <li>
                Click <strong>Start data pull</strong> to begin fetching all assessment data from your
                Azure tenant.
              </li>
              <li>
                Each module is fetched one at a time. Progress is shown in real-time above.
              </li>
              <li>
                <strong>All-or-nothing:</strong> data is only saved to the database when every single
                module succeeds. If any module fails, the previous pull remains intact.
              </li>
              <li>
                Use <strong>Wipe all data</strong> to clear existing assessment data and start fresh.
              </li>
            </ol>
            <h3>Access needed</h3>
            <p>
              For the best pull coverage, the signed-in identity should have read-only Azure access
              across the in-scope subscriptions, including <strong>Reader</strong>,{' '}
              <strong>Cost Management Reader</strong>, and visibility to security reporting such as
              Defender and Advisor. If Dynamics 365 is in scope, Dataverse read access is also
              needed in each target environment, and some Business Central views may still depend on
              access or licensing being available.
            </p>
          </div>
        )}

        <div className="dp-help dp-help--spaced">
          <h3>Latest data gaps</h3>
          <p>
            This section shows the current gap list for the active profile. It refreshes after each successful
            pull so the table always reflects the most recently saved snapshot.
          </p>
          {lastPull && (
            <p className="section-note">
              Last successful pull: {lastPull.has_data
                ? `${fmtDate(lastPull.snapshot_at)} (${lastPull.module_count}/${lastPull.expected_modules} modules saved)`
                : 'No successful pull saved yet'}.
            </p>
          )}
          {dataGaps.status === 'success' && dataGaps.data ? (
            dataGaps.data.length === 0 ? (
              <p className="empty-state">No data gaps detected. All modules returned complete data.</p>
            ) : (
              <>
                <p>{dataGaps.data.length} gap(s) found across modules.</p>
                <DataTable data={dataGaps.data} columns={DATA_GAP_COLUMNS} exportFileName="data gaps" />
              </>
            )
          ) : dataGaps.status === 'error' ? (
            <p className="error-text">Failed to load data gaps: {dataGaps.error}</p>
          ) : (
            <p className="loading-text">Loading data gaps…</p>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={showWipeConfirm}
        title="Wipe all data"
        message="This will permanently delete all assessment data for this profile. Continue?"
        confirmLabel="Wipe"
        onConfirm={() => { setShowWipeConfirm(false); wipeData(); }}
        onCancel={() => setShowWipeConfirm(false)}
      />
    </>
  );
}
