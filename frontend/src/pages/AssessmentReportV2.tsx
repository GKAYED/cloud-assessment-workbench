import { useEffect, useMemo, useState } from 'react';

import { Download } from 'lucide-react';

import { PageLayout } from '../components/layout/PageLayout';
import { SectionNav } from '../components/shared/SectionNav';
import { AssessmentReportV2Content } from '../components/report/assessment/AssessmentReportV2Content';
import { useModuleData } from '../hooks/useModuleData';
import { usePdfExport } from '../hooks/usePdfExport';
import { useProfile } from '../hooks/useProfile';
import { useWordExport } from '../hooks/useWordExport';
import { reportInterpretationApi, type ReportInterpretationSectionRecord, type ReportInterpretationStateRecord } from '../api/reportInterpretation';
import { inventoryApi } from '../api/inventory';
import { costsApi } from '../api/costs';
import { frameworkApi } from '../api/framework';
import { licensesApi } from '../api/licenses';
import { organizationApi } from '../api/organization';
import { recommendationsApi } from '../api/recommendations';
import { challengesApi } from '../api/challenges';
import { initiativesApi } from '../api/initiatives';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import {
  applySavedInterpretationSection,
  REPORT_V2_SECTION_LABELS,
  REPORT_V2_SECTION_ORDER,
  resolveInterpretationText,
  sortInterpretationSections,
} from '../reporting/reportInterpretation';
import { formatDate } from '../utils/formatters';
import type { Challenge, Initiative, Recommendation } from '../types';

function recommendationCard(item: Recommendation) {
  return {
    title: item.title,
    subtitle: [item.priority, item.category].filter(Boolean).join(' • '),
    detail: item.why_it_matters || item.description || item.primary_outcome || null,
  };
}

function challengeCard(item: Challenge) {
  return {
    title: item.title,
    subtitle: [item.impact_level, item.category].filter(Boolean).join(' • '),
    detail: item.why_it_matters || item.description || item.primary_effect || null,
  };
}

function initiativeCard(item: Initiative) {
  return {
    title: item.name,
    subtitle: [item.priority, item.status].filter(Boolean).join(' • '),
    detail: item.description || item.category || null,
  };
}

