import { ChartCard } from '../../shared/ChartCard';
import { downloadCsvBundle, type CsvRow } from '../../../utils/csv';
import { formatCurrency, formatDate, formatPercent } from '../../../utils/formatters';
import { replaceSubscriptionIdsInText } from '../../../reporting/reportShaping';
import type { FrameworkInsightsResponse } from '../../../api/framework';
import type { DefenderScoreResponse, InventorySummary, LicenseSummary, ExecutiveInsight } from '../../../types';

type ExecutiveDeliverableRow = {
  name: string;
  picture: string;
  exportRows: Array<{ label: string; fileName: string; rows: CsvRow[] }>;
};

type ExecutiveFindingRow = { area: string; current: string; why: string };
type ExecutiveSubscriptionRow = { Subscription: string; 'Resource Groups': string | number; Resources: string | number };
type ExecutiveSpendRow = { Subscription: string; 'Last Month': string; Trend: string };
type ExecutiveRoleRow = { Role: string; Assignments: string | number };
type ExecutiveCategoryRow = { Category: string; Recommendations: string | number };
type ExecutivePriorityRow = { Recommendation: string; Priority: string; Outcome: string };
type ExecutiveInitiativeRow = { Initiative: string; Priority: string; Status: string };
type ExecutiveDriverRow = { id?: string; name: string; amount: number; share: number };
type SecurityRecommendationSummary = { high: number; medium: number };

function sevClass(sev: string): string {
  switch (sev) {
    case 'critical': return 'rpt-badge rpt-badge--critical';
    case 'high': return 'rpt-badge rpt-badge--high';
    case 'medium': return 'rpt-badge rpt-badge--medium';
    case 'low': return 'rpt-badge rpt-badge--low';
    default: return 'rpt-badge';
  }
}

