import { profilesApi } from '../api/profiles';
import { buildContextKey, writeModuleCache } from './moduleCache';
import { MODULE_CACHE_KEYS } from './moduleKeys';

const WARM_CACHE_SESSION_PREFIX = 'azaudit_warm_snapshot_cache';
const inFlightWarmCache = new Map<number, Promise<void>>();

const CORE_WARM_MODULES = [
  MODULE_CACHE_KEYS.inventorySummary,
  MODULE_CACHE_KEYS.inventorySubscriptions,
  MODULE_CACHE_KEYS.inventoryResourceGroups,
  MODULE_CACHE_KEYS.inventoryResources,
  MODULE_CACHE_KEYS.costSummary,
  MODULE_CACHE_KEYS.costBySubscription,
  MODULE_CACHE_KEYS.costByResourceGroup,
  MODULE_CACHE_KEYS.costByResourceType,
  MODULE_CACHE_KEYS.securityDefenderScores,
  MODULE_CACHE_KEYS.securityAdvisorScores,
  MODULE_CACHE_KEYS.governancePolicyCompliance,
  MODULE_CACHE_KEYS.integrationsSummary,
  MODULE_CACHE_KEYS.dataGaps,
] as const;

function getWarmMarker(profileId: number): string {
  return `${WARM_CACHE_SESSION_PREFIX}:${profileId}`;
}

function hasWarmMarker(profileId: number): boolean {
  try {
    return sessionStorage.getItem(getWarmMarker(profileId)) === '1';
  } catch {
    return false;
  }
}

function setWarmMarker(profileId: number): void {
  try {
    sessionStorage.setItem(getWarmMarker(profileId), '1');
  } catch {
    // Ignore storage failures.
  }
}

export async function warmSnapshotCache(profileId: number): Promise<number> {
  const contextKey = buildContextKey(profileId);
  const results = await Promise.allSettled(
    CORE_WARM_MODULES.map(async (moduleKey) => {
      const moduleData = await profilesApi.loadSnapshotModule(profileId, moduleKey);
      writeModuleCache(contextKey, moduleKey, moduleData.data);
      return moduleKey;
    }),
  );

  return results.filter((result) => result.status === 'fulfilled').length;
}

export function warmSnapshotCacheOnce(profileId: number): Promise<void> {
  if (hasWarmMarker(profileId)) {
    return Promise.resolve();
  }
  const existing = inFlightWarmCache.get(profileId);
  if (existing) {
    return existing;
  }

  const pending = warmSnapshotCache(profileId)
    .then((warmedCount) => {
      if (warmedCount > 0) {
        setWarmMarker(profileId);
      }
    })
    .finally(() => {
      inFlightWarmCache.delete(profileId);
    });

  inFlightWarmCache.set(profileId, pending);
  return pending;
}
