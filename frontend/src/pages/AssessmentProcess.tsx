import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleDashed, FileStack, MessagesSquare, PackageCheck, ShieldCheck } from 'lucide-react';
import { PageLayout } from '../components/layout/PageLayout';
import { LoadingIndicator } from '../components/layout/LoadingIndicator';
import { useProfile } from '../hooks/useProfile';
import { assessmentProcessApi } from '../api/assessmentProcess';

type ProcessTask = {
  id: string;
  flow: string;
};

type ProcessGroup = {
  phase: 'Evidence' | 'Assessment Build' | 'Validation' | 'Packaging';
  title: string;
  description: string;
  tasks: ProcessTask[];
};

const PROCESS_GROUPS: ProcessGroup[] = [
  {
    phase: 'Evidence',
    title: 'Interview and Note Processing',
    description: 'Track the progression from meetings and raw transcripts into structured assessment artefacts.',
    tasks: [
      { id: 'interviews_to_structured_notes', flow: 'Interviews -> Raw Transcripts -> Meeting Summary -> Structured Notes' },
      { id: 'customer_data_gaps_bridged', flow: 'Customer follow-up -> Outstanding data gaps bridged' },
      { id: 'structured_notes_to_challenges', flow: 'Structured Notes -> Challenges and capability areas' },
      { id: 'structured_notes_to_recommendations', flow: 'Structured Notes -> Recommendations' },
      { id: 'structured_notes_to_app_portfolio', flow: 'Structured Notes -> Applications in app portfolio' },
      { id: 'structured_notes_to_integrations', flow: 'Structured Notes -> Integration context and business meaning' },
      { id: 'structured_notes_to_org_context', flow: 'Structured Notes -> Organisation context' },
      { id: 'structured_notes_to_future_initiatives', flow: 'Interviews -> Raw Transcripts -> Meeting Summary -> Structured Notes -> Future Initiatives' },
    ],
  },
  {
    phase: 'Assessment Build',
    title: 'Azure Data and Assessment Outputs',
    description: 'Track data-driven analysis and the derived assessment layers built from Azure evidence.',
    tasks: [
      { id: 'data_pull_and_access_validated', flow: 'Data pull and access validation -> usable evidence baseline' },
      { id: 'azure_to_cost_analysis', flow: 'Azure Data -> Cost analysis' },
      { id: 'azure_to_inventory', flow: 'Azure Data -> Azure inventory' },
      { id: 'azure_to_inferred_app_portfolio', flow: 'Azure Data -> Azure inventory -> Inferred application portfolio' },
      { id: 'azure_to_dynamics', flow: 'Azure Data -> Dynamics 365 platform overview' },
      { id: 'azure_to_licenses', flow: 'Azure Data -> License utilisation' },
      { id: 'azure_to_integrations', flow: 'Azure Data -> Integration baseline' },
      { id: 'azure_to_governance', flow: 'Azure Data -> Governance analysis' },
      { id: 'azure_to_posture_analysis', flow: 'Azure Data -> Posture analysis' },
      { id: 'posture_to_waf', flow: 'Posture Analysis -> WAF Reporting' },
      { id: 'azure_to_manual_caf', flow: 'Azure Data -> Manual CAF assessment' },
      { id: 'data_gaps_reviewed', flow: 'Assessment evidence -> Data gaps reviewed and understood' },
    ],
  },
  {
    phase: 'Validation',
    title: 'Stakeholder Validation',
    description: 'Track customer review and validation of the working assessment lists before finalisation.',
    tasks: [
      { id: 'stakeholder_final_challenges', flow: 'Stakeholder review -> Final list of challenges' },
      { id: 'stakeholder_final_recommendations', flow: 'Stakeholder review -> Final list of recommendations' },
      { id: 'stakeholder_final_initiatives', flow: 'Stakeholder review -> Final list of future initiatives' },
      { id: 'stakeholder_final_applications', flow: 'Stakeholder review -> Final list of applications' },
      { id: 'stakeholder_final_integrations', flow: 'Stakeholder review -> Final list of integrations' },
      { id: 'stakeholder_final_ownership', flow: 'Stakeholder review -> Final ownership and support picture' },
    ],
  },
  {
    phase: 'Packaging',
    title: 'Delivery Packaging and Issue',
    description: 'Track the move from validated content into customer-facing deliverables, workbooks, and issued report packs.',
    tasks: [
      { id: 'deliverable_packaging_plan_ready', flow: 'Delivery plan -> Standalone deliverable structure aligned to scope' },
      { id: 'companion_summary_ready', flow: 'Validated evidence -> Companion assessment summary ready' },
      { id: 'specialist_deliverables_ready', flow: 'Validated evidence -> Seven deliverables prepared for issue' },
      { id: 'supplementary_workbooks_ready', flow: 'Detailed schedules -> Excel workbooks prepared for issue' },
      { id: 'final_quality_check_ready', flow: 'Report and deliverables -> Final QA and release pack ready' },
    ],
  },
];

