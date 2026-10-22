/**
 * insightRules.ts — auto-generate executive insights from module data.
 */

import type { ExecutiveInsight } from '../types';

type Severity = ExecutiveInsight['severity'];

interface RuleInput {
  totalCost?: number;
  costTrendPercent?: number;
  secureScore?: number;
  advisorScore?: number;
  totalResources?: number;
  unusedLicenses?: number;
  totalLicenses?: number;
  integrationCount?: number;
  dataGapCount?: number;
}

export function generateInsights(input: RuleInput): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  let order = 1;

  const add = (
    category: ExecutiveInsight['category'],
    title: string,
    description: string,
    severity: Severity,
    recommendation: string
  ) => {
    insights.push({
      category,
      title,
      description,
      severity,
      recommendation,
      order: order++,
    });
  };

  // Cost trend warning
  if (input.costTrendPercent !== undefined && input.costTrendPercent > 10) {
    add(
      'cost',
      'Cost Spike Detected',
      `Monthly costs have increased by ${input.costTrendPercent.toFixed(1)}%.`,
      'high',
      'Review recent deployments and identify unused or over-provisioned resources.'
    );
  }

  // Low secure score
  if (input.secureScore !== undefined && input.secureScore < 50) {
    add(
      'security',
      'Low Microsoft Secure Score',
      `Current Secure Score is ${input.secureScore}%, well below the recommended 70% threshold.`,
      'critical',
      'Prioritize security recommendations from Microsoft Defender for Cloud.'
    );
  } else if (input.secureScore !== undefined && input.secureScore < 70) {
    add(
      'security',
      'Moderate Security Posture',
      `Secure Score is ${input.secureScore}%. Target at least 70%.`,
      'medium',
      'Address top-priority security recommendations.'
    );
  }

  // Low advisor score
  if (input.advisorScore !== undefined && input.advisorScore < 50) {
    add(
      'operational',
      'Low Azure Advisor Score',
      `Advisor score is ${input.advisorScore}%. Multiple best-practice recommendations are pending.`,
      'high',
      'Review and implement Azure Advisor recommendations across all categories.'
    );
  }

  // Unused licenses
  if (
    input.unusedLicenses !== undefined &&
    input.totalLicenses !== undefined &&
    input.totalLicenses > 0
  ) {
    const unusedPct = (input.unusedLicenses / input.totalLicenses) * 100;
    if (unusedPct > 20) {
      add(
        'licensing',
        'High License Waste',
        `${input.unusedLicenses} licenses (${unusedPct.toFixed(0)}%) appear unused or unassigned.`,
        'high',
        'Audit license assignments and reclaim unused seats to reduce costs.'
      );
    }
  }

  // Data gaps
  if (input.dataGapCount !== undefined && input.dataGapCount > 3) {
    add(
      'data_quality',
      'Multiple Data Gaps Detected',
      `${input.dataGapCount} data gaps were encountered during assessment. Some modules may have incomplete data.`,
      'medium',
      'Review the Data Pull page and ensure required API permissions are granted.'
    );
  }

  // Large estate
  if (input.totalResources !== undefined && input.totalResources > 500) {
    add(
      'operational',
      'Large Resource Estate',
      `${input.totalResources} resources detected. Consider resource tagging and governance policies.`,
      'low',
      'Enforce tagging policies and set up Azure Policy for resource governance.'
    );
  }

  return insights;
}
