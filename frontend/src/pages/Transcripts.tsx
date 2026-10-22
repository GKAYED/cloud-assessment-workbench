import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Pencil, Plus, ScrollText, Trash2, Upload } from 'lucide-react';
import { transcriptsApi } from '../api/transcripts';
import { PageLayout } from '../components/layout/PageLayout';
import { SidePanel } from '../components/shared/SidePanel';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useProfile } from '../hooks/useProfile';
import type {
  ExistingMarkdownContent,
  ExistingMarkdownReference,
  Transcript,
  TranscriptArtifact,
  TranscriptCreate,
  TranscriptProcessingStatus,
  TranscriptTargetCreate,
} from '../types';
import { isRequestCancellationError } from '../utils/requestErrors';

const emptyForm: TranscriptCreate = {
  title: '',
  source_label: '',
  transcript_text: '',
  extraction_targets: [],
};

function parseTargets(input: string): TranscriptTargetCreate[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split('|');
      return {
        name: name.trim(),
        description: rest.join('|').trim() || undefined,
      };
    })
    .filter((target) => target.name);
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function Transcripts() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;

  const [items, setItems] = useState<Transcript[]>([]);
  const [references, setReferences] = useState<ExistingMarkdownReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<TranscriptCreate>({ ...emptyForm });
  const [targetInput, setTargetInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<TranscriptArtifact | null>(null);
  const [artifactDraft, setArtifactDraft] = useState('');
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [selectedReference, setSelectedReference] = useState<ExistingMarkdownContent | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [processingStatus, setProcessingStatus] = useState<TranscriptProcessingStatus | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const profileEpochRef = useRef(0);
  const loadRequestSeqRef = useRef(0);
  const referenceRequestSeqRef = useRef(0);

  useEffect(() => {
    profileEpochRef.current += 1;
    loadRequestSeqRef.current += 1;
    referenceRequestSeqRef.current += 1;
    setItems([]);
    setReferences([]);
    setShowCreate(false);
    setForm({ ...emptyForm });
    setTargetInput('');
    setSelectedArtifact(null);
    setSelectedReference(null);
    setDeleteId(null);
    setProcessingStatus(null);
    setOperationError(null);
    setLoading(false);
    setSaving(false);
    setSavingArtifact(false);
  }, [profileId]);

  const loadData = useCallback(async () => {
    if (!profileId) return;
    const profileEpoch = profileEpochRef.current;
    const requestSeq = ++loadRequestSeqRef.current;
    setLoading(true);
    try {
      const [transcripts, repoRefs] = await Promise.all([
        transcriptsApi.list(profileId),
        transcriptsApi.listReferences(),
      ]);
      if (loadRequestSeqRef.current !== requestSeq || profileEpochRef.current !== profileEpoch) return;
      setItems(transcripts);
      setReferences(repoRefs);
      const status = await transcriptsApi.processingStatus();
      if (loadRequestSeqRef.current === requestSeq && profileEpochRef.current === profileEpoch) {
        setProcessingStatus(status);
      }
    } catch (err) {
      if (!isRequestCancellationError(err)) {
        console.error('Failed to load transcripts', err);
      }
    } finally {
      if (loadRequestSeqRef.current === requestSeq && profileEpochRef.current === profileEpoch) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    void loadData();
  }, [loadData, profileId]);

  useEffect(() => {
    setArtifactDraft(selectedArtifact?.markdown_content ?? '');
  }, [selectedArtifact]);

  const summary = useMemo(() => ({
    transcripts: items.length,
    artifacts: items.reduce((sum, item) => sum + item.artifacts.length, 0),
    targets: items.reduce((sum, item) => sum + item.targets.length, 0),
    references: references.length,
  }), [items, references.length]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setTargetInput('');
    setShowCreate(false);
  };

  const updateForm = <K extends keyof TranscriptCreate>(key: K, value: TranscriptCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const text = await file.text();
    if (!form.title.trim()) {
      updateForm('title', file.name.replace(/\.[^.]+$/, ''));
    }
    updateForm('transcript_text', text);
  };

  const handleCreate = async () => {
    if (!profileId || !form.title.trim() || !form.transcript_text.trim()) return;
    const profileEpoch = profileEpochRef.current;
    setSaving(true);
    setOperationError(null);
    try {
      await transcriptsApi.create(profileId, {
        ...form,
        title: form.title.trim(),
        source_label: form.source_label?.trim() || undefined,
        transcript_text: form.transcript_text,
        extraction_targets: parseTargets(targetInput),
      });
      if (profileEpochRef.current !== profileEpoch) return;
      resetForm();
      await loadData();
    } catch (err) {
      if (profileEpochRef.current !== profileEpoch || isRequestCancellationError(err)) return;
      setOperationError(err instanceof Error ? err.message : 'Failed to create transcript workspace.');
    } finally {
      if (profileEpochRef.current === profileEpoch) {
        setSaving(false);
      }
    }
  };

  const handleSaveArtifact = async () => {
    if (!selectedArtifact) return;
    const profileEpoch = profileEpochRef.current;
    setSavingArtifact(true);
    setOperationError(null);
    try {
      const updated = await transcriptsApi.updateArtifact(selectedArtifact.id, {
        markdown_content: artifactDraft,
      });
      if (profileEpochRef.current !== profileEpoch) return;
      setItems((prev) =>
        prev.map((transcript) => ({
          ...transcript,
          artifacts: transcript.artifacts.map((artifact) => artifact.id === updated.id ? updated : artifact),
        })),
      );
      setSelectedArtifact(updated);
    } catch (err) {
      if (profileEpochRef.current !== profileEpoch || isRequestCancellationError(err)) return;
      setOperationError(err instanceof Error ? err.message : 'Failed to save transcript artifact.');
    } finally {
      if (profileEpochRef.current === profileEpoch) {
        setSavingArtifact(false);
      }
    }
  };

  const openReference = async (ref: ExistingMarkdownReference) => {
    const profileEpoch = profileEpochRef.current;
    referenceRequestSeqRef.current += 1;
    const referenceRequestSeq = referenceRequestSeqRef.current;
    setOperationError(null);
    try {
      const content = await transcriptsApi.getReferenceContent(ref.relative_path);
      if (profileEpochRef.current === profileEpoch && referenceRequestSeqRef.current === referenceRequestSeq) {
        setSelectedReference(content);
      }
    } catch (err) {
      if (
        profileEpochRef.current !== profileEpoch
        || referenceRequestSeqRef.current !== referenceRequestSeq
        || isRequestCancellationError(err)
      ) return;
      setOperationError(err instanceof Error ? err.message : 'Failed to open repository reference.');
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    const profileEpoch = profileEpochRef.current;
    setOperationError(null);
    try {
      await transcriptsApi.delete(deleteId);
      if (profileEpochRef.current !== profileEpoch) return;
      setDeleteId(null);
      await loadData();
    } catch (err) {
      if (profileEpochRef.current !== profileEpoch || isRequestCancellationError(err)) return;
      setOperationError(err instanceof Error ? err.message : 'Failed to delete transcript.');
    }
  };

  if (!profileId) {
    return (
      <PageLayout title="Transcripts" subtitle="Store transcripts and generate structured assessment artefacts within the active customer profile.">
        <p className="empty-state">Select a customer profile to work with transcripts and markdown artefacts.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Transcripts"
      subtitle="Store transcripts, generate structured meeting notes, and keep assessment artefacts isolated within the active customer profile."
    >
      <div className="initiative-summary-grid">
        <div className="initiative-summary-card initiative-summary-card--blue">
          <span className="initiative-summary-label">Stored transcripts</span>
          <strong>{summary.transcripts}</strong>
          <p>Profile-scoped transcript records for the active customer.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--green">
          <span className="initiative-summary-label">Generated artefacts</span>
          <strong>{summary.artifacts}</strong>
          <p>Markdown outputs created from transcript processing scaffolds.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--amber">
          <span className="initiative-summary-label">Extraction targets</span>
          <strong>{summary.targets}</strong>
          <p>Requested downstream outputs defined across stored transcripts.</p>
        </div>
        <div className="initiative-summary-card initiative-summary-card--rose">
          <span className="initiative-summary-label">AI processing</span>
          <strong>{processingStatus?.enabled ? 'Ready' : 'Fallback only'}</strong>
          <p>{processingStatus?.enabled ? 'New transcripts will be processed automatically when created.' : 'New transcripts will be scaffolded until AI processing is configured.'}</p>
        </div>
      </div>

      <div className={`transcript-status-banner ${processingStatus?.enabled ? 'transcript-status-banner--ready' : 'transcript-status-banner--fallback'}`}>
        <strong>{processingStatus?.enabled ? 'AI processing configured' : 'AI processing not configured'}</strong>
        <span>
          {processingStatus?.enabled
            ? 'New transcripts should create processed structured notes and extraction artefacts automatically.'
            : 'The workflow still works, but new transcripts will use scaffold markdown until you set AZAUDIT_OPENAI_API_KEY in backend/.env and restart the service.'}
        </span>
      </div>

      {operationError && <p className="error-text">{operationError}</p>}

      <div className="profiles-toolbar transcripts-toolbar">
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add transcript
        </button>
      </div>

      <section className="transcripts-section">
        <div className="transcripts-section__header">
          <div>
            <h3>Profile artefacts</h3>
            <p>Future transcript work lives here under the active profile rather than as customer markdown in the repository.</p>
          </div>
        </div>

        {loading ? (
          <p className="loading-text">Loading transcripts…</p>
        ) : items.length === 0 ? (
          <p className="empty-state">No transcripts stored yet. Add one to scaffold structured meeting notes and extraction artefacts.</p>
        ) : (
          <div className="transcript-list">
            {items.map((item) => (
              <article key={item.id} className="transcript-card">
                <div className="transcript-card__header">
                  <div>
                    <h4>{item.title}</h4>
                    <p>{item.source_label || 'Uploaded transcript'} · {formatDate(item.created_at)} · {item.status}</p>
                  </div>
                  <button className="btn-icon btn-icon-danger" title="Delete transcript" aria-label="Delete transcript" onClick={() => setDeleteId(item.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="transcript-card__excerpt">{item.transcript_text.slice(0, 320)}{item.transcript_text.length > 320 ? '…' : ''}</p>
                <div className="transcript-card__meta">
                  <span>{item.targets.length} target{item.targets.length === 1 ? '' : 's'}</span>
                  <span>{item.artifacts.length} artefact{item.artifacts.length === 1 ? '' : 's'}</span>
                </div>
                {item.targets.length > 0 && (
                  <div className="transcript-target-list">
                    {item.targets.map((target) => (
                      <span key={target.id} className="transcript-target-chip">{target.name}</span>
                    ))}
                  </div>
                )}
                <div className="transcript-artifact-list">
                  {item.artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      className="transcript-artifact-link"
                      onClick={() => setSelectedArtifact(artifact)}
                    >
                      <ScrollText size={15} />
                      <span>{artifact.title}</span>
                      <span className="transcript-artifact-kind">{artifact.kind}</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="transcripts-section">
        <div className="transcripts-section__header">
          <div>
            <h3>Existing repository markdown references</h3>
            <p>Read-only visibility of the markdown files already created in the repository from earlier work.</p>
          </div>
        </div>
        {references.length === 0 ? (
          <p className="empty-state">No markdown references were found under the assessments folder.</p>
        ) : (
          <div className="reference-grid">
            {references.map((ref) => (
              <button key={ref.id} className="reference-card" onClick={() => void openReference(ref)}>
                <ScrollText size={16} />
                <strong>{ref.title}</strong>
                <span>{ref.relative_path}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <SidePanel open={showCreate} title="Add transcript" onClose={resetForm}>
        <div className="crud-form">
          <h4>Transcript input</h4>
          <div className="crud-form-grid">
            <label>
              Title
              <input value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="Transcript title" />
            </label>
            <label>
              Source label
              <input value={form.source_label ?? ''} onChange={(e) => updateForm('source_label', e.target.value)} placeholder="Meeting name, upload label, or source context" />
            </label>
            <label className="span-full">
              Upload file
              <label className="transcript-upload">
                <Upload size={16} />
                <span>Select transcript file</span>
                <input type="file" accept=".txt,.md" onChange={(e) => void handleFile(e.target.files)} />
              </label>
            </label>
            <label className="span-full">
              Transcript text
              <textarea
                rows={12}
                value={form.transcript_text}
                onChange={(e) => updateForm('transcript_text', e.target.value)}
                placeholder="Paste the transcript here or upload a .txt/.md transcript above."
              />
            </label>
            <label className="span-full">
              Extraction targets
              <textarea
                rows={6}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={'One per line. Use "Name | Description" if you want to capture purpose.\nExample:\nCross-transcript challenges | Consolidate recurring organisational challenges\nRecommendations | Capture customer-facing recommendations'}
              />
            </label>
          </div>
          <div className="crud-form-actions">
            <button className="btn" onClick={resetForm}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.title.trim() || !form.transcript_text.trim()}>
              <FileUp size={16} /> {saving ? 'Creating…' : 'Create transcript workspace'}
            </button>
          </div>
        </div>
      </SidePanel>

      <SidePanel open={!!selectedArtifact} title={selectedArtifact?.title ?? 'Markdown artefact'} onClose={() => setSelectedArtifact(null)} className="side-panel--wide">
        <div className="crud-form">
          <h4>Edit markdown artefact</h4>
          {selectedArtifact && (
            <>
              <p className="transcript-panel-meta">{selectedArtifact.description || selectedArtifact.kind}</p>
              <textarea
                className="transcript-markdown-editor"
                rows={24}
                value={artifactDraft}
                onChange={(e) => setArtifactDraft(e.target.value)}
              />
              <div className="crud-form-actions">
                <button className="btn" onClick={() => setSelectedArtifact(null)}>Close</button>
                <button className="btn btn-primary" onClick={() => void handleSaveArtifact()} disabled={savingArtifact}>
                  <Pencil size={16} /> {savingArtifact ? 'Saving…' : 'Save markdown'}
                </button>
              </div>
            </>
          )}
        </div>
      </SidePanel>

      <SidePanel open={!!selectedReference} title={selectedReference?.title ?? 'Markdown reference'} onClose={() => setSelectedReference(null)} className="side-panel--wide">
        <div className="crud-form">
          {selectedReference && (
            <>
              <p className="transcript-panel-meta">{selectedReference.relative_path}</p>
              <pre className="transcript-markdown-viewer">{selectedReference.content}</pre>
            </>
          )}
        </div>
      </SidePanel>

      <ConfirmDialog
        open={deleteId != null}
        title="Delete transcript"
        message="Delete this transcript and all generated artefacts under the active profile?"
        confirmLabel="Delete"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </PageLayout>
  );
}