export default function AssessmentReportV2() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const { exportToPdf, exporting } = usePdfExport();
  const { exportToWord, exporting: exportingWord } = useWordExport();

  const invSummary = useModuleData(
    () => (profileId == null ? Promise.resolve(null) : inventoryApi.summary()),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.inventorySummary },
  );
  const costSummary = useModuleData(
    () => (profileId == null ? Promise.resolve(null) : costsApi.summary()),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.costSummary },
  );
  const framework = useModuleData(
    () => (profileId == null ? Promise.resolve(null) : frameworkApi.insights()),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.frameworkInsights },
  );
  const licenseSummary = useModuleData(
    () => (profileId == null ? Promise.resolve(null) : licensesApi.summary()),
    [profileId],
    { cacheKey: MODULE_CACHE_KEYS.licensesSummary },
  );
  const organizationContext = useModuleData(
    () => (profileId == null ? Promise.resolve(null) : organizationApi.get(profileId)),
    [profileId],
  );
  const recommendations = useModuleData(
    () => (profileId == null ? Promise.resolve([]) : recommendationsApi.list(profileId)),
    [profileId],
  );
  const challenges = useModuleData(
    () => (profileId == null ? Promise.resolve([]) : challengesApi.list(profileId)),
    [profileId],
  );
  const initiatives = useModuleData(
    () => (profileId == null ? Promise.resolve([]) : initiativesApi.list(profileId)),
    [profileId],
  );

  const [interpretation, setInterpretation] = useState<ReportInterpretationStateRecord | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadingInterpretation, setLoadingInterpretation] = useState(false);
  const [savingSectionKey, setSavingSectionKey] = useState<string | null>(null);
  const [runningGeneration, setRunningGeneration] = useState<'generate' | 'regenerate' | null>(null);
  const [approving, setApproving] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    setInterpretation(null);
    setDrafts({});
    setOperationError(null);
    if (!profileId) return;
    let cancelled = false;
    setLoadingInterpretation(true);
    void reportInterpretationApi.get(profileId)
      .then((state) => {
        if (cancelled) return;
        setInterpretation(state);
        setDrafts(
          Object.fromEntries(
            state.sections.map((section) => [section.section_key, resolveInterpretationText(section)]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOperationError(err instanceof Error ? err.message : 'Failed to load report interpretation state.');
      })
      .finally(() => {
        if (!cancelled) setLoadingInterpretation(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const sortedSections = useMemo(
    () => sortInterpretationSections(interpretation?.sections ?? []),
    [interpretation?.sections],
  );

  const sectionNavItems = useMemo(
    () => REPORT_V2_SECTION_ORDER.map((key) => ({ id: `v2-${key}`, label: REPORT_V2_SECTION_LABELS[key] })),
    [],
  );

  const snapshotReady = interpretation?.has_snapshot ?? false;
  const canExport = snapshotReady && Boolean(interpretation?.current_run);

  const refreshInterpretationState = async (state: ReportInterpretationStateRecord) => {
    setInterpretation(state);
    setDrafts(
      Object.fromEntries(
        state.sections.map((section) => [section.section_key, resolveInterpretationText(section)]),
      ),
    );
  };

  const handleGenerate = async (mode: 'generate' | 'regenerate') => {
    if (!profileId) return;
    if (mode === 'regenerate' && !window.confirm('Regenerating will overwrite the current interpreted text for this profile. Continue?')) {
      return;
    }

    setOperationError(null);
    setRunningGeneration(mode);
    try {
      const state = mode === 'generate'
        ? await reportInterpretationApi.generate(profileId)
        : await reportInterpretationApi.regenerate(profileId);
      await refreshInterpretationState(state);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'Failed to generate interpretation.');
    } finally {
      setRunningGeneration(null);
    }
  };

  const handleSaveSection = async (section: ReportInterpretationSectionRecord) => {
    if (!profileId) return;
    const nextText = drafts[section.section_key] ?? '';
    setOperationError(null);
    setSavingSectionKey(section.section_key);
    try {
      const updated = await reportInterpretationApi.updateSection(profileId, section.section_key, { text: nextText, edited_by: 'local-user' });
      setInterpretation((prev) => {
        if (!prev) return prev;
        return applySavedInterpretationSection(prev, updated);
      });
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'Failed to save interpretation section.');
    } finally {
      setSavingSectionKey(null);
    }
  };

  const handleApprove = async () => {
    if (!profileId) return;
    setOperationError(null);
    setApproving(true);
    try {
      const state = await reportInterpretationApi.approve(profileId, { approved_by: 'local-user' });
      await refreshInterpretationState(state);
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'Failed to approve interpretation.');
    } finally {
      setApproving(false);
    }
  };

  if (!activeProfile) {
    return (
      <PageLayout title="Assessment report" subtitle="Select a customer profile to view the report.">
        <p className="empty-state">Select a customer profile to open the assessment report.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Assessment report"
      subtitle="Report V2 uses saved profile evidence plus stored, editable interpretation text."
    >
      <div className="rpt-export-card">
        <div className="rpt-export-card__header">
          <div>
            <h3 className="rpt-export-card__title">Report V2 controls</h3>
            <p className="rpt-export-card__desc">
              Profile version: <strong>{activeProfile.report_version}</strong>
              {' • '}
              Snapshot status: <strong>{snapshotReady ? 'ready' : 'missing'}</strong>
              {interpretation?.current_run?.generated_at ? ` • Last interpretation: ${formatDate(interpretation.current_run.generated_at)}` : ''}
            </p>
          </div>
          <div className="rpt-export-card__actions">
            <button
              className="btn btn-primary"
              disabled={!snapshotReady || runningGeneration !== null}
              onClick={() => handleGenerate(interpretation?.current_run ? 'regenerate' : 'generate')}
            >
              {runningGeneration === 'generate'
                ? 'Generating…'
                : runningGeneration === 'regenerate'
                  ? 'Regenerating…'
                  : interpretation?.current_run
                    ? 'Regenerate Interpretation'
                    : 'Generate Interpretation'}
            </button>
            <button
              className="btn"
              disabled={!interpretation?.current_run || approving}
              onClick={handleApprove}
            >
              {approving ? 'Approving…' : interpretation?.current_run?.approved ? 'Approved' : 'Approve Interpretation'}
            </button>
            <button
              className="btn"
              disabled={!canExport || exporting}
              onClick={() => exportToPdf('assessment-report', `Assessment-Report-V2-${activeProfile.customer_name}`)}
            >
              <Download size={16} />
              {exporting ? 'Exporting PDF…' : 'Export to PDF'}
            </button>
            <button
              className="btn"
              disabled={!canExport || exportingWord}
              onClick={() => exportToWord('assessment-report', `Assessment-Report-V2-${activeProfile.customer_name}`)}
            >
              <Download size={16} />
              {exportingWord ? 'Building Word document…' : 'Export to Word'}
            </button>
          </div>
        </div>
        {operationError ? <p className="rpt-desc" style={{ color: 'var(--color-danger)' }}>{operationError}</p> : null}
        {!snapshotReady ? (
          <p className="rpt-desc">A saved data-pull snapshot is required before interpretation can be generated or exported.</p>
        ) : null}
        {snapshotReady && !interpretation?.current_run ? (
          <p className="rpt-desc">Generate an interpretation run before exporting the V2 report.</p>
        ) : null}
        {interpretation?.current_run?.generation_notes ? (
          <p className="rpt-desc">{interpretation.current_run.generation_notes}</p>
        ) : null}
      </div>

      <SectionNav sections={sectionNavItems} />

      <div className="initiative-overview-card">
        <h3>Interpretation editor</h3>
        <p className="page-subtitle">
          These fields are stored against the active V2 profile. Regeneration overwrites the current run after confirmation.
        </p>
        {loadingInterpretation ? <p className="empty-state">Loading interpretation state…</p> : null}
        {!loadingInterpretation && sortedSections.length === 0 ? (
          <p className="empty-state">No interpretation run exists yet for this profile. Generate one after a successful data pull.</p>
        ) : null}
        {!loadingInterpretation && sortedSections.map((section) => (
          <div key={section.section_key} id={`v2-${section.section_key}`} className="org-card" style={{ marginBottom: 16 }}>
            <div className="org-card__header">
              <div>
                <h3>{REPORT_V2_SECTION_LABELS[section.section_key as keyof typeof REPORT_V2_SECTION_LABELS] ?? section.section_key}</h3>
                <p>Stored text that feeds Report V2 and exports for this profile.</p>
              </div>
              <button
                className="btn btn-primary"
                disabled={savingSectionKey === section.section_key}
                onClick={() => handleSaveSection(section)}
              >
                {savingSectionKey === section.section_key ? 'Saving…' : 'Save section'}
              </button>
            </div>
            <textarea
              className="input"
              style={{ minHeight: 160, width: '100%' }}
              value={drafts[section.section_key] ?? ''}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [section.section_key]: event.target.value }))}
            />
          </div>
        ))}
      </div>

      <AssessmentReportV2Content
        customerName={activeProfile.customer_name}
        snapshotAt={interpretation?.current_run?.source_snapshot_at ?? activeProfile.last_assessed_at}
        interpretationRun={interpretation?.current_run}
        sections={sortedSections}
        inventorySummary={invSummary.data}
        costSummary={costSummary.data}
        frameworkInsights={framework.data}
        licenseSummary={licenseSummary.data}
        organizationContext={organizationContext.data}
        recommendations={(recommendations.data ?? []).map(recommendationCard)}
        challenges={(challenges.data ?? []).map(challengeCard)}
        initiatives={(initiatives.data ?? []).map(initiativeCard)}
      />
    </PageLayout>
  );
}
