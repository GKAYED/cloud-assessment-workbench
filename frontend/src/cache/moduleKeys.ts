/**
 * Stable cache keys used across pages and pull-data orchestration.
 */

export const MODULE_CACHE_KEYS = {
  dataGaps: 'data_gaps.list',
  insightsList: 'insights.list',
  challengesList: 'challenges.list',

  costSummary: 'cost.summary',
  costByResource: 'cost.by_resource',
  costByResourceGroup: 'cost.by_resource_group',
  costBySubscription: 'cost.by_subscription',
  costByResourceType: 'cost.by_resource_type',

  inventorySummary: 'inventory.summary',
  inventoryTree: 'inventory.tree',
  inventoryResources: 'inventory.resources',
  inventoryResourceGroups: 'inventory.resource_groups',
  inventorySubscriptions: 'inventory.subscriptions',
  inventoryDatabases: 'inventory.databases',

  securityDefenderScores: 'security.defender_scores',
  securityAdvisorScores: 'security.advisor_scores',
  securityAdvisorRecommendations: 'security.advisor_recommendations',
  securityCspmInsights: 'security.cspm_insights',

  integrationsList: 'integrations.list',
  integrationsSummary: 'integrations.summary',
  integrationsRecommendations: 'integrations.recommendations',

  dynamicsEnvironments: 'dynamics.environments.v3',
  dynamicsUsers: 'dynamics.users.v3',
  dynamicsModuleStats: 'dynamics.module_stats.v3',
  dynamicsWorkflowHealth: 'dynamics.workflow_health.v3',
  dynamicsBcStats: 'dynamics.bc_stats.v3',

  licensesSkus: 'licenses.skus.v3',
  licensesUsers: 'licenses.users.v3',
  licensesSummary: 'licenses.summary.v3',

  frameworkInsights: 'framework.insights',
  organizationContext: 'organization.context',
  reportInventoryValidation: 'report.inventory_validation',

  recommendationsList: 'recommendations.list',

  governancePolicyCompliance: 'governance.policy_compliance',
  governanceRoleAssignments: 'governance.role_assignments',
  governanceOrphanedResources: 'governance.orphaned_resources',
} as const;

export type ModuleCacheKey = (typeof MODULE_CACHE_KEYS)[keyof typeof MODULE_CACHE_KEYS];

export const SNAPSHOT_MODULE_KEYS = new Set<string>([
  MODULE_CACHE_KEYS.dataGaps,
  MODULE_CACHE_KEYS.insightsList,

  MODULE_CACHE_KEYS.costSummary,
  MODULE_CACHE_KEYS.costByResource,
  MODULE_CACHE_KEYS.costByResourceGroup,
  MODULE_CACHE_KEYS.costBySubscription,
  MODULE_CACHE_KEYS.costByResourceType,

  MODULE_CACHE_KEYS.inventorySummary,
  MODULE_CACHE_KEYS.inventoryTree,
  MODULE_CACHE_KEYS.inventoryResources,
  MODULE_CACHE_KEYS.inventoryResourceGroups,
  MODULE_CACHE_KEYS.inventorySubscriptions,
  MODULE_CACHE_KEYS.inventoryDatabases,

  MODULE_CACHE_KEYS.securityDefenderScores,
  MODULE_CACHE_KEYS.securityAdvisorScores,
  MODULE_CACHE_KEYS.securityAdvisorRecommendations,
  MODULE_CACHE_KEYS.securityCspmInsights,

  MODULE_CACHE_KEYS.integrationsList,
  MODULE_CACHE_KEYS.integrationsSummary,
  MODULE_CACHE_KEYS.integrationsRecommendations,

  MODULE_CACHE_KEYS.dynamicsEnvironments,
  MODULE_CACHE_KEYS.dynamicsUsers,
  MODULE_CACHE_KEYS.dynamicsModuleStats,
  MODULE_CACHE_KEYS.dynamicsWorkflowHealth,
  MODULE_CACHE_KEYS.dynamicsBcStats,

  MODULE_CACHE_KEYS.licensesSkus,
  MODULE_CACHE_KEYS.licensesUsers,
  MODULE_CACHE_KEYS.licensesSummary,

  MODULE_CACHE_KEYS.frameworkInsights,
  MODULE_CACHE_KEYS.reportInventoryValidation,

  MODULE_CACHE_KEYS.governancePolicyCompliance,
  MODULE_CACHE_KEYS.governanceRoleAssignments,
  MODULE_CACHE_KEYS.governanceOrphanedResources,
]);
