export const REPORT_EXCLUSIONS_STORAGE_PREFIX = 'azaudit_report_sections';
export const REPORT_APPENDIX_STORAGE_PREFIX = 'azaudit_report_appendix';
export const REPORT_RELEASE_MODE_STORAGE_PREFIX = 'azaudit_report_release_mode';
export const REPORT_SETTINGS_CHANGED_EVENT = 'azaudit-report-settings-changed';

export type ReportReleaseMode = 'draft' | 'major';

export type TopLevelReportSectionId =
  | 'rpt-exec-summary'
  | 'rpt-organization-context'
  | 'rpt-snapshot'
  | 'rpt-inventory'
  | 'rpt-costs'
  | 'rpt-security'
  | 'rpt-governance'
  | 'rpt-integrations'
  | 'rpt-integrationmap'
  | 'rpt-dynamics'
  | 'rpt-licenses'
  | 'rpt-portfolio'
  | 'rpt-challenges'
  | 'rpt-recommendations'
  | 'rpt-initiatives'
  | 'rpt-stakeholders'
  | 'rpt-framework'
  | 'rpt-actions';

export type ReportVisibilityId =
  | TopLevelReportSectionId
  | 'rpt-inventory-interpretation'
  | 'rpt-inventory-subscriptions'
  | 'rpt-inventory-resource-groups'
  | 'rpt-inventory-resource-types'
  | 'rpt-inventory-databases'
  | 'rpt-costs-interpretation'
  | 'rpt-costs-summary'
  | 'rpt-costs-monthly-trend'
  | 'rpt-costs-subscription'
  | 'rpt-costs-resource-group'
  | 'rpt-costs-resource-type'
  | 'rpt-costs-drivers'
  | 'rpt-security-interpretation'
  | 'rpt-security-defender'
  | 'rpt-security-controls'
  | 'rpt-security-advisor-scores'
  | 'rpt-security-advisor-recommendations'
  | 'rpt-security-exposure-signals'
  | 'rpt-governance-interpretation'
  | 'rpt-governance-policy'
  | 'rpt-governance-rbac'
  | 'rpt-governance-orphans'
  | 'rpt-governance-actions'
  | 'rpt-integrations-interpretation'
  | 'rpt-integrations-by-type'
  | 'rpt-integrations-register'
  | 'rpt-integrations-recommendations'
  | 'rpt-integrations-complexity'
  | 'rpt-integrationmap-diagram'
  | 'rpt-integrationmap-shortlist'
  | 'rpt-dynamics-interpretation'
  | 'rpt-dynamics-footprint'
  | 'rpt-dynamics-environments'
  | 'rpt-dynamics-users'
  | 'rpt-dynamics-modules'
  | 'rpt-dynamics-workflows'
  | 'rpt-dynamics-bc'
  | 'rpt-dynamics-linkage'
  | 'rpt-licenses-interpretation'
  | 'rpt-licenses-sku'
  | 'rpt-licenses-users'
  | 'rpt-portfolio-interpretation'
  | 'rpt-applications-discovery'
  | 'rpt-applications-discovery-register'
  | 'rpt-challenges-themes'
  | 'rpt-challenges-capabilities'
  | 'rpt-recommendations-themes'
  | 'rpt-recommendations-detail'
  | 'rpt-initiatives-interpretation'
  | 'rpt-stakeholders-synthesis'
  | 'rpt-framework-interpretation'
  | 'rpt-framework-waf'
  | 'rpt-framework-findings'
  | 'rpt-framework-caf'
  | 'rpt-framework-phase2';

export interface ReportVisibilityItem {
  id: ReportVisibilityId;
  title: string;
  children?: ReportVisibilityItem[];
}

