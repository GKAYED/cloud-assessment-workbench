/** @vitest-environment jsdom */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExecutiveSummaryContent } from '../../components/report/assessment/ExecutiveSummaryContent';
import { anonymousCostFixture, anonymousCafMethodologyFixture } from '../__fixtures__/anonymousProfileFixture';
import {
  completeReportRegressionFixture,
  partialReportRegressionFixture,
} from '../__fixtures__/reportRegressionFixtures';
import type {
  DefenderScoreResponse,
  ExecutiveInsight,
  InventorySummary,
  LicenseSummary,
} from '../../types';
import type { FrameworkInsightsResponse } from '../../api/framework';

type ExecutiveSummaryProps = Parameters<typeof ExecutiveSummaryContent>[0];

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function buildInventorySummary(
  subscriptions = completeReportRegressionFixture.subscriptions,
  resourceGroups = completeReportRegressionFixture.resourceGroups,
  resources = completeReportRegressionFixture.resources,
): InventorySummary {
  const resourcesByType: Record<string, number> = {};
  const resourcesByLocation: Record<string, number> = {};
  for (const resource of resources) {
    resourcesByType[resource.type] = (resourcesByType[resource.type] ?? 0) + 1;
    resourcesByLocation[resource.location] = (resourcesByLocation[resource.location] ?? 0) + 1;
  }

  return {
    total_subscriptions: subscriptions.length,
    total_resource_groups: resourceGroups.length,
    total_resources: resources.length,
    resources_by_type: resourcesByType,
    resources_by_location: resourcesByLocation,
    untagged_count: resources.filter((resource) => !resource.is_tagged).length,
    untagged_percentage: Number(
      ((resources.filter((resource) => !resource.is_tagged).length / Math.max(1, resources.length)) * 100).toFixed(1),
    ),
  };
}

function buildCostSummary() {
  const cost1m = sum(anonymousCostFixture.costByResource.map((row) => row.cost_1m));
  const cost6m = sum(anonymousCostFixture.costByResource.map((row) => row.cost_6m));

  return {
    total_cost_1m: cost1m,
    total_cost_6m: cost6m,
    total: cost1m,
  };
}

function buildDefenderFixture(): DefenderScoreResponse {
  return {
    scores: [
      {
        subscription_id: completeReportRegressionFixture.subscriptions[0].subscription_id,
        subscription_name: completeReportRegressionFixture.subscriptions[0].display_name,
        current_score: 77,
        max_score: 200,
        percentage: 38.5,
      },
    ],
    overall_percentage: 38.5,
    overall_current: 77,
    overall_max: 200,
    posture_summary: {
      total_healthy: 321,
      total_unhealthy: 392,
      total_not_applicable: 0,
      total_controls: 713,
      controls_at_risk: 14,
    },
  };
}

function buildLicenseSummary(): LicenseSummary {
  return {
    total_skus: 4,
    total_purchased: 100,
    total_consumed: 74,
    total_available: 26,
    overall_utilization_pct: 74,
    underutilized_skus: [
      {
        sku_id: 'sku-sales-enterprise',
        sku_part_number: 'D365-SALES-ENT',
        sku_display_name: 'Dynamics 365 Sales Enterprise Edition',
        purchased: 40,
        consumed: 26,
        available: 14,
        utilization_pct: 65,
        is_underutilized: true,
        is_payg: false,
        sku_name: 'Dynamics 365 Sales Enterprise Edition',
        friendly_name: 'Sales Enterprise',
        total: 40,
        assigned: 26,
        utilization_percent: 65,
      },
    ],
    inactive_licensed_users: 9,
    estimated_waste_monthly: 2034.75,
  };
}

function buildFrameworkFixture(): FrameworkInsightsResponse {
  return {
    waf_pillars: {
      reliability: {
        code: 'R',
        name: 'Reliability',
        description: 'Sample reliability pillar',
        checklist_range: '0-5',
        score: 86,
        has_data: true,
        evidence_count: 4,
        findings: [],
        phase2_opportunities: [],
      },
      security: {
        code: 'S',
        name: 'Security',
        description: 'Sample security pillar',
        checklist_range: '0-5',
        score: 40,
        has_data: true,
        evidence_count: 3,
        findings: [],
        phase2_opportunities: [],
      },
    },
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
    assessment_scope: 'Stored snapshot evidence for the current assessment profile.',
  };
}

