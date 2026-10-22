/**
 * useModuleData — loads saved assessment data only.
 *
 * Rules:
 * - Snapshot-backed modules load browser cache first, then backend snapshots.
 * - Profile-scoped saved records load from their persistence APIs.
 * - Live collection APIs are not used during normal rendering.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ModuleState } from '../types';
import { useDataVersion, useRefreshVersion } from './useAppSettings';
import { getActiveProfileId } from '../api/client';
import { profilesApi } from '../api/profiles';
import { SNAPSHOT_MODULE_KEYS } from '../cache/moduleKeys';
import { normalizeModuleCacheData } from '../cache/normalizeModuleData';
import { buildContextKey, readModuleCache, writeModuleCache } from '../cache/moduleCache';
import { isRequestCancellationError } from '../utils/requestErrors';

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function getEffectiveCacheKey(configured: string | undefined, signature: string): string {
  if (configured && configured.trim().length > 0) return configured;
  return `sig_${hashString(signature)}`;
}

function isUsableCachedData(cacheKey: string, data: unknown): boolean {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data !== 'object') return true;

  if (cacheKey === 'cost.summary') {
    const record = data as Record<string, unknown>;
    const total1m = Number(record.total ?? record.total_cost_1m ?? 0);
    const total3m = Number(record.total_cost_3m ?? 0);
    const total6m = Number(record.total_cost_6m ?? 0);
    const byMonth = Array.isArray(record.by_month) ? record.by_month.length : 0;
    const topDrivers = Array.isArray(record.top_cost_drivers) ? record.top_cost_drivers.length : 0;
    return total1m > 0 || total3m > 0 || total6m > 0 || byMonth > 0 || topDrivers > 0;
  }

  return Object.keys(data as Record<string, unknown>).length > 0;
}

interface UseModuleDataOptions {
  cacheKey?: string;
}

export function useModuleData<T>(
  fetcher: () => Promise<T>,
  depsOrOptions: unknown[] | UseModuleDataOptions = [],
  maybeOptions: UseModuleDataOptions = {}
): ModuleState<T> & { refetch: () => void } {
  const deps = Array.isArray(depsOrOptions) ? depsOrOptions : [];
  const options = Array.isArray(depsOrOptions) ? maybeOptions : depsOrOptions;

  // Re-key on profile changes.
  const dataVersion = useDataVersion();
  // Force refresh only when user explicitly asks.
  const refreshVersion = useRefreshVersion();

  // Track the context key so we can discard stale responses
  const contextRef = useRef('');
  // Stable signature used for cache key generation.
  const signatureRef = useRef(fetcher.toString());
  const configuredCacheKey = options.cacheKey;
  const seenRefreshRef = useRef(refreshVersion);

  const [state, setState] = useState<ModuleState<T>>({
    status: 'pending',
    data: null,
  });
  const activeContextKey = buildContextKey(getActiveProfileId());

  useEffect(() => {
    if (!contextRef.current) {
      contextRef.current = activeContextKey;
      return;
    }
    if (contextRef.current !== activeContextKey) {
      contextRef.current = activeContextKey;
      setState({ status: 'pending', data: null });
    }
  }, [activeContextKey]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Capture the context at fetch start.
    const contextKey = buildContextKey(getActiveProfileId());
    const previousContext = contextRef.current;
    const cacheKey = getEffectiveCacheKey(configuredCacheKey, signatureRef.current);
    contextRef.current = contextKey;
    const contextChanged = Boolean(previousContext && previousContext !== contextKey);

    // Hard reset when profile context changes to prevent
    // cross-context data leakage in the UI.
    if (contextChanged) {
      setState({ status: 'pending', data: null });
    }

    if (!forceRefresh) {
      const cached = readModuleCache<T>(contextKey, cacheKey);
      if (isUsableCachedData(cacheKey, cached)) {
        setState({ status: 'success', data: cached });
        return;
      }
    }

    setState((prev) => (prev.data !== null && !forceRefresh ? prev : { status: 'loading', data: prev.data ?? null }));

    try {
      let data: T;
      if (SNAPSHOT_MODULE_KEYS.has(cacheKey)) {
        const profileId = getActiveProfileId();
        if (profileId == null) {
          throw new Error('No active profile selected.');
        }
        const snapshot = await profilesApi.loadSnapshotModule(profileId, cacheKey);
        data = normalizeModuleCacheData(cacheKey, snapshot.data) as T;
      } else {
        data = normalizeModuleCacheData(cacheKey, await fetcher()) as T;
      }

      // Only accept the result if context hasn't changed during the fetch
      if (contextRef.current === contextKey) {
        setState({ status: 'success', data });
        writeModuleCache(contextKey, cacheKey, data);
      }
    } catch (err) {
      // Ignore stale failures from an old context.
      if (contextRef.current !== contextKey) return;

      // Context switches intentionally cancel in-flight requests.
      if (isRequestCancellationError(err)) return;

      const msg = err instanceof Error ? err.message : 'Unknown error';

      setState((prev) => {
        if (!contextChanged && prev.data !== null) {
          return { ...prev, error: msg };
        }
        return { status: 'error', data: null, error: msg };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredCacheKey, ...deps]);

  useEffect(() => {
    void fetchData(false);
  }, [fetchData, dataVersion]);

  useEffect(() => {
    // Skip the first render — initial loading is handled by the effect above.
    if (seenRefreshRef.current === refreshVersion) return;
    seenRefreshRef.current = refreshVersion;
    void fetchData(true);
  }, [fetchData, refreshVersion]);

  const refetch = useCallback(() => {
    void fetchData(true);
  }, [fetchData]);

  return { ...state, refetch };
}
