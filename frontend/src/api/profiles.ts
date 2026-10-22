/**
 * Profile CRUD + auth + snapshot API calls.
 */

import { get, post, put, del, directGet, directPost } from './client';
import type {
  AuthStatus,
  CustomerProfile,
  CustomerProfileCreate,
  CustomerProfileUpdate,
  OrganizationContext,
  OrganizationContextUpdate,
  ProfileActivateResponse,
  SnapshotSaveRequest,
  SnapshotSaveResponse,
  SnapshotLoadResponse,
  SnapshotModuleResponse,
} from '../types';

export interface LoginRequest {
  profile_id: number;
  tenant_id: string;
  auth_type: 'user_password' | 'service_principal';
  username?: string;
  password?: string;
  client_id?: string;
  client_secret?: string;
}

export interface LoginResponse {
  success: boolean;
  profile_id: number;
  authenticated: boolean;
  username: string;
  tenant_id: string;
  available_scopes?: string[];
}

export interface DeviceCodeStartRequest {
  profile_id: number;
  tenant_id: string;
}

export interface DeviceCodeStartResponse {
  user_code: string;
  verification_uri: string;
  message: string;
}

export interface DeviceCodePollResponse {
  status: 'pending' | 'complete' | 'error' | 'not_started';
  authenticated?: boolean;
  username?: string;
  tenant_id?: string;
  available_scopes?: string[];
  error?: string;
}

export const profilesApi = {
  // Use directGet — profile list is infrastructure, not module data.
  // It must not contend in the sequential data-fetching queue.
  list: () => directGet<{ profiles: CustomerProfile[] }>('/api/profiles'),

  create: (body: CustomerProfileCreate) =>
    post<CustomerProfile>('/api/profiles', body),

  update: (id: number, body: CustomerProfileUpdate) =>
    put<CustomerProfile>(`/api/profiles/${id}`, body),

  delete: (id: number) => del(`/api/profiles/${id}`),

  activate: (id: number) =>
    put<ProfileActivateResponse>(`/api/profiles/${id}/activate`, {}),

  // ── Auth (bypass sequential queue — these must not wait behind data loads) ─
  login: (body: LoginRequest) =>
    directPost<LoginResponse>('/api/auth/login', body),

  authStatus: (profileId: number) =>
    directGet<AuthStatus>(`/api/auth/status/${profileId}`),

  allAuthStatus: () =>
    directGet<{ profiles: AuthStatus[] }>('/api/auth/status'),

  logout: (profileId: number) =>
    directPost<{ success: boolean }>(`/api/auth/logout/${profileId}`, {}),

  // ── Device-code (interactive / MFA) flow ────────────────────────
  deviceCodeStart: (body: DeviceCodeStartRequest) =>
    directPost<DeviceCodeStartResponse>('/api/auth/device-code/start', body),

  deviceCodePoll: (profileId: number) =>
    directPost<DeviceCodePollResponse>('/api/auth/device-code/poll', { profile_id: profileId }),

  deviceCodeCancel: (profileId: number) =>
    directPost<{ cancelled: boolean }>('/api/auth/device-code/cancel', { profile_id: profileId }),

  // ── Snapshots ───────────────────────────────────────────────────
  saveSnapshot: (id: number, body: SnapshotSaveRequest) =>
    post<SnapshotSaveResponse>(`/api/profiles/${id}/snapshot`, body),

  loadSnapshot: (id: number) =>
    directGet<SnapshotLoadResponse>(`/api/profiles/${id}/snapshot`),

  loadSnapshotModule: (id: number, moduleName: string) =>
    directGet<SnapshotModuleResponse>(`/api/profiles/${id}/snapshot/${moduleName}`),

  getOrganizationContext: (id: number) =>
    get<OrganizationContext>(`/api/profiles/${id}/organization-context`),

  updateOrganizationContext: (id: number, body: OrganizationContextUpdate) =>
    put<OrganizationContext>(`/api/profiles/${id}/organization-context`, body),
};
