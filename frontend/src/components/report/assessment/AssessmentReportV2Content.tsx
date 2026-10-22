import React from 'react';

import type { CostSummary, InventorySummary, LicenseSummary, OrganizationContext } from '../../../types';
import type { FrameworkInsightsResponse } from '../../../api/framework';
import type { ReportInterpretationRunRecord, ReportInterpretationSectionRecord } from '../../../api/reportInterpretation';
import {
  REPORT_V2_SECTION_LABELS,
  REPORT_V2_SECTION_ORDER,
  resolveInterpretationText,
  sortInterpretationSections,
} from '../../../reporting/reportInterpretation';
import { formatCurrency, formatDate, formatPercent } from '../../../utils/formatters';

type NamedItem = {
  title: string;
  subtitle?: string | null;
  detail?: string | null;
};

export interface AssessmentReportV2ContentProps {
  customerName: string;
  snapshotAt?: string | null;
  interpretationRun?: ReportInterpretationRunRecord | null;
  sections: ReportInterpretationSectionRecord[];
  inventorySummary?: InventorySummary | null;
  costSummary?: CostSummary | null;
  frameworkInsights?: FrameworkInsightsResponse | null;
  licenseSummary?: LicenseSummary | null;
  organizationContext?: OrganizationContext | null;
  recommendations: NamedItem[];
  challenges: NamedItem[];
  initiatives: NamedItem[];
}

function renderParagraphs(text: string): React.ReactNode {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={`${paragraph.slice(0, 24)}-${index}`} className="rpt-narrative">
        {paragraph}
      </p>
    ));
}