export const REPORT_VISIBILITY_ITEMS: ReportVisibilityItem[] = [
  { id: 'rpt-exec-summary', title: 'Executive summary' },
  { id: 'rpt-organization-context', title: 'Organisation context' },
  { id: 'rpt-snapshot', title: 'Snapshot information' },
  {
    id: 'rpt-inventory',
    title: 'Azure estate overview',
    children: [
      { id: 'rpt-inventory-interpretation', title: '2.0 Estate overview' },
      { id: 'rpt-inventory-subscriptions', title: '2.1 Subscriptions' },
      { id: 'rpt-inventory-resource-groups', title: '2.2 Resource groups' },
      { id: 'rpt-inventory-resource-types', title: '2.3 Resources by type' },
      { id: 'rpt-inventory-databases', title: '2.4 Database overview' },
    ],
  },
  {
    id: 'rpt-costs',
    title: 'Cost analysis',
    children: [
      { id: 'rpt-costs-interpretation', title: '3.0 Cost overview' },
      { id: 'rpt-costs-summary', title: '3.1 Spend summary' },
      { id: 'rpt-costs-monthly-trend', title: '3.2 Monthly spend trend' },
      { id: 'rpt-costs-subscription', title: '3.3 Cost by subscription' },
      { id: 'rpt-costs-resource-group', title: '3.4 Cost by resource group' },
      { id: 'rpt-costs-resource-type', title: '3.5 Cost by resource type' },
      { id: 'rpt-costs-drivers', title: '3.6 Top cost drivers' },
    ],
  },
  {
    id: 'rpt-security',
    title: 'Security and compliance posture',
    children: [
      { id: 'rpt-security-interpretation', title: '4.0 Security overview' },
      { id: 'rpt-security-defender', title: '4.1 Microsoft Defender secure scores' },
      { id: 'rpt-security-controls', title: '4.2 Security controls breakdown' },
      { id: 'rpt-security-advisor-scores', title: '4.3 Azure Advisor scores' },
      { id: 'rpt-security-advisor-recommendations', title: '4.4 Azure Advisor recommendations' },
      { id: 'rpt-security-exposure-signals', title: '4.5 Exposure signals' },
    ],
  },
  {
    id: 'rpt-governance',
    title: 'Governance',
    children: [
      { id: 'rpt-governance-interpretation', title: '5.0 Governance overview' },
      { id: 'rpt-governance-policy', title: '5.1 Policy compliance' },
      { id: 'rpt-governance-rbac', title: '5.2 Role-based access control (RBAC)' },
      { id: 'rpt-governance-orphans', title: '5.3 Orphaned resources' },
      { id: 'rpt-governance-actions', title: '5.4 Governance action priorities' },
    ],
  },
  {
    id: 'rpt-integrations',
    title: 'Integration landscape',
    children: [
      { id: 'rpt-integrations-interpretation', title: '6.0 Integration overview' },
      { id: 'rpt-integrations-by-type', title: '6.1 Integrations by type' },
      { id: 'rpt-integrations-register', title: '6.2 Integration point register' },
      { id: 'rpt-integrations-recommendations', title: '6.3 Integration recommendations' },
      { id: 'rpt-integrations-complexity', title: '6.4 Integration complexity signals' },
    ],
  },
  {
    id: 'rpt-integrationmap',
    title: 'Integration map (reviewed)',
    children: [
      { id: 'rpt-integrationmap-diagram', title: '6.5 Reviewed architecture diagram' },
      { id: 'rpt-integrationmap-shortlist', title: '6.6 Reviewed integration shortlist' },
    ],
  },
  {
    id: 'rpt-dynamics',
    title: 'Dynamics 365 platform',
    children: [
      { id: 'rpt-dynamics-interpretation', title: '7.0 Dynamics overview' },
      { id: 'rpt-dynamics-footprint', title: '7.0.1 Dynamics footprint' },
      { id: 'rpt-dynamics-environments', title: '7.1 Environments' },
      { id: 'rpt-dynamics-users', title: '7.2 Users and roles' },
      { id: 'rpt-dynamics-modules', title: '7.3 Modules and solutions' },
      { id: 'rpt-dynamics-workflows', title: '7.4 Workflow health' },
      { id: 'rpt-dynamics-bc', title: '7.5 Business Central' },
      { id: 'rpt-dynamics-linkage', title: '7.6 Azure spend and integration linkage' },
    ],
  },
  {
    id: 'rpt-licenses',
    title: 'License utilisation',
    children: [
      { id: 'rpt-licenses-interpretation', title: '8.0 License overview' },
      { id: 'rpt-licenses-sku', title: '8.1 License SKU detail' },
      { id: 'rpt-licenses-users', title: '8.2 Licensed users' },
    ],
  },
  {
    id: 'rpt-portfolio',
    title: 'Application portfolio',
    children: [
      { id: 'rpt-portfolio-interpretation', title: '9.0 Portfolio overview' },
      { id: 'rpt-applications-discovery', title: '9.1 Applications discovery summary' },
      { id: 'rpt-applications-discovery-register', title: '9.1.1 Applications discovery register' },
    ],
  },
  {
    id: 'rpt-challenges',
    title: 'Cross-organisation challenges',
    children: [
      { id: 'rpt-challenges-themes', title: '10.0 Challenge themes' },
      { id: 'rpt-challenges-capabilities', title: '10.1 Capability opportunities linked to challenges' },
    ],
  },
  {
    id: 'rpt-recommendations',
    title: 'Strategic recommendations',
    children: [
      { id: 'rpt-recommendations-themes', title: '11.0 Recommendation themes' },
      { id: 'rpt-recommendations-detail', title: '11.1 Recommendation detail' },
    ],
  },
  {
    id: 'rpt-initiatives',
    title: 'Strategic initiatives and roadmap',
    children: [
      { id: 'rpt-initiatives-interpretation', title: '12.0 Roadmap overview' },
    ],
  },
  {
    id: 'rpt-stakeholders',
    title: 'Stakeholder interview summary',
    children: [
      { id: 'rpt-stakeholders-synthesis', title: '13.0 Stakeholder synthesis' },
    ],
  },
  {
    id: 'rpt-framework',
    title: 'Framework alignment (WAF / CAF)',
    children: [
      { id: 'rpt-framework-interpretation', title: '14.0 Framework overview' },
      { id: 'rpt-framework-waf', title: '14.1 Well-Architected Framework (WAF) pillars' },
      { id: 'rpt-framework-findings', title: '14.2 WAF findings detail' },
      { id: 'rpt-framework-caf', title: '14.3 Cloud Adoption Framework (CAF) maturity' },
      { id: 'rpt-framework-phase2', title: '14.4 Future-phase opportunities' },
    ],
  },
  { id: 'rpt-actions', title: 'Recommended actions' },
];

