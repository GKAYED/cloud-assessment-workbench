/**
 * All TypeScript interfaces — mirrors backend Pydantic models.
 */

// ─── Common ─────────────────────────────────────────────────────────────────

export interface ErrorResponse {
  error: string;
  message: string;
}

export interface LoadingStatus {
  module_name: string;
  status: 'pending' | 'loading' | 'success' | 'error' | 'partial';
  message?: string;
  items_loaded?: number;
  started_at?: string;
  completed_at?: string;
}

// ─── Profiles ───────────────────────────────────────────────────────────────

export interface CustomerProfile {
  id: number;
  customer_name: string;
  tenant_id?: string | null;
  tenant_display_name?: string | null;
  last_assessed_at?: string | null;
  status: 'Active' | 'Cached';
  report_version: 'legacy' | 'v2';
  created_at: string;
  updated_at: string;
}

/** Auth status returned by /api/auth/status/:id */
export interface AuthStatus {
  profile_id: number;
  authenticated: boolean;
  username?: string | null;
  tenant_id?: string | null;
  auth_type?: string | null;
  available_scopes?: string[] | null;
}

export interface CustomerProfileCreate {
  customer_name: string;
  report_version?: 'legacy' | 'v2';
}

export interface CustomerProfileUpdate {
  customer_name?: string;
  tenant_id?: string;
  tenant_display_name?: string;
  report_version?: 'legacy' | 'v2';
}

export interface ProfileActivateResponse {
  id: number;
  customer_name: string;
  status: string;
  previous_active_profile_id?: number | null;
}

export interface SnapshotSaveRequest {
  modules: Record<string, unknown>;
  is_partial?: boolean;
}

export interface SnapshotSaveResponse {
  profile_id: number;
  snapshot_at: string;
  modules_saved: number;
  is_partial: boolean;
}

export interface SnapshotLoadResponse {
  profile_id: number;
  customer_name: string;
  snapshot_at?: string | null;
  is_partial: boolean;
  modules: Record<string, unknown>;
}

export interface SnapshotModuleResponse {
  profile_id: number;
  module_name: string;
  snapshot_at?: string | null;
  data: unknown;
}

export type OrganisationSize = 'Small' | 'Medium' | 'Large' | 'Enterprise';

export interface OrganizationImage {
  name?: string | null;
  data?: string | null;
}

