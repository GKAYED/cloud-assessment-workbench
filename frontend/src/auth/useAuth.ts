/**
 * useAuth hook — simplified for profile-based backend authentication.
 *
 * Authentication is now per-profile via the backend credential store.
 * This hook provides a minimal interface for components that need
 * to know whether a valid authenticated session exists.
 */

import { useProfile } from '../hooks/useProfile';
import { profilesApi } from '../api/profiles';

export function useAuth() {
  const { activeProfile, setActiveProfile, isAuthenticated, authStatus } = useProfile();

  return {
    isAuthenticated,
    isLoading: false,
    activeAccount: activeProfile
      ? {
          name: activeProfile.customer_name,
          username: authStatus?.username ?? activeProfile.tenant_id ?? '',
        }
      : null,
    authStatus,
    login: async () => {
      // Navigate to profiles page — handled by UI
      window.location.hash = '#/profiles';
    },
    logout: async () => {
      if (activeProfile) {
        try { await profilesApi.logout(activeProfile.id); } catch { /* ignore */ }
      }
      setActiveProfile(null);
    },
  };
}