function buildExecutiveSummaryProps(
  mode: 'complete' | 'partial',
): ExecutiveSummaryProps {
  const inventory = buildInventorySummary(
    mode === 'complete' ? completeReportRegressionFixture.subscriptions : partialReportRegressionFixture.subscriptions,
    mode === 'complete' ? completeReportRegressionFixture.resourceGroups : partialReportRegressionFixture.resourceGroups,
    mode === 'complete' ? completeReportRegressionFixture.resources : partialReportRegressionFixture.resources,
  );

  const completeInsights: ExecutiveInsight[] = [
    {
      id: 'insight-1',
      category: 'security',
      severity: 'high',
      title: 'Security posture remains the key leadership concern',
      description: 'Security hardening work needs sustained follow-through to reduce active risk.',
      recommendation: 'Prioritise the highest-risk Defender gaps first.',
      metric_value: '38.5%',
      order: 1,
    },
  ];

  return {
    customerName: mode === 'complete' ? 'Demo Complete Profile' : 'Demo Partial Profile',
    invSummary: inventory,
    costSummary: mode === 'complete' ? buildCostSummary() : null,
    defender: mode === 'complete' ? buildDefenderFixture() : null,
    licSummary: mode === 'complete' ? buildLicenseSummary() : null,
    framework: mode === 'complete' ? buildFrameworkFixture() : null,
    snapshotAt: '2026-04-21T00:00:00.000Z',
    recommendedActionsCount: mode === 'complete' ? 4 : 1,
    executiveSummaryNarrativePoints: [
      'The estate is functional, but delivery pressure is rising.',
      'The biggest gains come from consistent prioritisation and follow-through.',
    ],
    executiveFindingRows: mode === 'complete'
      ? [
          { area: 'Security', current: '38.5% secure score', why: 'Provides a clear baseline for remediation.' },
          { area: 'Cost', current: '$135 monthly sample spend', why: 'Shows the spend concentration story.' },
        ]
      : [
          { area: 'Inventory', current: '1 resource discovered', why: 'Confirms the fixture renders explicit partial data.' },
        ],
    executiveDeliverableRows: [
      {
        name: 'Executive Summary',
        picture: 'High-level leadership summary',
        exportRows: [
          { label: 'Summary', fileName: 'summary', rows: [{ 'Report Section': 'Executive Summary', Value: 'Demo' }] },
        ],
      },
    ],
    executiveConcentratedSubscriptions: [
      { Subscription: 'Demo Web Subscription', 'Resource Groups': 2, Resources: 3 },
    ],
    executiveHighestSpendSubscriptions: [
      { Subscription: 'Demo Web Subscription', 'Last Month': '$125', Trend: 'stable' },
    ],
    executiveRoleSummaryRows: [
      { Role: 'Reader', Assignments: 12 },
    ],
    executiveSecurityCategoryRows: [
      { Category: 'Identity', Recommendations: 4 },
    ],
    executivePriorityRecommendationRows: [
      { Recommendation: 'Improve Defender posture', Priority: 'High', Outcome: 'Reduce exposure' },
    ],
    executiveInitiativeRows: [
      { Initiative: 'Cleanup backlog', Priority: 'High', Status: 'In progress' },
    ],
    executiveInsightRows: completeInsights,
    executiveAnnualRunRate: 1620,
    executiveSecurityRecommendationSummary: { high: 1, medium: 2 },
    executiveTopSubscriptionDrivers: [
      { id: 'demo-web', name: 'Demo Web Subscription', amount: 125, share: 92.6 },
      { id: 'demo-shared', name: 'Demo Shared Services Subscription', amount: 10, share: 7.4 },
    ],
    executiveTopTypeDrivers: [
      { id: 'type-web', name: 'Web apps', amount: 100, share: 74.1 },
      { id: 'type-storage', name: 'Storage', amount: 25, share: 18.5 },
    ],
    subNameMap: new Map([[completeReportRegressionFixture.subscriptions[0].subscription_id, 'Demo Web Subscription']]),
    organizationContextSummary: 'Demo organisation context captured from the frozen regression fixture.',
    assessmentScopeNotes: 'Azure estate, cost, security, governance, and portfolio evidence.',
    assessmentBoundaryNotes: mode === 'complete' ? 'Fixture-driven boundary text for regression coverage.' : 'Partial fixture boundary text.',
    leadershipContextNotes: 'The report should stay profile-specific and avoid cross-profile bleed.',
  };
}

describe('report regression harness', () => {
  it('renders the same complete fixture deterministically', () => {
    const props = buildExecutiveSummaryProps('complete');
    const first = renderToStaticMarkup(createElement(ExecutiveSummaryContent, props));
    const second = renderToStaticMarkup(createElement(ExecutiveSummaryContent, props));

    expect(first).toBe(second);
    expect(first).toContain('Demo Complete Profile');
    expect(first).toContain('Azure Resources');
    expect(first).toContain('Demo Web Subscription');
    expect(first).toContain('38.5%');
    expect(first).toContain('Framework alignment');
  });

  it('keeps partial fixtures explicit about missing evidence', () => {
    const props = buildExecutiveSummaryProps('partial');
    const html = renderToStaticMarkup(createElement(ExecutiveSummaryContent, props));

    expect(html).toContain('Demo Partial Profile');
    expect(html).toContain('Framework alignment metrics are still being assembled.');
    expect(html).toContain('N/A');
    expect(html).toContain('Partial fixture boundary text.');
  });
});