export interface OrganizationContext {
  id: number;
  profile_id: number;
  organisation_size?: OrganisationSize | null;
  organisation_overview?: string | null;
  assessment_scope_notes?: string | null;
  assessment_boundary_notes?: string | null;
  leadership_context_notes?: string | null;
  operating_model_notes?: string | null;
  it_team_summary?: string | null;
  vendor_dependency_notes?: string | null;
  tailoring_notes?: string | null;
  org_structure_image_name?: string | null;
  org_structure_image_data?: string | null;
  it_team_structure_image_name?: string | null;
  it_team_structure_image_data?: string | null;
  it_team_structure_images?: OrganizationImage[] | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationContextUpdate {
  organisation_size?: OrganisationSize | null;
  organisation_overview?: string | null;
  assessment_scope_notes?: string | null;
  assessment_boundary_notes?: string | null;
  leadership_context_notes?: string | null;
  operating_model_notes?: string | null;
  it_team_summary?: string | null;
  vendor_dependency_notes?: string | null;
  tailoring_notes?: string | null;
  org_structure_image_name?: string | null;
  org_structure_image_data?: string | null;
  it_team_structure_image_name?: string | null;
  it_team_structure_image_data?: string | null;
  it_team_structure_images?: OrganizationImage[] | null;
}

export interface TranscriptTarget {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
}

export interface TranscriptTargetCreate {
  name: string;
  description?: string | null;
}

export interface TranscriptArtifact {
  id: number;
  transcript_id: number;
  target_id?: number | null;
  kind: string;
  title: string;
  description?: string | null;
  markdown_content: string;
  created_at: string;
  updated_at: string;
}

export interface TranscriptArtifactUpdate {
  title?: string;
  description?: string | null;
  markdown_content?: string;
}

export interface Transcript {
  id: number;
  profile_id: number;
  title: string;
  source_label?: string | null;
  transcript_text: string;
  status: string;
  targets: TranscriptTarget[];
  artifacts: TranscriptArtifact[];
  created_at: string;
  updated_at: string;
}

export interface TranscriptCreate {
  title: string;
  source_label?: string | null;
  transcript_text: string;
  extraction_targets: TranscriptTargetCreate[];
}

export interface ExistingMarkdownReference {
  id: string;
  title: string;
  relative_path: string;
}

export interface ExistingMarkdownContent extends ExistingMarkdownReference {
  content: string;
}

export interface TranscriptProcessingStatus {
  enabled: boolean;
  model?: string | null;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface Subscription {
  subscription_id: string;
  display_name: string;
  state: string;
  tenant_id: string;
}

export interface ResourceGroup {
  name: string;
  location: string;
  subscription_id: string;
  tags: Record<string, string>;
  provisioning_state: string;
  resource_count: number;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  location: string;
  resource_group: string;
  subscription_id: string;
  subscription_name?: string;
  tags: Record<string, string>;
  is_tagged: boolean;
}

export interface DatabaseOverview {
  resource_id: string;
  resource_name: string;
  database_type: string;
  sku_tier?: string | null;
  sku_name?: string | null;
  max_size_gb?: number | null;
  current_size_gb?: number | null;
  dtu_capacity?: number | null;
  vcore_count?: number | null;
  size_source?: 'current' | 'max_fallback' | 'unknown';
  status: string;
  subscription_id: string;
  resource_group: string;
}

export interface InventorySummary {
  total_subscriptions: number;
  total_resource_groups: number;
  total_resources: number;
  resources_by_type: Record<string, number>;
  resources_by_location: Record<string, number>;
  resources_by_resource_group?: Record<string, number>;
  untagged_count: number;
  untagged_percentage: number;
}

export interface InventoryTreeNode {
  id: string;
  name: string;
  label?: string;
  type: 'subscription' | 'resource_group' | 'resource';
  location?: string;
  resource_type?: string;
  children: InventoryTreeNode[];
  tags: Record<string, string>;
}

// ─── Costs ──────────────────────────────────────────────────────────────────

export interface CostRecord {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  resource_group: string;
  subscription_id: string;
  cost_1m: number;
  cost_3m: number;
  cost_6m: number;
  currency: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  monthly_avg_3m: number;
  monthly_avg_6m: number;
}

export interface CostRollup {
  group_key: string;
  group_type: 'subscription' | 'resource_group' | 'resource_type';
  subscription_id?: string;
  cost_1m: number;
  cost_3m: number;
  cost_6m: number;
  currency: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  resource_count: number;
  resource_name?: string;
  resource_type?: string;
  resource_group?: string;
  subscription_name?: string;
  amount?: number;
}

export interface CostSummary {
  total_cost_1m: number;
  total_cost_3m: number;
  total_cost_6m: number;
  currency: string;
  top_cost_drivers: CostRecord[];
  overall_trend: 'increasing' | 'decreasing' | 'stable';
  total?: number;
  trend_direction?: string;
  trend_percent?: number;
  by_month?: { month: string; amount: number }[];
}

// ─── Security ───────────────────────────────────────────────────────────────

export interface AdvisorScore {
  pillar: string;
  category?: string;
  subscription_id?: string;
  subscription_name?: string;
  score: number;
  max_score: number;
  percentage: number;
  potential_score_increase?: number;
  date?: string;
}

export interface AdvisorScoresResponse {
  aggregated_scores: AdvisorScore[];
  scores_by_subscription: AdvisorScore[];
  data_gaps?: DataGap[];
}

export interface AdvisorRecommendation {
  id: string;
  category: string;
  impact: 'High' | 'Medium' | 'Low';
  resource_id: string;
  resource_name?: string;
  resource_type: string;
  description: string;
  remediation: string;
  subscription_id: string;
  subscription_name?: string;
}

export interface SecureScore {
  subscription_id: string;
  subscription_name: string;
  current_score: number;
  max_score: number;
  percentage: number;
  unavailable?: boolean;
}

export interface DefenderControl {
  subscription_id: string;
  name: string;
  current_score: number;
  max_score: number;
  percentage: number;
  healthy_count: number;
  unhealthy_count: number;
  not_applicable_count: number;
}

export interface SecurityPostureSummary {
  total_healthy: number;
  total_unhealthy: number;
  total_not_applicable: number;
  total_controls: number;
  controls_at_risk: number;
}

export interface DefenderScoreResponse {
  scores: SecureScore[];
  overall_percentage: number;
  overall_current: number;
  overall_max: number;
  controls?: DefenderControl[];
  posture_summary?: SecurityPostureSummary;
}

export interface CspmCoveredCapability {
  id: string;
  title: string;
  coverage: string;
  detail: string;
  source: string;
}

export interface CspmAssessmentSubscription {
  subscription_id: string;
  subscription_name: string;
  total: number;
  unhealthy: number;
  healthy: number;
  exempt: number;
  high: number;
  medium: number;
  low: number;
}

export interface CspmAssessmentFinding {
  name: string;
  severity: string;
  unhealthy: number;
  subscriptions: number;
}

export interface CspmAttackPathSubscription {
  subscription_id: string;
  subscription_name: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CspmAttackPath {
  name: string;
  risk_level: string;
  subscription_name: string;
  entry_point: string;
  target: string;
}

export interface CspmUnavailableSignal {
  id: string;
  title: string;
  status: string;
  detail: string;
  remediation: string;
}

export interface CspmInsightsResponse {
  already_covered: CspmCoveredCapability[];
  subscription_count: number;
  assessment_summary: {
    totals: Record<string, number>;
    by_subscription: CspmAssessmentSubscription[];
    top_findings: CspmAssessmentFinding[];
  };
  attack_path_summary: {
    totals: Record<string, number>;
    by_subscription: CspmAttackPathSubscription[];
    top_paths: CspmAttackPath[];
  };
  unavailable_signals: CspmUnavailableSignal[];
  data_gaps?: DataGap[];
}

// ─── Governance ─────────────────────────────────────────────────────────────

export interface PolicyNonCompliant {
  policy_assignment_id: string;
  policy_name: string;
  non_compliant_resources: number;
  non_compliant_policies: number;
  subscription_name?: string;
}

export interface PolicySubscription {
  subscription_id: string;
  subscription_name?: string;
  total_resources: number;
  compliant: number;
  non_compliant_resources: number;
  non_compliant_policies: number;
  compliance_rate?: number;
  non_compliance_rate?: number;
  policy_assignments: number;
  top_non_compliant: PolicyNonCompliant[];
}

export interface PolicyComplianceResponse {
  by_subscription: PolicySubscription[];
  total_non_compliant_resources: number;
  total_non_compliant_policies: number;
  total_policy_assignments: number;
  subscription_count: number;
  data_gaps: DataGap[];
}

export interface RoleAssignment {
  id: string;
  subscription_id: string;
  subscription_name?: string;
  principal_id: string;
  principal_type: string;
  role_name: string;
  role_definition_id: string;
  scope: string;
  created_on: string;
}

export interface RoleAssignmentsResponse {
  assignments: RoleAssignment[];
  total_count: number;
  by_role: Record<string, number>;
  by_principal_type: Record<string, number>;
  owner_count: number;
  contributor_count: number;
  subscription_count: number;
  data_gaps: DataGap[];
}

export interface OrphanedResource {
  category: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  location: string;
  resource_group: string;
  subscription_id: string;
  subscription_name?: string;
  sku_name: string;
  size_gb: number | null;
  ip: string;
}

export interface OrphanedResourcesResponse {
  orphans: OrphanedResource[];
  by_type: Record<string, number>;
  total_count: number;
  data_gaps: DataGap[];
}

// ─── Integrations ───────────────────────────────────────────────────────────

export interface IntegrationPoint {
  id: string;
  name?: string;
  source_resource_id: string;
  source_resource_name: string;
  source_resource_type: string;
  source_system?: string;
  integration_type: string;
  target_resource_id: string;
  target_name: string;
  target_type: string;
  target_system?: string;
  protocol?: string;
  health_status?: string | null;
  azure_service?: string;
  direction: 'Inbound' | 'Outbound' | 'Bidirectional' | string;
  details: string;
  subscription_id: string;
  is_deprecated_source: boolean;
  is_deprecated_target: boolean;
  annotation?: string | null;
}

export interface IntegrationAnnotation {
  id: number;
  profile_id: number;
  integration_id: string;
  is_manual?: boolean;
  integration_name?: string | null;
  source_component?: string | null;
  target_endpoint?: string | null;
  source_application?: string | null;
  target_application?: string | null;
  logical_integration_group?: string | null;
  subscription_name?: string | null;
  resource_group_name?: string | null;
  integration_type?: string | null;
  protocol?: string | null;
  direction?: string | null;
  business_purpose?: string | null;
  external_party_vendor?: string | null;
  owning_department?: string | null;
  business_owner?: string | null;
  criticality?: string | null;
  environment?: string | null;
  validation_status?: string | null;
  annotation_text: string;
  annotated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationAnnotationCreate {
  integration_id: string;
  is_manual?: boolean;
  integration_name?: string;
  source_component?: string;
  target_endpoint?: string;
  source_application?: string;
  target_application?: string;
  logical_integration_group?: string;
  subscription_name?: string;
  resource_group_name?: string;
  integration_type?: string;
  protocol?: string;
  direction?: string;
  business_purpose?: string;
  external_party_vendor?: string;
  owning_department?: string;
  business_owner?: string;
  criticality?: string;
  environment?: string;
  validation_status?: string;
  annotation_text?: string;
  annotated_by?: string;
}

export interface IntegrationSummary {
  total_integrations: number;
  by_type: Record<string, number>;
  deprecated_count: number;
  healthy?: number;
  degraded?: number;
  failing?: number;
  health_measured?: boolean;
}

export interface IntegrationRecommendation {
  title: string;
  description: string;
  affected_integrations: string[];
  priority: string;
}

export interface IntegrationReviewItem {
  id: string;
  priority: string;
  integration: string;
  integration_method: string;
  current_understanding: string;
  to_confirm: string;
  status: string;
  meeting_notes: string;
}

export interface IntegrationReviewRecord {
  id?: number;
  profile_id: number;
  items: IntegrationReviewItem[];
  is_seeded: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface IntegrationReviewUpdate {
  items: IntegrationReviewItem[];
}

// ─── Stakeholder Interviews ─────────────────────────────────────────────────

export interface StakeholderNote {
  id: number;
  profile_id: number;
  stakeholder_name: string;
  role?: string | null;
  department?: string | null;
  interview_date?: string | null;
  notes?: string | null;
  key_findings?: string | null;
  pain_points?: string | null;
  source_meeting?: string | null;
  validation_status?: string | null;
  linked_app_ids?: number[] | null;
  linked_initiative_ids?: number[] | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface StakeholderNoteCreate {
  stakeholder_name: string;
  role?: string;
  department?: string;
  interview_date?: string;
  notes?: string;
  key_findings?: string;
  pain_points?: string;
  source_meeting?: string;
  validation_status?: string;
  linked_app_ids?: number[];
  linked_initiative_ids?: number[];
  tags?: string[];
}

// ─── Dynamics 365 ───────────────────────────────────────────────────────────

export interface D365Environment {
  id: string;
  display_name: string;
  name?: string;
  domain_name?: string;
  environment_type: string;
  type?: string;
  region: string;
  url: string;
  database_capacity_used_mb: number | null;
  database_capacity_allocated_mb: number | null;
  file_capacity_used_mb: number | null;
  file_capacity_allocated_mb: number | null;
  state: string;
  status?: string;
  version?: string;
}

export interface D365User {
  user_id: string;
  full_name: string;
  display_name?: string;
  email: string;
  is_disabled: boolean;
  business_unit: string;
  environment?: string;
  security_roles: string[];
  roles?: string[];
  last_login?: string | null;
  is_active_30d: boolean | null;
  license_type?: string;
}

export interface D365ModuleStats {
  environment_id: string;
  entity_name: string;
  record_count: number | null;
  module: string;
}

export interface D365WorkflowHealth {
  environment_id: string;
  workflow_name: string;
  category: number | null;
  state: string;
  status: string;
  name?: string;
  success_rate?: number;
  total_runs?: number;
}

export interface D365BCStats {
  environment_id: string;
  company_name: string;
  customers_count: number | null;
  vendors_count: number | null;
  items_count: number | null;
  gl_entries_count: number | null;
}

export interface DynamicsManualContext {
  id: number;
  profile_id: number;
  extra_environments?: string | null;
  dataverse_capacity_notes?: string | null;
  dataverse_license_notes?: string | null;
  dataverse_cost_notes?: string | null;
  discovery_gap_notes?: string | null;
  additional_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DynamicsManualContextUpdate {
  extra_environments?: string | null;
  dataverse_capacity_notes?: string | null;
  dataverse_license_notes?: string | null;
  dataverse_cost_notes?: string | null;
  discovery_gap_notes?: string | null;
  additional_notes?: string | null;
}

export interface DynamicsResourceOverride {
  id: number;
  profile_id: number;
  resource_id: string;
  override_status: 'confirmed_dynamics' | 'possible' | 'shared' | 'not_dynamics';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Licenses ───────────────────────────────────────────────────────────────

export interface LicenseSKU {
  sku_id: string;
  sku_part_number: string;
  sku_display_name: string;
  purchased: number;
  consumed: number;
  available: number;
  utilization_pct: number;
  is_underutilized: boolean;
  is_payg?: boolean;
  sku_name?: string;
  friendly_name?: string;
  total?: number;
  assigned?: number;
  utilization_percent?: number;
}

export interface UserLicense {
  user_id: string;
  display_name: string;
  user_principal_name: string;
  assigned_licenses: string[];
  last_sign_in?: string | null;
  is_inactive_30d: boolean | null;
  estimated_monthly_cost: number | null;
}

export interface LicenseSummary {
  total_skus: number;
  total_purchased: number;
  total_consumed: number;
  total_available: number;
  overall_utilization_pct: number;
  underutilized_skus: LicenseSKU[];
  inactive_licensed_users: number;
  estimated_waste_monthly: number | null;
  total_licenses?: number;
  assigned_licenses?: number;
  unused_licenses?: number;
  estimated_monthly_cost?: number | null;
  payg_note?: string | null;
}

// ─── Portfolio ──────────────────────────────────────────────────────────────

export interface AppPortfolioEntry {
  id: number;
  profile_id: number;
  app_name: string;
  purpose?: string | null;
  business_owner?: string | null;
  technical_owner?: string | null;
  vendor?: string | null;
  support_model?: string | null;
  status?: string | null;
  criticality?: string | null;
  linked_resource_ids?: string[] | null;
  monthly_cost?: number | null;
  business_value?: number | null;
  technical_fitness?: number | null;
  complexity?: number | null;
  strategic_fit?: number | null;
  time_classification?: string | null;
  future_state?: string | null;
  known_risks?: string | null;
  notes?: string | null;
  business_criticality?: string;
  current_hosting?: string;
  fit_score?: number;
  created_at: string;
  updated_at: string;
}

export interface AppPortfolioEntryCreate {
  app_name: string;
  purpose?: string;
  business_owner?: string;
  technical_owner?: string;
  vendor?: string;
  support_model?: string;
  current_hosting?: string;
  status?: string;
  criticality?: string;
  linked_resource_ids?: string[];
  monthly_cost?: number;
  business_value?: number;
  technical_fitness?: number;
  complexity?: number;
  strategic_fit?: number;
  time_classification?: string;
  future_state?: string;
  known_risks?: string;
  notes?: string;
}

// ─── Initiatives ────────────────────────────────────────────────────────────

export type { Initiative, InitiativeCreate } from './initiative';

// ─── Recommendations ───────────────────────────────────────────────────────

export interface Recommendation {
  id: number;
  profile_id: number;
  recommendation_id?: string | null;
  title: string;
  description?: string | null;
  priority: string;
  category?: string | null;
  recommendation_type?: string | null;
  primary_outcome?: string | null;
  why_it_matters?: string | null;
  practical_next_step?: string | null;
  evidence_sources?: string[] | null;
  reinforcement_level?: string | null;
  manual_entry: boolean;
  validation_status?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationCreate {
  recommendation_id?: string;
  title: string;
  description?: string;
  priority?: string;
  category?: string;
  recommendation_type?: string;
  primary_outcome?: string;
  why_it_matters?: string;
  practical_next_step?: string;
  evidence_sources?: string[];
  reinforcement_level?: string;
  manual_entry?: boolean;
  validation_status?: string;
  notes?: string;
}

export interface ApplicationDiscoveryAnnotation {
  id: number;
  profile_id: number;
  subscription_id: string;
  resource_group: string;
  business_description?: string | null;
  owning_department?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDiscoveryAnnotationCreate {
  subscription_id: string;
  resource_group: string;
  business_description?: string;
  owning_department?: string;
}

// ─── Challenges ────────────────────────────────────────────────────────────

export interface Challenge {
  id: number;
  profile_id: number;
  challenge_id?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  impact_level: string;
  primary_effect?: string | null;
  why_it_matters?: string | null;
  evidence_sources?: string[] | null;
  reinforcement_level?: string | null;
  capability_opportunities?: string[] | null;
  manual_entry: boolean;
  validation_status?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeCreate {
  challenge_id?: string;
  title: string;
  description?: string;
  category?: string;
  impact_level?: string;
  primary_effect?: string;
  why_it_matters?: string;
  evidence_sources?: string[];
  reinforcement_level?: string;
  capability_opportunities?: string[];
  manual_entry?: boolean;
  validation_status?: string;
  notes?: string;
}

// ─── Insights ───────────────────────────────────────────────────────────────

export interface ExecutiveInsight {
  id?: string;
  category: string;
  severity: 'high' | 'medium' | 'low' | 'critical';
  title: string;
  message?: string;
  metric_value?: string | null;
  data_source?: string;
  description?: string;
  recommendation?: string;
  order?: number;
}

export interface DataGap {
  id: string;
  module: string;
  missing_data: string;
  field?: string;
  reason: string;
  recommendation: string;
  remediation?: string;
  severity: 'high' | 'medium' | 'low';
  timestamp?: string | null;
}

// ─── Module Data (used by hooks) ────────────────────────────────────────────

export type ModuleName =
  | 'inventory'
  | 'inventory_summary'
  | 'databases'
  | 'costs'
  | 'cost_summary'
  | 'security'
  | 'integrations'
  | 'dynamics'
  | 'bc_stats'
  | 'licenses'
  | 'data_gaps'
  | 'insights'
  | 'portfolio'
  | 'initiatives'
  | 'governance_policy'
  | 'governance_rbac'
  | 'governance_orphans';

export interface ModuleState<T = unknown> {
  status: 'pending' | 'loading' | 'success' | 'error';
  data: T | null;
  error?: string;
}
