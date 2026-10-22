/**
 * useProfile — active profile context hook.
 *
 * Tracks profile selection AND authentication status.
 */

import { useState, useCallback, useEffect } from 'react';
import type { AuthStatus, CustomerProfile } from '../types';
import { profilesApi } from '../api/profiles';
import { getActiveProfileId, setActiveProfileId, flushRequestQueue } from '../api/client';
import { bumpDataVersion } from './useAppSettings';

// Simple in-memory state for active profile
let _activeProfile: CustomerProfile | null = null;
let _authStatus: AuthStatus | null = null;
let _isHydrated = false;
const _listeners = new Set<() => void>();

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

/** Check whether the currently active profile is authenticated. */
export function getActiveAuthStatus(): AuthStatus | null {
  return _authStatus;
}

export function getActiveProfileSnapshot(): CustomerProfile | null {
  return _activeProfile;
}

/** Quick check — is there an authenticated profile right now? */
export function isProfileAuthenticated(): boolean {
  return _authStatus?.authenticated === true;
}

export function useProfile() {
  const [activeProfile, setActive] = useState<CustomerProfile | null>(_activeProfile);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(_authStatus);
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(!_isHydrated);
  const [hydrated, setHydrated] = useState(_isHydrated);

  useEffect(() => {
    const listener = () => {
      setActive(_activeProfile);
      setAuthStatus(_authStatus);
      setHydrated(_isHydrated);
    };
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  /** Fetch auth status for a given profile and update module state. */
  const checkAuthStatus = useCallback(async (profileId: number) => {
    try {
      const status = await profilesApi.authStatus(profileId);
      _authStatus = status;
      notifyListeners();
      return status;
    } catch {
      _authStatus = null;
      notifyListeners();
      return null;
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await profilesApi.list();
      setProfiles(result.profiles);

      // Restore selected profile first, then fallback to DB-active profile.
      if (!_activeProfile) {
        const persistedId = getActiveProfileId();
        const persisted = persistedId != null ? result.profiles.find((p) => p.id === persistedId) ?? null : null;
        const active = persisted ?? result.profiles.find((p) => p.status === 'Active') ?? null;

        if (active) {
          _activeProfile = active;
          setActiveProfileId(active.id);

          // Flush stale requests queued under the old context
          // and bump data version so hooks refetch under the new context.
          flushRequestQueue();

          notifyListeners();

          // Check auth status for auto-selected profile
          await checkAuthStatus(active.id);

          // Trigger data refetch now that context is stable
          bumpDataVersion();
        } else if (persistedId != null) {
          // Selected profile no longer exists; clear stale context.
          setActiveProfileId(null);
          flushRequestQueue();
          notifyListeners();
          bumpDataVersion();
        }
      }
      _isHydrated = true;
      notifyListeners();
    } finally {
      _isHydrated = true;
      notifyListeners();
      setLoading(false);
    }
  }, [checkAuthStatus]);

  const setActiveProfile = useCallback(async (profile: CustomerProfile | null) => {
    _activeProfile = profile;
    setActiveProfileId(profile?.id ?? null);

    // Flush stale requests from the previous profile context
    flushRequestQueue();

    if (profile) {
      // Check auth status — if authenticated, we have a real connection
      await checkAuthStatus(profile.id);
    } else {
      _authStatus = null;
    }

    notifyListeners();
    bumpDataVersion();
  }, [checkAuthStatus]);

  return {
    activeProfile,
    authStatus,
    profiles,
    loading,
    hydrated,
    loadProfiles,
    setActiveProfile,
    checkAuthStatus,
    isAuthenticated: authStatus?.authenticated === true,
  };
}