function bulletList(items: NamedItem[], emptyLabel: string) {
  if (items.length === 0) {
    return <p className="rpt-empty">{emptyLabel}</p>;
  }
  return (
    <div className="rpt-context-grid">
      {items.slice(0, 6).map((item) => (
        <div key={`${item.title}-${item.subtitle ?? ''}`} className="rpt-context-card">
          <strong>{item.title}</strong>
          {item.subtitle ? <p className="rpt-desc">{item.subtitle}</p> : null}
          {item.detail ? <p className="rpt-narrative">{item.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function AssessmentReportV2Content({
  customerName,
  snapshotAt,
  interpretationRun,
  sections,
  inventorySummary,
  costSummary,
  frameworkInsights,
  licenseSummary,
  organizationContext,
  recommendations,
  challenges,
  initiatives,
}: AssessmentReportV2ContentProps) {
  const sectionMap = new Map(sortInterpretationSections(sections).map((section) => [section.section_key, section]));
  const reportStatus = interpretationRun?.approved ? 'Approved' : interpretationRun?.status ? interpretationRun.status : 'Not generated';

  return (
    <div className="rpt-page" id="assessment-report">
      <section className="rpt-cover">
        <div className="rpt-cover__inner">
          <div className="rpt-cover__label">Assessment Report V2</div>
          <h1 className="rpt-cover__title">Assessment Report</h1>
          <p className="rpt-cover__client">{customerName}</p>
          <p className="rpt-cover__phase">Versioned profile-specific report</p>
          <p className="rpt-cover__date">
            Snapshot date: {snapshotAt ? formatDate(snapshotAt) : 'No saved snapshot date available'}
          </p>
        </div>
      </section>

      <section className="rpt-section">
        <div className="rpt-hero-grid">
          <div className="rpt-hero-card">
            <span className="rpt-hero-card__value">{inventorySummary?.total_resources ?? 0}</span>
            <span className="rpt-hero-card__label">Resources</span>
          </div>
          <div className="rpt-hero-card">
            <span className="rpt-hero-card__value">{inventorySummary?.total_resource_groups ?? 0}</span>
            <span className="rpt-hero-card__label">Resource Groups</span>
          </div>
          <div className="rpt-hero-card">
            <span className="rpt-hero-card__value">{formatCurrency(costSummary?.total ?? costSummary?.total_cost_1m ?? 0)}</span>
            <span className="rpt-hero-card__label">Last Month Spend</span>
          </div>
          <div className="rpt-hero-card">
            <span className="rpt-hero-card__value">{(frameworkInsights?.caf_average_maturity ?? 0).toFixed(1)}</span>
            <span className="rpt-hero-card__label">CAF Average Maturity</span>
          </div>
          <div className="rpt-hero-card">
            <span className="rpt-hero-card__value">{reportStatus}</span>
            <span className="rpt-hero-card__label">Interpretation Status</span>
            <span className="rpt-hero-card__meta">{interpretationRun?.generated_at ? formatDate(interpretationRun.generated_at) : 'Not generated yet'}</span>
          </div>
        </div>
      </section>

      {REPORT_V2_SECTION_ORDER.map((sectionKey, index) => {
        const section = sectionMap.get(sectionKey);
        const text = resolveInterpretationText(section);
        return (
          <section key={sectionKey} className="rpt-section">
            <div className="rpt-section__header-row">
              <h2 className="rpt-section__heading">
                <span className="rpt-section__num">{index + 1}</span>
                {REPORT_V2_SECTION_LABELS[sectionKey]}
              </h2>
            </div>
            {text ? renderParagraphs(text) : <p className="rpt-empty">No interpretation text has been stored for this section yet.</p>}
          </section>
        );
      })}

      <section className="rpt-section">
        <h2 className="rpt-section__heading">
          <span className="rpt-section__num">9</span>
          Evidence Summary
        </h2>
        <div className="rpt-kv-grid">
          <div className="rpt-kv">
            <span className="rpt-kv__label">Subscriptions</span>
            <span className="rpt-kv__value">{inventorySummary?.total_subscriptions ?? 0}</span>
          </div>
          <div className="rpt-kv">
            <span className="rpt-kv__label">Untagged Resources</span>
            <span className="rpt-kv__value">{inventorySummary?.untagged_count ?? 0}</span>
          </div>
          <div className="rpt-kv">
            <span className="rpt-kv__label">CAF Methodologies</span>
            <span className="rpt-kv__value">{Object.keys(frameworkInsights?.caf_methodologies ?? {}).length}</span>
          </div>
          <div className="rpt-kv">
            <span className="rpt-kv__label">License Utilisation</span>
            <span className="rpt-kv__value">{formatPercent(licenseSummary?.overall_utilization_pct ?? 0, 1)}</span>
          </div>
        </div>
        <table>
          <tbody>
            <tr>
              <th scope="row">Assessment Scope Notes</th>
              <td>{organizationContext?.assessment_scope_notes || 'No assessment scope notes recorded for this profile.'}</td>
            </tr>
            <tr>
              <th scope="row">Scope Boundary</th>
              <td>{organizationContext?.assessment_boundary_notes || 'No scope boundary notes recorded for this profile.'}</td>
            </tr>
            <tr>
              <th scope="row">Leadership Context</th>
              <td>{organizationContext?.leadership_context_notes || 'No leadership context notes recorded for this profile.'}</td>
            </tr>
            <tr>
              <th scope="row">Organisation Overview</th>
              <td>{organizationContext?.organisation_overview || 'No organisation overview recorded for this profile.'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rpt-section">
        <h2 className="rpt-section__heading">
          <span className="rpt-section__num">10</span>
          Working Records
        </h2>
        <h3 className="rpt-sub-heading">Recommendations</h3>
        {bulletList(recommendations, 'No recommendations are stored for this profile yet.')}
        <h3 className="rpt-sub-heading">Challenges</h3>
        {bulletList(challenges, 'No challenges are stored for this profile yet.')}
        <h3 className="rpt-sub-heading">Initiatives</h3>
        {bulletList(initiatives, 'No initiatives are stored for this profile yet.')}
      </section>
    </div>
  );
}
