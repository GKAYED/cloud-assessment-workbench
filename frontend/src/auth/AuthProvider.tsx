/**
 * AuthProvider — simple pass-through provider.
 *
 * Interactive authentication is handled through the profile-scoped backend
 * auth flow. The frontend keeps only lightweight active-profile context here,
 * so this provider remains a compatibility wrapper rather than a token owner.
 */

import React from 'react';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  return <>{children}</>;
};
