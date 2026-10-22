/**
 * Pull-data orchestrator:
 * - Clears stale persisted data gaps for current real profile.
 * - Fetches module endpoints sequentially (one at a time).
 * - Leaves rendering to backend snapshots; browser cache is not used.
 */

import { costsApi } from '../api/costs';
import { dataGapsApi } from '../api/dataGaps';
import { dynamicsApi } from '../api/dynamics';
import { frameworkApi } from '../api/framework';
import { governanceApi } from '../api/governance';
import { integrationsApi } from '../api/integrations';
import { inventoryApi } from '../api/inventory';
import { insightsApi } from '../api/insights';
import { licensesApi } from '../api/licenses';
import { securityApi } from '../api/security';
import { MODULE_CACHE_KEYS, type ModuleCacheKey } from '../cache/moduleKeys';

interface PullTask {
  name: string;
  cacheKey: ModuleCacheKey;
  fetch: () => Promise<unknown>;
}

export interface PullDataResult {
  totalCount: number;
  successCount: number;
  failedCount: number;
  failedModules: string[];
}

interface DataGapLike {
  reason?: unknown;
  recommendation?: unknown;
  remediation?: unknown;
}

const AUTH_GAP_PATTERNS = [
  'profile session is not authenticated',
  'session may have expired',
  'token acquisition failed',
  'illegal header value b\'bearer',
  're-authenticate',
  'reconnect',
] as const;

function includesAuthFailureText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.toLowerCase();
  return AUTH_GAP_PATTERNS.some((pattern) => text.includes(pattern));
}

function hasAuthFailureGap(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as { data_gaps?: unknown };
  if (!Array.isArray(data.data_gaps)) return false;
  return data.data_gaps.some((gapRaw) => {
    const gap = (gapRaw as DataGapLike) ?? {};
    return (
      includesAuthFailureText(gap.reason)
      || includesAuthFailureText(gap.recommendation)
      || includesAuthFailureText(gap.remediation)
    );
  });
}