export function ExecutiveSummaryContent({
  customerName,
  invSummary,
  costSummary,
  defender,
  licSummary,
  framework,
  snapshotAt,
  recommendedActionsCount,
  executiveSummaryNarrativePoints,
  executiveFindingRows,
  executiveDeliverableRows,
  executiveConcentratedSubscriptions,
  executiveHighestSpendSubscriptions,
  executiveRoleSummaryRows,
  executiveSecurityCategoryRows,
  executivePriorityRecommendationRows,
  executiveInitiativeRows,
  executiveInsightRows,
  executiveAnnualRunRate,
  executiveSecurityRecommendationSummary,
  executiveTopSubscriptionDrivers,
  executiveTopTypeDrivers,
  subNameMap,
  organizationContextSummary,
  assessmentScopeNotes,
  assessmentBoundaryNotes,
  leadershipContextNotes,
}: {
  customerName: string;
  invSummary: InventorySummary | null;
  costSummary: { total_cost_1m?: number; total_cost_6m?: number; total?: number } | null;
  defender: DefenderScoreResponse | null;
  licSummary: LicenseSummary | null;
  framework: FrameworkInsightsResponse | null;
  snapshotAt: string | null;
  recommendedActionsCount: number;
  executiveSummaryNarrativePoints: string[];
  executiveFindingRows: ExecutiveFindingRow[];
  executiveDeliverableRows: ExecutiveDeliverableRow[];
  executiveConcentratedSubscriptions: ExecutiveSubscriptionRow[];
  executiveHighestSpendSubscriptions: ExecutiveSpendRow[];
  executiveRoleSummaryRows: ExecutiveRoleRow[];
  executiveSecurityCategoryRows: ExecutiveCategoryRow[];
  executivePriorityRecommendationRows: ExecutivePriorityRow[];
  executiveInitiativeRows: ExecutiveInitiativeRow[];
  executiveInsightRows: ExecutiveInsight[];
  executiveAnnualRunRate: number;
  executiveSecurityRecommendationSummary: SecurityRecommendationSummary;
  executiveTopSubscriptionDrivers: ExecutiveDriverRow[];
  executiveTopTypeDrivers: ExecutiveDriverRow[];
  subNameMap: Map<string, string>;
  organizationContextSummary: string;
  assessmentScopeNotes?: string | null;
  assessmentBoundaryNotes?: string | null;
  leadershipContextNotes?: string | null;
}) {
  return (
    <>
      <p className="rpt-narrative rpt-narrative--executive-copy">
        This report provides an independent assessment of the {customerName} technology estate, with a particular focus on Azure, supporting platforms, and the delivery capabilities needed to manage the next phase of change.
        It is intended to help leadership understand the current position, where the main risks and constraints sit, and which actions are most likely to improve control, supportability, and delivery momentum.
      </p>
      <p className="rpt-narrative rpt-narrative--executive-copy">
        The assessment points to an environment that is now operating closer to a medium-complexity platform footprint than a small standalone estate, even though the team still carries many of the constraints of a smaller operating model.
        The headline indicators below summarise the current footprint, spend, security posture, maturity picture, and the scale of action now emerging across governance, cleanup, delivery discipline, platform support, and future-state change.
      </p>
      <p className="rpt-narrative rpt-narrative--executive-copy">
        A key executive message is that the next phase should not be dominated only by stabilisation, migration, and control uplift. Those are necessary, but they should be used to create a platform that can support more new business-value delivery over time. That is why the report now places more emphasis on sequencing, capability uplift, and AI-assisted working methods that can help the team move faster, improve documentation and change discipline, and create space for more forward-looking work rather than staying trapped in maintenance and migration alone.
      </p>
      {assessmentBoundaryNotes && (
        <p className="rpt-narrative rpt-narrative--executive-copy">
          {assessmentBoundaryNotes}
        </p>
      )}

      <div className="rpt-hero-grid">
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{invSummary?.total_resources?.toLocaleString() ?? '—'}</span>
          <span className="rpt-hero-card__label">Azure Resources</span>
          <span className="rpt-hero-card__meta">
            {invSummary?.total_subscriptions ?? 0} subscriptions | {invSummary?.total_resource_groups ?? 0} resource groups
          </span>
        </div>
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{costSummary ? formatCurrency(costSummary.total_cost_1m ?? costSummary.total ?? 0) : '—'}</span>
          <span className="rpt-hero-card__label">Monthly Spend</span>
        </div>
        <div className="rpt-hero-card">
          <span className={`rpt-hero-card__value${(defender?.overall_percentage ?? 100) < 50 ? ' rpt-value--warn' : ''}`}>{defender ? formatPercent(defender.overall_percentage, 0) : '—'}</span>
          <span className="rpt-hero-card__label">Secure Score</span>
        </div>
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{licSummary ? formatPercent(licSummary.overall_utilization_pct, 0) : '—'}</span>
          <span className="rpt-hero-card__label">License utilisation</span>
        </div>
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{framework ? formatPercent(framework.waf_overall_score, 0) : '—'}</span>
          <span className="rpt-hero-card__label">WAF Score</span>
        </div>
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{framework ? `${framework.caf_average_maturity.toFixed(1)}/5` : '—'}</span>
          <span className="rpt-hero-card__label">CAF Score</span>
        </div>
        <div className="rpt-hero-card">
          <span className="rpt-hero-card__value">{recommendedActionsCount}</span>
          <span className="rpt-hero-card__label">Actions Identified</span>
        </div>
      </div>

      <div className="rpt-context-grid rpt-context-grid--executive-top">
        <div className="rpt-context-card rpt-context-card--executive-list">
          <h3 className="rpt-sub-heading">What the assessment says overall</h3>
          <ul>
            {executiveSummaryNarrativePoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
            <li>The estate is broadly functional, but it has outgrown the simplicity of the operating model that has supported it to date.</li>
            <li>The main executive challenge is no longer visibility alone, but converting visibility into prioritised action and sustained delivery.</li>
            <li>The strongest near-term gains are likely to come from better sequencing, clearer ownership, cleanup discipline, and practical capability uplift rather than major redesign everywhere at once.</li>
            <li>The longer-term objective should be to shift the portfolio balance toward more business-value and innovation work, rather than allowing maintenance, migration, and technical drag to consume most of the available capacity.</li>
          </ul>
        </div>
        <div className="rpt-context-card rpt-context-card--executive-table">
          <h3 className="rpt-sub-heading">Assessment at a glance</h3>
          <p className="rpt-desc">Key reference points used to orient the report.</p>
          <table className="rpt-table rpt-table--executive-summary">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Current Position</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Assessment scope</td>
                <td>{assessmentScopeNotes || 'Azure estate, cost, Dynamics 365, integration, security, governance, and applications/portfolio.'}</td>
              </tr>
              <tr>
                <td>Scope boundary</td>
                <td>{assessmentBoundaryNotes || 'No profile-specific scope boundary has been recorded.'}</td>
              </tr>
              <tr>
                <td>Organisation context</td>
                <td>{organizationContextSummary}</td>
              </tr>
              <tr>
                <td>Data currency</td>
                <td>Current snapshot dated {snapshotAt ? formatDate(snapshotAt) : 'not yet available'}.</td>
              </tr>
              <tr>
                <td>Current evidence base</td>
                <td>{executiveFindingRows.length} major finding areas are currently summarised in this report.</td>
              </tr>
              <tr>
                <td>Framework alignment</td>
                <td>{framework ? `${formatPercent(framework.waf_overall_score, 0)} WAF score and ${framework.caf_average_maturity.toFixed(1)} / 5 CAF maturity.` : 'Framework alignment metrics are still being assembled.'}</td>
              </tr>
              <tr>
                <td>Delivery implication</td>
                <td>The change portfolio should be sequenced carefully and supported by stronger work-management discipline, targeted capability uplift, and selective specialist support.</td>
              </tr>
              <tr>
                <td>Strategic emphasis</td>
                <td>Use stabilisation and cleanup to create room for more business-facing delivery, not just to keep the current estate standing up.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rpt-context-grid rpt-context-grid--two-col" style={{ marginBottom: '1.2rem' }}>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Executive interpretation</h3>
          <p>
            The assessment does not point to a single failing platform. Instead, it shows a broad estate that has become more complex than the current operating model, support shape, and governance habits were originally designed to carry.
            The main issue is therefore cumulative: each individual gap may be manageable on its own, but together they create a meaningful drag on confidence, speed, supportability, and future-state execution.
          </p>
          <p>
            That is why the strongest recommendations focus on operating model, capacity, change discipline, cleanup, and maintainability first. These are the foundations that make later migration, modernisation, and innovation work more achievable.
          </p>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">What leadership should take from this</h3>
          <p>
            {leadershipContextNotes || `${customerName} appears to be operating at a level of technology complexity that should be interpreted through the organisation context captured for this profile.`}
          </p>
          <p>
            The practical implication is that better outcomes are unlikely to come from visibility alone. They will come from turning this baseline into disciplined follow-through: clearer ownership, stronger delivery reporting, targeted capability uplift, deliberate sequencing of the next two years of work, and a conscious shift from mostly maintain-and-migrate activity toward more business-value and innovation delivery over time.
          </p>
          {!leadershipContextNotes && (
            <p>
              This also creates a natural place for a supported second phase. Rather than relying only on more people or more documentation, {customerName} can use guided AI-assisted working methods to accelerate delivery reporting, documentation cleanup, change discipline, and day-to-day platform management while building internal capability through practical use on real work.
            </p>
          )}
        </div>
      </div>

      <div className="exec-driver-grid" style={{ marginBottom: '1.2rem' }}>
        <div className="dashboard-card exec-kpi-card report-copy-exec-card">
          <h3>Monthly cloud spend</h3>
          <p className="big-number">{costSummary ? formatCurrency(costSummary.total_cost_1m ?? costSummary.total ?? 0) : 'N/A'}</p>
          <p className="exec-kpi-note">Annualized run rate: {executiveAnnualRunRate > 0 ? formatCurrency(executiveAnnualRunRate) : 'N/A'}</p>
          <p className="exec-kpi-note">
            Six-month total: {costSummary ? formatCurrency(costSummary.total_cost_6m ?? 0) : 'N/A'}
          </p>
          <span className="card-link-hint">See Cost Analysis for full detail</span>
        </div>
        <div className="dashboard-card exec-kpi-card report-copy-exec-card">
          <h3>Security posture</h3>
          <p className="big-number">{defender ? formatPercent(defender.overall_percentage, 1) : 'N/A'}</p>
          <p className="exec-kpi-note">
            Advisor findings: {executiveSecurityRecommendationSummary.high} high, {executiveSecurityRecommendationSummary.medium} medium
          </p>
          <p className="exec-kpi-note">
            Defender healthy / unhealthy: {defender?.posture_summary?.total_healthy ?? 0} / {defender?.posture_summary?.total_unhealthy ?? 0}
          </p>
          <span className="card-link-hint">See Security &amp; Health for full detail</span>
        </div>
      </div>

      <div className="exec-driver-grid" style={{ marginBottom: '1.2rem' }}>
        <ChartCard title="Top subscription spend drivers" subtitle="Largest subscriptions by monthly spend">
          {executiveTopSubscriptionDrivers.length > 0 ? (
            <div className="exec-driver-list">
              {executiveTopSubscriptionDrivers.map((row) => (
                <div key={row.id ?? row.name} className="exec-driver-row">
                  <div className="exec-driver-meta">
                    <span className="exec-driver-name">{row.name}</span>
                    <span className="exec-driver-value">
                      {formatCurrency(row.amount)} ({row.share.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="exec-driver-track">
                    <div className="exec-driver-fill" style={{ width: `${Math.max(4, Math.min(row.share, 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No subscription-level spend data returned yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Top resource type spend drivers" subtitle="Largest Azure service categories by monthly spend">
          {executiveTopTypeDrivers.length > 0 ? (
            <div className="exec-driver-list">
              {executiveTopTypeDrivers.map((row) => (
                <div key={row.name} className="exec-driver-row">
                  <div className="exec-driver-meta">
                    <span className="exec-driver-name">{row.name}</span>
                    <span className="exec-driver-value">
                      {formatCurrency(row.amount)} ({row.share.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="exec-driver-track">
                    <div className="exec-driver-fill" style={{ width: `${Math.max(4, Math.min(row.share, 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No resource-type spend data returned yet.</p>
          )}
        </ChartCard>
      </div>

      <div className="rpt-context-card" style={{ marginBottom: '1.2rem' }}>
        <h3 className="rpt-sub-heading">Most important findings across the assessment</h3>
        <p className="rpt-desc">These are the highest-level messages drawn from the current evidence base.</p>
        <p className="rpt-table-meta">{executiveFindingRows.length} rows</p>
        <table className="rpt-table rpt-table--executive-summary">
          <thead>
            <tr>
              <th>Area</th>
              <th>Current Position</th>
              <th>Why It Matters</th>
            </tr>
          </thead>
          <tbody>
            {executiveFindingRows.map((row) => (
              <tr key={row.area}>
                <td>{row.area}</td>
                <td>{row.current}</td>
                <td>{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rpt-context-card" style={{ marginBottom: '1.2rem' }}>
        <h3 className="rpt-sub-heading">Deliverables provided with this document</h3>
        <p className="rpt-desc">This executive summary sits alongside the specialist deliverables and their downloadable schedules.</p>
        <p className="rpt-table-meta">{executiveDeliverableRows.length} rows</p>
        <table className="rpt-table rpt-table--executive-summary">
          <thead>
            <tr>
              <th>Deliverable Document</th>
              <th>Current Picture</th>
              <th>Workbook</th>
            </tr>
          </thead>
          <tbody>
            {executiveDeliverableRows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.picture}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                    onClick={() => downloadCsvBundle(row.exportRows.filter((item) => item.rows.length > 0))}
                  >
                    Download workbook
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rpt-context-grid rpt-context-grid--two-col" style={{ marginBottom: '1.2rem' }}>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Most concentrated subscriptions</h3>
          <p className="rpt-desc">The subscriptions carrying the largest current estate footprint.</p>
          <p className="rpt-table-meta">{executiveConcentratedSubscriptions.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Resource Groups</th>
                <th>Resources</th>
              </tr>
            </thead>
            <tbody>
              {executiveConcentratedSubscriptions.map((row) => (
                <tr key={row.Subscription}>
                  <td>{row.Subscription}</td>
                  <td>{row['Resource Groups']}</td>
                  <td>{row.Resources}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Highest-spend subscriptions</h3>
          <p className="rpt-desc">The subscriptions carrying the largest current monthly cost.</p>
          <p className="rpt-table-meta">{executiveHighestSpendSubscriptions.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Last Month</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {executiveHighestSpendSubscriptions.map((row) => (
                <tr key={row.Subscription}>
                  <td>{row.Subscription}</td>
                  <td>{row['Last Month']}</td>
                  <td>{row.Trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Most common access roles</h3>
          <p className="rpt-desc">The most prevalent role-assignment patterns currently observed.</p>
          <p className="rpt-table-meta">{executiveRoleSummaryRows.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Role</th>
                <th>Assignments</th>
              </tr>
            </thead>
            <tbody>
              {executiveRoleSummaryRows.map((row) => (
                <tr key={row.Role}>
                  <td>{row.Role}</td>
                  <td>{row.Assignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Most common security recommendation categories</h3>
          <p className="rpt-desc">The categories shaping the current remediation backlog.</p>
          <p className="rpt-table-meta">{executiveSecurityCategoryRows.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Category</th>
                <th>Recommendations</th>
              </tr>
            </thead>
            <tbody>
              {executiveSecurityCategoryRows.map((row) => (
                <tr key={row.Category}>
                  <td>{row.Category}</td>
                  <td>{row.Recommendations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Priority recommendations</h3>
          <p className="rpt-desc">A short list of the most important actions currently captured in the assessment.</p>
          <p className="rpt-table-meta">{executivePriorityRecommendationRows.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Recommendation</th>
                <th>Priority</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {executivePriorityRecommendationRows.map((row) => (
                <tr key={row.Recommendation}>
                  <td>{row.Recommendation}</td>
                  <td>{row.Priority}</td>
                  <td>{row.Outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rpt-context-card">
          <h3 className="rpt-sub-heading">Current initiative picture</h3>
          <p className="rpt-desc">Leading initiatives already identified in the assessment work.</p>
          <p className="rpt-table-meta">{executiveInitiativeRows.length} rows</p>
          <table className="rpt-table rpt-table--compact">
            <thead>
              <tr>
                <th>Initiative</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {executiveInitiativeRows.map((row) => (
                <tr key={row.Initiative}>
                  <td>{row.Initiative}</td>
                  <td>{row.Priority}</td>
                  <td>{row.Status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {executiveInsightRows.length > 0 && (
        <div className="rpt-insight-list">
          <div className="rpt-context-card rpt-insight-intro">
            <h3 className="rpt-sub-heading">Executive insight summary</h3>
            <p className="rpt-desc">
              Below some key themes emerging from the assessment evidence. They are intended to highlight where executive attention is most likely to add value.
            </p>
          </div>
          <div className="rpt-insight-grid">
            {executiveInsightRows.map((insight, idx) => (
              <div key={idx} className={`rpt-insight-item rpt-insight-item--${insight.severity}`}>
                <div className="rpt-insight-item__topline">
                  <span className={sevClass(insight.severity)}>{insight.severity}</span>
                </div>
                <div>
                  <h4>{insight.title}</h4>
                  <p>{replaceSubscriptionIdsInText(insight.description ?? insight.message ?? '', subNameMap)}</p>
                  {insight.recommendation && <p className="rpt-insight-rec">Recommended focus: {replaceSubscriptionIdsInText(insight.recommendation, subNameMap)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="rpt-context-card rpt-insight-intro">
        <h3 className="rpt-sub-heading">Assessment evidence</h3>
        <p className="rpt-desc">
          The findings in this report are based on Azure inventory, usage, cost, security, governance, integration, and platform telemetry, together with meeting notes, stakeholder interviews, organisation context inputs, portfolio material, manual framework assessments, and supporting customer documentation reviewed during the assessment.
        </p>
      </div>
    </>
  );
}
