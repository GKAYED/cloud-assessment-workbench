/**
 * ProtectedRoute — guards routes based on auth status.
 *
 * Behaviour:
 * - **Authenticated profile**: All routes accessible.
 * - **No authenticated profile**: Redirect to /profiles
 *   so the user can select or authenticate a profile.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { LoadingIndicator } from '../components/layout/LoadingIndicator';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, activeProfile, hydrated, loading, loadProfiles } = useProfile();

  React.useEffect(() => {
    if (!hydrated) {
      void loadProfiles();
    }
  }, [hydrated, loading, loadProfiles]);

  if (!hydrated || loading) {
    return <LoadingIndicator />;
  }

  // Allow access; individual pages handle missing data.
  // Only redirect if there are genuinely no profiles created yet.
  if (!activeProfile && !isAuthenticated) {
    return <Navigate to="/profiles" replace />;
  }

  return <>{children}</>;
};
