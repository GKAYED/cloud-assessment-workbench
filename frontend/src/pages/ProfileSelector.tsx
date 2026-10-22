/**
 * ProfileSelector.tsx — manage customer profiles with profile-scoped Azure authentication.
 *
 * The active UI flow is Microsoft sign-in via the device-code / MFA path.
 * Dormant non-interactive auth paths still exist in source for reference,
 * but they are not the active user-facing sign-in experience.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useProfile } from '../hooks/useProfile';
import { profilesApi } from '../api/profiles';
import { PageLayout } from '../components/layout/PageLayout';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { Button } from '../components/ui/button';
import { formatDateTime } from '../utils/formatters';
import type { AuthStatus, CustomerProfile } from '../types';
import { LogIn, LogOut, Shield, User, Monitor } from 'lucide-react';
import { buildContextKey, clearContextModuleCache } from '../cache/moduleCache';

type AuthType = 'user_password' | 'service_principal' | 'interactive';

interface FormData {
  customer_name: string;
  tenant_id: string;
  auth_type: AuthType;
  username: string;
  password: string;
  client_id: string;
  client_secret: string;
}

interface ProfileEditFormData {
  customer_name: string;
  tenant_id: string;
  tenant_display_name: string;
}

const emptyForm: FormData = {
  customer_name: '',
  tenant_id: '',
  auth_type: 'interactive',
  username: '',
  password: '',
  client_id: '',
  client_secret: '',
};

const emptyEditForm: ProfileEditFormData = {
  customer_name: '',
  tenant_id: '',
  tenant_display_name: '',
};

export default function ProfileSelector() {
  const {
    profiles,
    activeProfile,
    authStatus,
    loadProfiles,
    setActiveProfile,
    checkAuthStatus,
    loading,
  } = useProfile();
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [editFormData, setEditFormData] = useState<ProfileEditFormData>({ ...emptyEditForm });
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatuses, setAuthStatuses] = useState<Record<number, AuthStatus>>({});

  // ── Sign-in form for existing profiles ──────────────────────────
  const [signingInId, setSigningInId] = useState<number | null>(null);
  const [signInForm, setSignInForm] = useState<FormData>({ ...emptyForm });
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInLoading, setSignInLoading] = useState(false);

  // ── Device-code flow state ────────────────────────────────────
  const [deviceCode, setDeviceCode] = useState<{ user_code: string; verification_uri: string; message: string } | null>(null);
  const [deviceCodeProfileId, setDeviceCodeProfileId] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Load auth status for all profiles
  useEffect(() => {
    if (profiles.length === 0) return;
    profilesApi.allAuthStatus().then((result) => {
      const map: Record<number, AuthStatus> = {};
      for (const s of result.profiles) {
        map[s.profile_id] = s;
      }
      setAuthStatuses(map);
    }).catch(() => {});
  }, [profiles]);

  useEffect(() => {
    if (!authStatus) return;
    setAuthStatuses((prev) => ({
      ...prev,
      [authStatus.profile_id]: authStatus,
    }));
  }, [authStatus]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setFormMode('create');
    setEditingProfileId(null);
    setFormData({ ...emptyForm });
    setEditFormData({ ...emptyEditForm });
    setError(null);
  }, []);

  /* ── Create & Sign In ────────────────────────────────────────────── */

  const startDeviceCodePolling = useCallback((profileId: number) => {
    stopPolling();
    pollTimerRef.current = setInterval(async () => {
      try {
        const poll = await profilesApi.deviceCodePoll(profileId);
        if (poll.status === 'complete') {
          stopPolling();
          setDeviceCode(null);
          setDeviceCodeProfileId(null);
          setSigningInId(null);
          setSaving(false);
          setSignInLoading(false);
          await loadProfiles();
          // Auto-select this profile
          const updated = await profilesApi.list();
          const created = updated.profiles.find((p) => p.id === profileId);
          if (created) setActiveProfile(created);
          closeForm();
        } else if (poll.status === 'error') {
          stopPolling();
          setDeviceCode(null);
          setDeviceCodeProfileId(null);
          setError(poll.error || 'Interactive login failed');
          setSignInError(poll.error || 'Interactive login failed');
          setSaving(false);
          setSignInLoading(false);
        }
        // status === 'pending' → keep polling
      } catch {
        stopPolling();
        setDeviceCode(null);
        setDeviceCodeProfileId(null);
        setError('Lost connection while waiting for sign-in');
        setSignInError('Lost connection while waiting for sign-in');
        setSaving(false);
        setSignInLoading(false);
      }
    }, 3000); // poll every 3 seconds
  }, [stopPolling, loadProfiles, setActiveProfile, closeForm]);

  const handleCreate = async () => {
    if (!formData.customer_name.trim() || !formData.tenant_id.trim()) return;
    setError(null);
    setSaving(true);
    try {
      // 1. Create the profile
      const profile = await profilesApi.create({ customer_name: formData.customer_name });

      if (formData.auth_type === 'interactive') {
        // 2a. Start device-code flow
        const dc = await profilesApi.deviceCodeStart({
          profile_id: profile.id,
          tenant_id: formData.tenant_id,
        });
        setDeviceCode(dc);
        setDeviceCodeProfileId(profile.id);
        // Start polling — saving stays true until complete
        startDeviceCodePolling(profile.id);
        return; // UI shows device code; polling handles the rest
      }

      // 2b. Dormant non-interactive auth path retained for reference/local use
      await profilesApi.login({
        profile_id: profile.id,
        tenant_id: formData.tenant_id,
        auth_type: formData.auth_type,
        username: formData.auth_type === 'user_password' ? formData.username : undefined,
        password: formData.auth_type === 'user_password' ? formData.password : undefined,
        client_id: formData.auth_type === 'service_principal' ? formData.client_id : undefined,
        client_secret: formData.auth_type === 'service_principal' ? formData.client_secret : undefined,
      });

      setFormData({ ...emptyForm });
      closeForm();
      await loadProfiles();

      // Auto-select this profile
      const updated = await profilesApi.list();
      const created = updated.profiles.find((p) => p.id === profile.id);
      if (created) setActiveProfile(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingProfileId || !editFormData.customer_name.trim()) return;
    setError(null);
    setSaving(true);
    try {
      await profilesApi.update(editingProfileId, {
        customer_name: editFormData.customer_name.trim(),
        tenant_id: editFormData.tenant_id.trim() || undefined,
        tenant_display_name: editFormData.tenant_display_name.trim() || undefined,
      });
      closeForm();
      await loadProfiles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  /* ── Re-authenticate existing profile ────────────────────────────── */

  const startSignIn = (profile: CustomerProfile) => {
    closeForm();
    setSigningInId(profile.id);
    setSignInForm({
      ...emptyForm,
      tenant_id: profile.tenant_id ?? '',
    });
    setSignInError(null);
  };

  const handleSignIn = async () => {
    if (!signingInId || !signInForm.tenant_id.trim()) return;
    setSignInError(null);
    setSignInLoading(true);
    try {
      if (signInForm.auth_type === 'interactive') {
        // Device-code flow for existing profile
        const dc = await profilesApi.deviceCodeStart({
          profile_id: signingInId,
          tenant_id: signInForm.tenant_id,
        });
        setDeviceCode(dc);
        setDeviceCodeProfileId(signingInId);
        startDeviceCodePolling(signingInId);
        return; // polling handles the rest
      }

      await profilesApi.login({
        profile_id: signingInId,
        tenant_id: signInForm.tenant_id,
        auth_type: signInForm.auth_type,
        username: signInForm.auth_type === 'user_password' ? signInForm.username : undefined,
        password: signInForm.auth_type === 'user_password' ? signInForm.password : undefined,
        client_id: signInForm.auth_type === 'service_principal' ? signInForm.client_id : undefined,
        client_secret: signInForm.auth_type === 'service_principal' ? signInForm.client_secret : undefined,
      });

      setSigningInId(null);
      await loadProfiles();
    } catch (err: unknown) {
      setSignInError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSignInLoading(false);
    }
  };

  /* ── Other actions ───────────────────────────────────────────────── */

  const handleActivate = async (profile: CustomerProfile) => {
    await profilesApi.activate(profile.id);
    setActiveProfile(profile);
    await loadProfiles();
  };

  const handleEdit = (profile: CustomerProfile) => {
    setFormMode('edit');
    setEditingProfileId(profile.id);
    setEditFormData({
      customer_name: profile.customer_name ?? '',
      tenant_id: profile.tenant_id ?? '',
      tenant_display_name: profile.tenant_display_name ?? '',
    });
    setShowForm(true);
    setError(null);
  };

  const handleLogout = async (profileId: number) => {
    try {
      await profilesApi.logout(profileId);
    } finally {
      clearContextModuleCache(buildContextKey(profileId));
      if (activeProfile?.id === profileId) {
        setActiveProfile(null);
      }
    }
    await checkAuthStatus(profileId);
    setAuthStatuses((prev) => {
      const next = { ...prev };
      next[profileId] = { profile_id: profileId, authenticated: false };
      return next;
    });
  };

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    const profileId = deleteId;
    try {
      await profilesApi.delete(profileId);
    } finally {
      clearContextModuleCache(buildContextKey(profileId));
      if (activeProfile?.id === profileId) setActiveProfile(null);
    }
    setDeleteId(null);
    await loadProfiles();
  };

  /* ── Render credential fields ────────────────────────────────────── */

  const renderCredFields = (
    data: FormData,
    setData: React.Dispatch<React.SetStateAction<FormData>>,
  ) => (
    <>
      <div className="crud-form-grid crud-form-grid--spaced">
        <label>
          Tenant ID *
          <input
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={data.tenant_id}
            onChange={(e) => setData((d) => ({ ...d, tenant_id: e.target.value }))}
          />
        </label>
        <label>
          Auth Method
          <select
            value={data.auth_type}
            onChange={(e) => setData((d) => ({ ...d, auth_type: e.target.value as AuthType }))}
          >
            <option value="interactive">Sign in with Microsoft (MFA)</option>
            {/* Disabled for now; kept in source for reference.
            <option value="user_password">Username &amp; Password</option>
            <option value="service_principal">Service Principal</option>
            */}
          </select>
        </label>
      </div>

      {/* Disabled auth paths kept in source for reference.
      {data.auth_type === 'user_password' && (
        <div className="crud-form-grid">
          <label>
            Azure AD Email *
            <input
              type="email"
              placeholder="user@example.com"
              value={data.username}
              onChange={(e) => setData((d) => ({ ...d, username: e.target.value }))}
              autoComplete="username"
            />
          </label>
          <label>
            Password *
            <input
              type="password"
              placeholder="••••••••"
              value={data.password}
              onChange={(e) => setData((d) => ({ ...d, password: e.target.value }))}
              autoComplete="current-password"
            />
          </label>
        </div>
      )}

      {data.auth_type === 'service_principal' && (
        <div className="crud-form-grid">
          <label>
            Client ID *
            <input
              placeholder="App registration Client ID"
              value={data.client_id}
              onChange={(e) => setData((d) => ({ ...d, client_id: e.target.value }))}
            />
          </label>
          <label>
            Client Secret *
            <input
              type="password"
              placeholder="••••••••"
              value={data.client_secret}
              onChange={(e) => setData((d) => ({ ...d, client_secret: e.target.value }))}
            />
          </label>
        </div>
      )}
      */}

      {data.auth_type === 'interactive' && (
        <p className="auth-hint">
          <Monitor size={14} />
          You will be redirected to Microsoft to sign in. Supports MFA and Conditional Access.
        </p>
      )}
    </>
  );

  /* ── JSX ─────────────────────────────────────────────────────────── */

  return (
    <PageLayout title="Customer Profiles" exportId="profiles-page">
      <div className="profiles-toolbar">
        <Button className="profile-action-btn profile-action-btn--primary" onClick={() => {
          if (showForm && formMode === 'create') {
            closeForm();
          } else {
            setFormMode('create');
            setEditingProfileId(null);
            setFormData({ ...emptyForm });
            setEditFormData({ ...emptyEditForm });
            setShowForm(true);
          }
        }}>
          {showForm ? 'Cancel' : '+ New Profile'}
        </Button>
      </div>

      {/* ── Create & Sign In form ──────────────────────────────────── */}
      {showForm && (
        <div className="crud-form">
          <h4>{formMode === 'edit' ? 'Edit Customer Profile' : 'Create Customer Profile &amp; Sign In'}</h4>

          {formMode === 'edit' ? (
            <>
              <div className="crud-form-grid crud-form-grid--spaced">
                <label>
                  Customer Name *
                  <input
                    placeholder="e.g. Example Organisation"
                    value={editFormData.customer_name}
                    onChange={(e) => setEditFormData((d) => ({ ...d, customer_name: e.target.value }))}
                  />
                </label>
                <label>
                  Tenant ID
                  <input
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={editFormData.tenant_id}
                    onChange={(e) => setEditFormData((d) => ({ ...d, tenant_id: e.target.value }))}
                  />
                </label>
                <label className="span-full">
                  Tenant Display Name
                  <input
                    placeholder="Optional friendly tenant label"
                    value={editFormData.tenant_display_name}
                    onChange={(e) => setEditFormData((d) => ({ ...d, tenant_display_name: e.target.value }))}
                  />
                </label>
              </div>

              {error && <p className="auth-error">{error}</p>}

              <div className="crud-form-actions">
                <Button
                  className="profile-action-btn profile-action-btn--primary"
                  onClick={handleUpdate}
                  disabled={saving || !editFormData.customer_name.trim()}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button className="profile-action-btn profile-action-btn--outline" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="crud-form-grid crud-form-grid--spaced">
                <label>
                  Customer Name *
                  <input
                    placeholder="e.g. Example Organisation"
                    value={formData.customer_name}
                    onChange={(e) => setFormData((d) => ({ ...d, customer_name: e.target.value }))}
                  />
                </label>
              </div>

              {renderCredFields(formData, setFormData)}

              {error && <p className="auth-error">{error}</p>}

              {/* Device-code flow display */}
              {deviceCode && !signingInId && (
                <div className="device-code-box">
                  <p className="device-code-title">
                    <Monitor size={16} />
                    Complete sign-in in your browser
                  </p>
                  <p className="device-code-instructions">
                    Go to{' '}
                    <a
                      href={deviceCode.verification_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="device-code-link"
                    >
                      {deviceCode.verification_uri}
                    </a>{' '}
                    and enter the code:
                  </p>
                  <div className="device-code-display">
                    {deviceCode.user_code}
                  </div>
                  <p className="device-code-waiting">
                    Waiting for you to complete sign-in…
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="device-code-cancel profile-action-btn profile-action-btn--outline"
                    onClick={() => {
                      stopPolling();
                      if (deviceCodeProfileId) profilesApi.deviceCodeCancel(deviceCodeProfileId);
                      setDeviceCode(null);
                      setDeviceCodeProfileId(null);
                      setSaving(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              <div className="crud-form-actions">
                <Button
                  className="profile-action-btn profile-action-btn--primary"
                  onClick={handleCreate}
                  disabled={saving || !formData.customer_name.trim() || !formData.tenant_id.trim()}
                >
                  {saving ? 'Authenticating…' : 'Create & Sign In'}
                </Button>
                <Button className="profile-action-btn profile-action-btn--outline" variant="outline" onClick={closeForm}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Profile list ───────────────────────────────────────────── */}
      {loading ? (
        <p>Loading profiles…</p>
      ) : profiles.length === 0 ? (
        <p className="empty-state">No profiles yet. Create one to start an assessment.</p>
      ) : (
        <div className="profile-list">
          {profiles.map((p) => {
            const isActive = p.id === activeProfile?.id;
            const auth = isActive && authStatus?.profile_id === p.id
              ? authStatus
              : authStatuses[p.id];
            const isConnected = auth?.authenticated === true;
            const isSigningIn = signingInId === p.id;

            return (
              <div key={p.id} className={`profile-card ${isActive ? 'active' : ''}`}>
                <div className="profile-card-header">
                  <h3>{p.customer_name}</h3>
                  <span className={`status-badge status-${p.status.toLowerCase()}`}>{p.status}</span>
                </div>

                {p.tenant_id && <p className="profile-tenant">Tenant: {p.tenant_id}</p>}
                {isConnected && (
                  <p className="profile-tenant">
                    <User size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {auth.username}
                  </p>
                )}
                {p.last_assessed_at && (
                  <p className="profile-assessed">Last assessed: {formatDateTime(p.last_assessed_at)}</p>
                )}

                {/* Auth status indicator */}
                <div className="profile-auth-status">
                  {isConnected ? (
                    <span className="auth-badge auth-connected"><Shield size={13} /> Connected</span>
                  ) : (
                    <span className="auth-badge auth-disconnected"><Shield size={13} /> Not connected</span>
                  )}
                </div>

                {/* ── Re-authenticate form (inline) ──────────────────── */}
                {isSigningIn && (
                  <div className="profile-signin-form">
                    <h4>Sign In to {p.customer_name}</h4>
                    {renderCredFields(signInForm, setSignInForm)}
                    {signInError && <p className="auth-error">{signInError}</p>}

                    {/* Device-code flow display (inline sign-in) */}
                    {deviceCode && deviceCodeProfileId === p.id && (
                      <div className="device-code-box">
                        <p className="device-code-title">
                          <Monitor size={16} />
                          Complete sign-in in your browser
                        </p>
                        <p className="device-code-instructions">
                          Go to{' '}
                          <a
                            href={deviceCode.verification_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="device-code-link"
                          >
                            {deviceCode.verification_uri}
                          </a>{' '}
                          and enter the code:
                        </p>
                        <div className="device-code-display">
                          {deviceCode.user_code}
                        </div>
                        <p className="device-code-waiting">
                          Waiting for you to complete sign-in…
                        </p>
                      </div>
                    )}

                    <div className="crud-form-actions">
                      <Button
                        className="profile-action-btn profile-action-btn--primary"
                        onClick={handleSignIn}
                        disabled={signInLoading || !signInForm.tenant_id.trim()}
                      >
                        {signInLoading ? 'Authenticating…' : 'Sign In'}
                      </Button>
                      <Button className="profile-action-btn profile-action-btn--outline" variant="outline" onClick={() => {
                        stopPolling();
                        if (deviceCodeProfileId === p.id) {
                          profilesApi.deviceCodeCancel(p.id);
                          setDeviceCode(null);
                          setDeviceCodeProfileId(null);
                        }
                        setSigningInId(null);
                        setSignInLoading(false);
                      }}>Cancel</Button>
                    </div>
                  </div>
                )}

                {/* ── Actions ────────────────────────────────────────── */}
                <div className="profile-actions">
                  <Button className="profile-action-btn profile-action-btn--outline" variant="outline" size="sm" onClick={() => handleEdit(p)}>
                    Edit
                  </Button>
                  {!isActive && (
                    <Button className="profile-action-btn profile-action-btn--outline" variant="outline" size="sm" onClick={() => handleActivate(p)}>
                      Set Active
                    </Button>
                  )}
                  {!isConnected && !isSigningIn ? (
                    <Button className="profile-action-btn profile-action-btn--primary" size="sm" onClick={() => startSignIn(p)}>
                      <LogIn size={13} /> Sign In
                    </Button>
                  ) : isConnected ? (
                    <Button className="profile-action-btn profile-action-btn--outline" variant="outline" size="sm" onClick={() => handleLogout(p.id)}>
                      <LogOut size={13} /> Sign Out
                    </Button>
                  ) : null}
                  <Button className="profile-action-btn profile-action-btn--danger" variant="destructive" size="sm" onClick={() => handleDelete(p.id)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Delete profile"
        message="Delete this profile and all its assessment data? This cannot be undone."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </PageLayout>
  );
}
