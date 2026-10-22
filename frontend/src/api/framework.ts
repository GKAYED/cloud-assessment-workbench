/**
 * Framework Insights API client.
 */

import { directGet, directPut, get } from './client';

export interface WafFinding {
  source: string;
  subscription_name?: string;
  subscription_id?: string;
  detail: string;
  checklist_ref: string;
}

export interface Phase2Opportunity {
  title: string;
  description: string;
  ref: string;
  pillar?: string;
}

export interface WafPillar {
  code: string;
  name: string;
  description: string;
  checklist_range: string;
  score: number;
  has_data: boolean;
  evidence_count: number;
  findings: WafFinding[];
  phase2_opportunities: Phase2Opportunity[];
}

export interface CafSubDimension {
  name: string;
  status: string;
  score: number | null;
  signals: string[];
}

export interface CafNextLevelAction {
  action: string;
  current_value: string;
  target_value: string;
  impact: string;
}

export interface CafRecommendation {
  source: string;
  category: string;
  impact: string;
  description: string;
}

export interface CafControl {
  name: string;
  unhealthy_count: number;
  percentage: number;
  healthy_count: number;
}

export interface CafMethodology {
  name: string;
  description: string;
  maturity: number;
  maturity_label: string;
  has_signals: boolean;
  signals: string[];
  sub_dimensions?: CafSubDimension[];
  next_level_actions?: CafNextLevelAction[];
  top_recommendations?: CafRecommendation[];
  top_controls?: CafControl[];
}

export interface FrameworkPriorityAction {
  title: string;
  priority: string;
  rationale: string;
  recommended_action: string;
  reference: string;
}

export interface FrameworkDataGap {
  module?: string;
  field?: string;
  reason?: string;
  severity?: string;
  remediation?: string;
}

export interface FrameworkInsightsResponse {
  waf_pillars: Record<string, WafPillar>;
  waf_overall_score: number;
  scored_pillars_count: number;
  total_pillars: number;
  caf_methodologies: Record<string, CafMethodology>;
  caf_average_maturity: number;
  phase2_summary: Phase2Opportunity[];
  phase2_count: number;
  priority_actions: FrameworkPriorityAction[];
  data_gaps: FrameworkDataGap[];
  assessment_scope: string;
}

export type ManualFrameworkRating = 'red' | 'amber' | 'green';
export type MethodologyManualRatings = Record<string, Record<string, ManualFrameworkRating>>;

export interface FrameworkManualCafRecord {
  id?: number | null;
  profile_id: number;
  ratings: MethodologyManualRatings;
  created_at?: string | null;
  updated_at?: string | null;
}

export const frameworkApi = {
  insights: () => get<FrameworkInsightsResponse>('/api/framework-insights'),
  getManualCaf: (profileId: number) =>
    directGet<FrameworkManualCafRecord>(`/api/framework-insights/profiles/${profileId}/manual-caf`),
  updateManualCaf: (profileId: number, body: { ratings: MethodologyManualRatings }) =>
    directPut<FrameworkManualCafRecord>(`/api/framework-insights/profiles/${profileId}/manual-caf`, body),
};