const ALL_TASKS = PROCESS_GROUPS.flatMap((group) => group.tasks);

const PHASE_META = [
  {
    phase: 'Evidence' as const,
    title: 'Evidence capture',
    description: 'Meetings, transcripts, notes, and organisation context consolidated into usable assessment evidence.',
    icon: MessagesSquare,
  },
  {
    phase: 'Assessment Build' as const,
    title: 'Assessment build',
    description: 'Azure evidence, platform views, posture analysis, and framework outputs turned into working assessment content.',
    icon: ShieldCheck,
  },
  {
    phase: 'Validation' as const,
    title: 'Stakeholder validation',
    description: 'Working lists and inferred findings reviewed with the customer and confirmed where needed.',
    icon: CheckCircle2,
  },
  {
    phase: 'Packaging' as const,
    title: 'Delivery packaging',
    description: 'Validated outputs assembled into the companion report, standalone deliverables, and supporting workbooks.',
    icon: FileStack,
  },
];

export default function AssessmentProcess() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadRequestSeqRef = useRef(0);
  const saveRequestSeqRef = useRef(0);

  useEffect(() => {
    const requestSeq = ++loadRequestSeqRef.current;
    saveRequestSeqRef.current += 1;
    let cancelled = false;
    setChecklist({});
    setSaving(false);
    async function load() {
      if (!profileId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const record = await assessmentProcessApi.get(profileId);
        if (!cancelled && loadRequestSeqRef.current === requestSeq) setChecklist(record.checklist ?? {});
      } catch (err) {
        if (!cancelled && loadRequestSeqRef.current === requestSeq) {
          setError((err as Error).message || 'Failed to load assessment progress.');
        }
      } finally {
        if (!cancelled && loadRequestSeqRef.current === requestSeq) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const totalTasks = ALL_TASKS.length;
  const completedTasks = useMemo(
    () => ALL_TASKS.filter((task) => checklist[task.id]).length,
    [checklist],
  );
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const remainingTasks = totalTasks - completedTasks;

  const phaseCards = useMemo(
    () =>
      PHASE_META.map((phase) => {
        const phaseGroups = PROCESS_GROUPS.filter((group) => group.phase === phase.phase);
        const phaseTasks = phaseGroups.flatMap((group) => group.tasks);
        const done = phaseTasks.filter((task) => checklist[task.id]).length;
        const pct = phaseTasks.length > 0 ? Math.round((done / phaseTasks.length) * 100) : 0;
        return { ...phase, total: phaseTasks.length, done, pct };
      }),
    [checklist],
  );

  async function updateChecklist(nextChecklist: Record<string, boolean>) {
    if (!profileId) return;
    const requestSeq = ++saveRequestSeqRef.current;
    setSaving(true);
    setError('');
    try {
      const record = await assessmentProcessApi.update(profileId, { checklist: nextChecklist });
      if (saveRequestSeqRef.current === requestSeq) {
        setChecklist(record.checklist ?? {});
      }
    } catch (err) {
      if (saveRequestSeqRef.current === requestSeq) {
        setError((err as Error).message || 'Failed to save assessment progress.');
        setChecklist(nextChecklist);
      }
    } finally {
      if (saveRequestSeqRef.current === requestSeq) {
        setSaving(false);
      }
    }
  }

  function handleToggle(taskId: string) {
    const nextChecklist = {
      ...checklist,
      [taskId]: !checklist[taskId],
    };
    setChecklist(nextChecklist);
    void updateChecklist(nextChecklist);
  }

  return (
    <PageLayout
      title="Assessment Progress"
      subtitle="Track progress across interview processing, Azure-derived analysis, and stakeholder validation for the active customer profile."
      exportId="assessment-progress-page"
    >
      {!activeProfile ? (
        <p className="empty-state">Select an active customer profile to track assessment progress.</p>
      ) : (
        <div className="assessment-process-page">
          <section className="assessment-process-summary">
            <div className="assessment-process-summary__header">
              <div>
                <h2>Overall progress</h2>
                <p>This checklist helps track how far the assessment has moved from raw evidence to validated customer-ready outputs.</p>
              </div>
              <div className="assessment-process-summary__meta">
                <span className="assessment-process-summary__pct">{progressPct}%</span>
                <span className="assessment-process-summary__count">{completedTasks} of {totalTasks} completed</span>
              </div>
            </div>
            <div className="assessment-process-kpis">
              <div className="assessment-process-kpi">
                <span className="assessment-process-kpi__label">Completed steps</span>
                <strong>{completedTasks}</strong>
              </div>
              <div className="assessment-process-kpi">
                <span className="assessment-process-kpi__label">Remaining steps</span>
                <strong>{remainingTasks}</strong>
              </div>
              <div className="assessment-process-kpi">
                <span className="assessment-process-kpi__label">Active profile</span>
                <strong>{activeProfile.customer_name}</strong>
              </div>
              <div className="assessment-process-kpi">
                <span className="assessment-process-kpi__label">Process stages</span>
                <strong>{PHASE_META.length}</strong>
              </div>
            </div>
            <div className="assessment-process-summary__bar">
              <div className="assessment-process-summary__fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="assessment-process-summary__status">
              {loading && <LoadingIndicator compact message="Loading checklist..." />}
              {!loading && saving && <LoadingIndicator compact message="Saving changes..." />}
              {!loading && !saving && <span>Progress is stored against profile: <strong>{activeProfile.customer_name}</strong></span>}
            </div>
            {error && <div className="assessment-process-summary__error"><span>{error}</span></div>}
          </section>

          <section className="assessment-process-phases">
            <div className="assessment-process-phases__header">
              <div>
                <h2>Process map</h2>
                <p>The assessment currently moves through four practical stages: evidence capture, assessment build, stakeholder validation, and delivery packaging.</p>
              </div>
              <div className="assessment-process-phases__badge">
                <PackageCheck size={16} />
                <span>Aligned to scope and deliverable packaging</span>
              </div>
            </div>
            <div className="assessment-process-phase-grid">
              {phaseCards.map((phase) => {
                const Icon = phase.icon;
                return (
                  <article key={phase.phase} className="assessment-process-phase-card">
                    <div className="assessment-process-phase-card__top">
                      <span className="assessment-process-phase-card__icon"><Icon size={18} /></span>
                      <span className="assessment-process-phase-card__pct">{phase.pct}%</span>
                    </div>
                    <h3>{phase.title}</h3>
                    <p>{phase.description}</p>
                    <div className="assessment-process-phase-card__bar">
                      <div style={{ width: `${phase.pct}%` }} />
                    </div>
                    <div className="assessment-process-phase-card__meta">
                      <span>{phase.done} of {phase.total} complete</span>
                      <span>{phase.total - phase.done} remaining</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <div className="assessment-process-groups">
            {PROCESS_GROUPS.map((group) => {
              const groupDone = group.tasks.filter((task) => checklist[task.id]).length;
              const groupPct = Math.round((groupDone / group.tasks.length) * 100);
              return (
                <section key={group.title} className="assessment-process-group">
                  <div className="assessment-process-group__header">
                    <div>
                      <span className="assessment-process-group__phase">{group.phase}</span>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>
                    <div className="assessment-process-group__stats">
                      <span>{groupPct}%</span>
                      <span>{groupDone}/{group.tasks.length}</span>
                    </div>
                  </div>
                  <div className="assessment-process-group__bar">
                    <div className="assessment-process-group__fill" style={{ width: `${groupPct}%` }} />
                  </div>
                  <div className="assessment-process-task-list">
                    {group.tasks.map((task) => {
                      const checked = !!checklist[task.id];
                      return (
                        <label key={task.id} className={`assessment-process-task${checked ? ' assessment-process-task--done' : ''}`}>
                          <span className="assessment-process-task__checkbox">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggle(task.id)}
                            />
                            {checked ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
                          </span>
                          <span className="assessment-process-task__flow">{task.flow}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