function flattenItems(items: ReportVisibilityItem[]): ReportVisibilityItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
}

export function buildDefaultReportVisibility(): Record<ReportVisibilityId, boolean> {
  return Object.fromEntries(
    flattenItems(REPORT_VISIBILITY_ITEMS).map((item) => [item.id, true]),
  ) as Record<ReportVisibilityId, boolean>;
}

export function readReportVisibility(_profileId: number | null): Record<ReportVisibilityId, boolean> {
  const defaults = buildDefaultReportVisibility();
  return defaults;
}

export function saveReportVisibility(
  _profileId: number | null,
  _state: Record<ReportVisibilityId, boolean>,
): void {
}

export function buildDefaultReportAppendix(): Record<ReportVisibilityId, boolean> {
  return Object.fromEntries(
    flattenItems(REPORT_VISIBILITY_ITEMS).map((item) => [item.id, false]),
  ) as Record<ReportVisibilityId, boolean>;
}

export function readReportAppendix(_profileId: number | null): Record<ReportVisibilityId, boolean> {
  const defaults = buildDefaultReportAppendix();
  return defaults;
}

export function saveReportAppendix(
  _profileId: number | null,
  _state: Record<ReportVisibilityId, boolean>,
): void {
}

export function readReportReleaseMode(_profileId: number | null): ReportReleaseMode {
  return 'draft';
}

export function saveReportReleaseMode(_profileId: number | null, _mode: ReportReleaseMode): void {
}
