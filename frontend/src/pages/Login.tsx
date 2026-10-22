/**
 * Login.tsx — redirects to Profiles page (auth is per-profile now).
 */

import { Navigate } from 'react-router-dom';

export default function Login() {
  // All authentication happens on the Profiles page
  return <Navigate to="/profiles" replace />;
}
