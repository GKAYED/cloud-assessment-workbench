/** @vitest-environment jsdom */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssessmentReportV2Content } from '../../components/report/assessment/AssessmentReportV2Content';
import { anonymousCafMethodologyFixture } from '../__fixtures__/anonymousProfileFixture';
import { completeReportRegressionFixture } from '../__fixtures__/reportRegressionFixtures';
import type { FrameworkInsightsResponse } from '../../api/framework';
import type { CostSummary, InventorySummary, LicenseSummary, OrganizationContext } from '../../types';
import type { ReportInterpretationRunRecord, ReportInterpretationSectionRecord } from '../../api/reportInterpretation';

const sections: ReportInterpretationSectionRecord[] = [
  {
    run_id: 1,
    section_key: 'executive_summary',
    source_kind: 'generated',
    generated_text: 'The current report is grounded in saved profile evidence.',
    final_text: 'The current report is grounded in saved profile evidence.',
  },
  {
    run_id: 1,
    section_key: 'business_context',
    source_kind: 'edited',
    generated_text: 'Original context.',
    edited_text: 'Edited business context for the regression harness.',
    final_text: 'Edited business context for the regression harness.',
  },
  {
    run_id: 1,
    section_key: 'estate_interpretation',
    source_kind: 'generated',
    final_text: 'Estate interpretation references the current profile snapshot only.',
  },
  {
    run_id: 1,
    section_key: 'security_interpretation',
    source_kind: 'generated',
    final_text: 'Security interpretation remains profile-scoped.',
  },
  {
    run_id: 1,
    section_key: 'governance_interpretation',
    source_kind: 'generated',
    final_text: 'Governance interpretation is linked to saved CAF evidence.',
  },
  {
    run_id: 1,
    section_key: 'cost_interpretation',
    source_kind: 'generated',
    final_text: 'Cost interpretation is linked to saved spend evidence.',
  },
  {
    run_id: 1,
    section_key: 'recommendation_context',
    source_kind: 'generated',
    final_text: 'Recommendation context comes from stored recommendations and challenges.',
  },
  {
    run_id: 1,
    section_key: 'leadership_takeaways',
    source_kind: 'generated',
    final_text: 'Leadership takeaways remain editable and exportable.',
  },
];

const interpretationRun: ReportInterpretationRunRecord = {
  id: 1,
  profile_id: 7,
  report_version: 'v2',
  status: 'draft',
  approved: false,
  is_current: true,
  generation_trigger: 'generate',
  generated_at: '2026-04-29T00:00:00.000Z',
  generation_model: 'local-fallback',
  generation_notes: 'Regression harness generation notes.',
  sections,
};

const inventorySummary: InventorySummary = {
  total_subscriptions: completeReportRegressionFixture.subscriptions.length,
  total_resource_groups: completeReportRegressionFixture.resourceGroups.length,
  total_resources: completeReportRegressionFixture.resources.length,
  resources_by_type: {
    'Microsoft.Web/sites': 3,
    'Microsoft.Storage/storageAccounts': 2,
  },
  resources_by_location: {
    australiaeast: 4,
    australiasoutheast: 1,
  },
  untagged_count: 1,
  untagged_percentage: 20,
};

const costSummary: CostSummary = {
  total_cost_1m: 135,
  total_cost_3m: 380,
  total_cost_6m: 720,
  total: 135,
  currency: 'USD',
  overall_trend: 'stable',
  trend_direction: 'stable',
  trend_percent: 0,
  top_cost_drivers: [],
  by_month: [],
};

const frameworkInsights: FrameworkInsightsResponse = {
  waf_pillars: {},
  waf_overall_score: 73,
  scored_pillars_count: 2,
  total_pillars: 5,
  caf_methodologies: {
    govern: anonymousCafMethodologyFixture,
  },
  caf_average_maturity: anonymousCafMethodologyFixture.maturity,
  phase2_summary: [],
  phase2_count: 0,
  priority_actions: [],
  data_gaps: [],
  assessment_scope: 'Stored snapshot evidence for the profile.',
};

const licenseSummary: LicenseSummary = {
  total_skus: 2,
  total_purchased: 100,
  total_consumed: 74,
  total_available: 26,
  overall_utilization_pct: 74,
  underutilized_skus: [],
  inactive_licensed_users: 4,
  estimated_waste_monthly: 350,
};

const organizationContext: OrganizationContext = {
  id: 1,
  profile_id: 7,
  organisation_size: 'Medium',
  organisation_overview: 'Regression harness organisation overview.',
  assessment_scope_notes: 'Azure estate, cost, governance, and delivery posture.',
  assessment_boundary_notes: 'Profile-scoped snapshot evidence only.',
  leadership_context_notes: 'Leadership is focused on sequencing and execution discipline.',
  operating_model_notes: null,
  it_team_summary: null,
  vendor_dependency_notes: null,
  tailoring_notes: null,
  org_structure_image_name: null,
  org_structure_image_data: null,
  it_team_structure_image_name: null,
  it_team_structure_image_data: null,
  it_team_structure_images: [],
  created_at: '2026-04-29T00:00:00.000Z',
  updated_at: '2026-04-29T00:00:00.000Z',
};

describe('report v2 regression harness', () => {
  it('renders deterministic V2 content from stored interpretation and evidence', () => {
    const first = renderToStaticMarkup(
      createElement(AssessmentReportV2Content, {
        customerName: 'Demo V2 Profile',
        snapshotAt: '2026-04-29T00:00:00.000Z',
        interpretationRun,
        sections,
        inventorySummary,
        costSummary,
        frameworkInsights,
        licenseSummary,
        organizationContext,
        recommendations: [{ title: 'Improve Defender posture', subtitle: 'P1 • Security', detail: 'Reduce the highest-risk exposure first.' }],
        challenges: [{ title: 'Delivery capacity drag', subtitle: 'High • Operating model', detail: 'Current ownership shape slows remediation.' }],
        initiatives: [{ title: 'Cleanup backlog', subtitle: 'High • In progress', detail: 'Existing initiative shaping is already captured.' }],
      }),
    );
    const second = renderToStaticMarkup(
      createElement(AssessmentReportV2Content, {
        customerName: 'Demo V2 Profile',
        snapshotAt: '2026-04-29T00:00:00.000Z',
        interpretationRun,
        sections,
        inventorySummary,
        costSummary,
        frameworkInsights,
        licenseSummary,
        organizationContext,
        recommendations: [{ title: 'Improve Defender posture', subtitle: 'P1 • Security', detail: 'Reduce the highest-risk exposure first.' }],
        challenges: [{ title: 'Delivery capacity drag', subtitle: 'High • Operating model', detail: 'Current ownership shape slows remediation.' }],
        initiatives: [{ title: 'Cleanup backlog', subtitle: 'High • In progress', detail: 'Existing initiative shaping is already captured.' }],
      }),
    );

    expect(first).toBe(second);
    expect(first).toContain('Assessment Report V2');
    expect(first).toContain('Edited business context for the regression harness.');
    expect(first).toContain('Profile-scoped snapshot evidence only.');
    expect(first).toContain('Improve Defender posture');
    expect(first).toContain('Leadership takeaways remain editable and exportable.');
  });
});
