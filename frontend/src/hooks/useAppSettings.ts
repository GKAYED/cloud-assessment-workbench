/**
 * useAppSettings — global app settings (dark/light theme).
 *
 * Persisted in localStorage so toggles survive page reloads.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { flushRequestQueue, getActiveProfileId } from '../api/client';
import { pullAssessmentData } from '../services/dataPull';

// ── Keys ────────────────────────────────────────────────────────────
const LS_THEME = 'azaudit_theme';

// ── In-memory store with external subscriptions ─────────────────────
interface AppSettings {
  theme: 'dark' | 'light';
}

let _settings: AppSettings = {
  theme: (localStorage.getItem(LS_THEME) as 'dark' | 'light') || 'dark',
};

const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

// ── Data-version counter ────────────────────────────────────────────
// Bumped whenever active profile changes so hooks refetch.
let _dataVersion = 0;
const _versionListeners = new Set<() => void>();
let _refreshVersion = 0;
const _refreshListeners = new Set<() => void>();

export function getDataVersion(): number {
  return _dataVersion;
}

export function bumpDataVersion(): void {
  _dataVersion++;
  _versionListeners.forEach((fn) => fn());
}

export function bumpRefreshVersion(): void {
  _refreshVersion++;
  _refreshListeners.forEach((fn) => fn());
}

/** React hook that returns a counter that increments on profile change. */
export function useDataVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      _versionListeners.add(cb);
      return () => { _versionListeners.delete(cb); };
    },
    () => _dataVersion,
  );
}

/** React hook that increments only when user explicitly requests fresh pull. */
export function useRefreshVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      _refreshListeners.add(cb);
      return () => { _refreshListeners.delete(cb); };
    },
    () => _refreshVersion,
  );
}

// ── Public API ──────────────────────────────────────────────────────

export function getTheme(): 'dark' | 'light' {
  return _settings.theme;
}

export function useAppSettings() {
  // Subscribe to changes
  const settings = useSyncExternalStore(
    (cb) => {
      _listeners.add(cb);
      return () => { _listeners.delete(cb); };
    },
    () => _settings,
  );

  const setTheme = useCallback((t: 'dark' | 'light') => {
    _settings = { ..._settings, theme: t };
    localStorage.setItem(LS_THEME, t);
    document.documentElement.setAttribute('data-theme', t);
    notify();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(_settings.theme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  const triggerDataRefresh = useCallback(async () => {
    // Cancel stale in-flight work and run a full sequential pull once.
    flushRequestQueue();
    const result = await pullAssessmentData({
      profileId: getActiveProfileId(),
    });
    // Re-render all modules so they read updated cache values.
    bumpDataVersion();
    return result;
  }, []);

  // Apply theme attribute on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', _settings.theme);
  }, []);

  return {
    theme: settings.theme,
    setTheme,
    toggleTheme,
    triggerDataRefresh,
  };
}
