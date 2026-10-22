/**
 * Browser cache helpers used only as a performance layer over saved snapshots.
 */

import { normalizeModuleCacheData } from './normalizeModuleData';
import { getLocalSession } from '../api/localSession';

const MODULE_CACHE_PREFIX = 'azaudit_module_cache_v5';

export function buildContextKey(profileId: number | null): string {
  return `real:${profileId ?? 'none'}`;
}

function getStorageKey(contextKey: string, cacheKey: string): string {
  return `${MODULE_CACHE_PREFIX}:${contextKey}:${cacheKey}`;
}

export function readModuleCache<T>(contextKey: string, cacheKey: string): T | null {
  try {
    if (!getLocalSession()) return null;
    const raw = sessionStorage.getItem(getStorageKey(contextKey, cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: unknown };
    const normalized = normalizeModuleCacheData(cacheKey, parsed.data);
    if (normalized === undefined || normalized === null) return null;
    return normalized as T;
  } catch {
    return null;
  }
}

export function writeModuleCache<T>(contextKey: string, cacheKey: string, data: T): void {
  try {
    if (!getLocalSession()) return;
    const normalized = normalizeModuleCacheData(cacheKey, data);
    sessionStorage.setItem(
      getStorageKey(contextKey, cacheKey),
      JSON.stringify({
        data: normalized,
        saved_at: new Date().toISOString(),
      }),
    );
  } catch {
    // Ignore storage/quota failures.
  }
}

export function clearContextModuleCache(contextKey: string): void {
  try {
    const contextPrefix = `${MODULE_CACHE_PREFIX}:${contextKey}:`;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(contextPrefix)) {
        keys.push(key);
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Ignore storage access failures.
  }
}
