import { MODULE_CACHE_KEYS } from './moduleKeys';

const ENVELOPE_KEY_BY_CACHE_KEY: Record<string, string> = {
  [MODULE_CACHE_KEYS.insightsList]: 'insights',
  [MODULE_CACHE_KEYS.dataGaps]: 'gaps',
  [MODULE_CACHE_KEYS.dynamicsEnvironments]: 'environments',
  [MODULE_CACHE_KEYS.dynamicsUsers]: 'users',
  [MODULE_CACHE_KEYS.dynamicsModuleStats]: 'modules',
  [MODULE_CACHE_KEYS.dynamicsWorkflowHealth]: 'workflows',
  [MODULE_CACHE_KEYS.dynamicsBcStats]: 'companies',
  [MODULE_CACHE_KEYS.licensesSkus]: 'skus',
  [MODULE_CACHE_KEYS.licensesUsers]: 'users',
  [MODULE_CACHE_KEYS.licensesSummary]: 'summary',
};

const ARRAY_CACHE_KEYS = new Set<string>([
  MODULE_CACHE_KEYS.dataGaps,
  MODULE_CACHE_KEYS.insightsList,
  MODULE_CACHE_KEYS.costByResource,
  MODULE_CACHE_KEYS.costByResourceGroup,
  MODULE_CACHE_KEYS.costBySubscription,
  MODULE_CACHE_KEYS.costByResourceType,
  MODULE_CACHE_KEYS.inventoryTree,
  MODULE_CACHE_KEYS.inventoryResources,
  MODULE_CACHE_KEYS.inventoryResourceGroups,
  MODULE_CACHE_KEYS.inventorySubscriptions,
  MODULE_CACHE_KEYS.inventoryDatabases,
  MODULE_CACHE_KEYS.securityAdvisorRecommendations,
  MODULE_CACHE_KEYS.integrationsList,
  MODULE_CACHE_KEYS.integrationsRecommendations,
  MODULE_CACHE_KEYS.dynamicsEnvironments,
  MODULE_CACHE_KEYS.dynamicsUsers,
  MODULE_CACHE_KEYS.dynamicsModuleStats,
  MODULE_CACHE_KEYS.dynamicsWorkflowHealth,
  MODULE_CACHE_KEYS.dynamicsBcStats,
  MODULE_CACHE_KEYS.licensesSkus,
  MODULE_CACHE_KEYS.licensesUsers,
]);

export function normalizeModuleCacheData(cacheKey: string, data: unknown): unknown {
  const envelopeKey = ENVELOPE_KEY_BY_CACHE_KEY[cacheKey];
  let normalized = data;

  if (envelopeKey && data && typeof data === 'object' && !Array.isArray(data)) {
    const payload = data as Record<string, unknown>;
    normalized = envelopeKey in payload ? payload[envelopeKey] : data;
  }

  if (ARRAY_CACHE_KEYS.has(cacheKey)) {
    return Array.isArray(normalized) ? normalized : [];
  }

  return normalized;
}