const PULL_TASKS: PullTask[] = [
  { name: 'Inventory Summary', cacheKey: MODULE_CACHE_KEYS.inventorySummary, fetch: () => inventoryApi.summary() },
  { name: 'Inventory Resources', cacheKey: MODULE_CACHE_KEYS.inventoryResources, fetch: () => inventoryApi.resources() },
  { name: 'Inventory Tree', cacheKey: MODULE_CACHE_KEYS.inventoryTree, fetch: () => inventoryApi.tree() },
  { name: 'Inventory Databases', cacheKey: MODULE_CACHE_KEYS.inventoryDatabases, fetch: () => inventoryApi.databases() },
  { name: 'Inventory Subscriptions', cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions, fetch: () => inventoryApi.subscriptions() },
  { name: 'Inventory Resource Groups', cacheKey: MODULE_CACHE_KEYS.inventoryResourceGroups, fetch: () => inventoryApi.resourceGroups() },

  { name: 'Cost Summary', cacheKey: MODULE_CACHE_KEYS.costSummary, fetch: () => costsApi.summary() },
  { name: 'Cost by Subscription', cacheKey: MODULE_CACHE_KEYS.costBySubscription, fetch: () => costsApi.bySubscription() },
  { name: 'Cost by Resource', cacheKey: MODULE_CACHE_KEYS.costByResource, fetch: () => costsApi.byResource() },
  { name: 'Cost by Resource Group', cacheKey: MODULE_CACHE_KEYS.costByResourceGroup, fetch: () => costsApi.byResourceGroup() },
  { name: 'Cost by Resource Type', cacheKey: MODULE_CACHE_KEYS.costByResourceType, fetch: () => costsApi.byResourceType() },

  { name: 'Defender Scores', cacheKey: MODULE_CACHE_KEYS.securityDefenderScores, fetch: () => securityApi.defenderScores() },
  { name: 'Advisor Scores', cacheKey: MODULE_CACHE_KEYS.securityAdvisorScores, fetch: () => securityApi.advisorScores() },
  { name: 'Advisor Recommendations', cacheKey: MODULE_CACHE_KEYS.securityAdvisorRecommendations, fetch: () => securityApi.advisorRecommendations() },

  { name: 'Integrations List', cacheKey: MODULE_CACHE_KEYS.integrationsList, fetch: () => integrationsApi.list() },
  { name: 'Integrations Summary', cacheKey: MODULE_CACHE_KEYS.integrationsSummary, fetch: () => integrationsApi.summary() },
  { name: 'Integrations Recommendations', cacheKey: MODULE_CACHE_KEYS.integrationsRecommendations, fetch: () => integrationsApi.recommendations() },

  { name: 'Dynamics Environments', cacheKey: MODULE_CACHE_KEYS.dynamicsEnvironments, fetch: () => dynamicsApi.environments() },
  { name: 'Dynamics Users', cacheKey: MODULE_CACHE_KEYS.dynamicsUsers, fetch: () => dynamicsApi.users() },
  { name: 'Dynamics Module Stats', cacheKey: MODULE_CACHE_KEYS.dynamicsModuleStats, fetch: () => dynamicsApi.moduleStats() },
  { name: 'Dynamics Workflow Health', cacheKey: MODULE_CACHE_KEYS.dynamicsWorkflowHealth, fetch: () => dynamicsApi.workflowHealth() },
  { name: 'Dynamics BC Stats', cacheKey: MODULE_CACHE_KEYS.dynamicsBcStats, fetch: () => dynamicsApi.bcStats() },

  { name: 'License SKUs', cacheKey: MODULE_CACHE_KEYS.licensesSkus, fetch: () => licensesApi.skus() },
  { name: 'Licensed Users', cacheKey: MODULE_CACHE_KEYS.licensesUsers, fetch: () => licensesApi.users() },
  { name: 'License Summary', cacheKey: MODULE_CACHE_KEYS.licensesSummary, fetch: () => licensesApi.summary() },

  { name: 'Insights', cacheKey: MODULE_CACHE_KEYS.insightsList, fetch: () => insightsApi.list() },
  { name: 'Framework Insights', cacheKey: MODULE_CACHE_KEYS.frameworkInsights, fetch: () => frameworkApi.insights() },

  { name: 'Governance Policy', cacheKey: MODULE_CACHE_KEYS.governancePolicyCompliance, fetch: () => governanceApi.policyCompliance() },
  { name: 'Governance RBAC', cacheKey: MODULE_CACHE_KEYS.governanceRoleAssignments, fetch: () => governanceApi.roleAssignments() },
  { name: 'Governance Orphans', cacheKey: MODULE_CACHE_KEYS.governanceOrphanedResources, fetch: () => governanceApi.orphanedResources() },
];

export async function pullAssessmentData(params: {
  profileId: number | null;
}): Promise<PullDataResult> {
  const { profileId } = params;
  if (profileId == null) {
    throw new Error('No active profile selected. Select a profile before pulling real data.');
  }
  const failedModules: string[] = [];
  let successCount = 0;

  if (profileId != null) {
    try {
      await dataGapsApi.clear();
    } catch {
      // Best-effort cleanup only.
    }
  }

  for (const task of PULL_TASKS) {
    try {
      const payload = await task.fetch();
      if (hasAuthFailureGap(payload)) {
        failedModules.push(`${task.name} (authentication expired)`);
        continue;
      }
      successCount += 1;
    } catch {
      failedModules.push(task.name);
    }
  }

  try {
    await dataGapsApi.list();
    successCount += 1;
  } catch {
    failedModules.push('Data Gaps');
  }

  const totalCount = PULL_TASKS.length + 1;
  return {
    totalCount,
    successCount,
    failedCount: totalCount - successCount,
    failedModules,
  };
}
