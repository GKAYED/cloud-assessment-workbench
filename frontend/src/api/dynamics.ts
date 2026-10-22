import { get } from './client';
import type { D365Environment, D365User, D365ModuleStats, D365WorkflowHealth, D365BCStats } from '../types';

function asRecord(value: unknown): Record<string, unknown> {
  return (value as Record<string, unknown>) ?? {};
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function normalizeStatus(status: unknown, state: unknown): string {
  if (typeof status === 'string' && status.trim()) return status;
  const stateText = text(state).toLowerCase();
  if (stateText === 'active' || stateText === 'activated' || stateText === 'running') return 'Running';
  if (stateText === 'draft' || stateText === 'inactive' || stateText === 'stopped') return 'Stopped';
  return text(status);
}

function normalizeWorkflowStatus(status: unknown, state: unknown): string {
  const raw = text(status).trim();
  const stateText = text(state).toLowerCase();
  if (raw === '1') return stateText === 'active' ? 'Activated' : 'Draft';
  if (raw === '2') return 'Activated';
  if (raw === '3') return 'Suspended';
  if (raw === '4') return 'Cancelled';
  if (raw === '5') return 'Completed';
  if (raw === '6') return 'Waiting for resources';
  if (raw === '7') return 'Paused';
  return normalizeStatus(status, state) || 'Unknown';
}

function unwrapRows(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  const data = asRecord(payload);
  const keyed = data[key];
  if (Array.isArray(keyed)) return keyed;
  return [];
}

function normalizeEnvironment(row: unknown): D365Environment {
  const data = asRecord(row);
  return {
    id: text(data.id),
    display_name: text(data.display_name ?? data.name),
    name: text(data.name),
    domain_name: text(data.domain_name),
    environment_type: text(data.environment_type ?? data.type),
    type: text(data.type),
    region: text(data.region),
    url: text(data.url ?? data.instance_url),
    database_capacity_used_mb: numOrNull(data.database_capacity_used_mb),
    database_capacity_allocated_mb: numOrNull(data.database_capacity_allocated_mb),
    file_capacity_used_mb: numOrNull(data.file_capacity_used_mb),
    file_capacity_allocated_mb: numOrNull(data.file_capacity_allocated_mb),
    state: text(data.state),
    status: text(data.status ?? data.state),
    version: text(data.version),
  };
}

function normalizeUser(row: unknown): D365User {
  const data = asRecord(row);
  const rolesRaw = Array.isArray(data.roles) ? data.roles : Array.isArray(data.security_roles) ? data.security_roles : [];
  const roles = rolesRaw.map((item) => text(item)).filter((item) => item.length > 0);
  const active30d = typeof data.is_active_30d === 'boolean' ? data.is_active_30d : null;
  return {
    user_id: text(data.user_id),
    full_name: text(data.full_name ?? data.display_name),
    display_name: text(data.display_name ?? data.full_name),
    email: text(data.email ?? data.user_principal_name),
    is_disabled: Boolean(data.is_disabled),
    business_unit: text(data.business_unit),
    environment: text(data.environment),
    security_roles: roles,
    roles,
    last_login: data.last_login ? text(data.last_login) : null,
    is_active_30d: active30d,
    license_type: text(data.license_type),
  };
}

function normalizeModuleStats(row: unknown): D365ModuleStats {
  const data = asRecord(row);
  return {
    environment_id: text(data.environment_id ?? data.environment),
    entity_name: text(data.entity_name ?? data.name),
    record_count: numOrNull(data.record_count),
    module: text(data.module ?? data.unique_name),
  };
}

function normalizeWorkflow(row: unknown): D365WorkflowHealth {
  const data = asRecord(row);
  const state = text(data.state);
  return {
    environment_id: text(data.environment_id ?? data.environment),
    workflow_name: text(data.workflow_name ?? data.name),
    category: numOrNull(data.category),
    state,
    status: normalizeWorkflowStatus(data.status, state),
    name: text(data.name),
    success_rate: data.success_rate == null ? undefined : num(data.success_rate),
    total_runs: data.total_runs == null ? undefined : num(data.total_runs),
  };
}

function normalizeBcStats(row: unknown): D365BCStats {
  const data = asRecord(row);
  return {
    environment_id: text(data.environment_id ?? data.environment),
    company_name: text(data.company_name ?? data.display_name ?? data.name),
    customers_count: numOrNull(data.customers_count),
    vendors_count: numOrNull(data.vendors_count),
    items_count: numOrNull(data.items_count),
    gl_entries_count: numOrNull(data.gl_entries_count),
  };
}

async function environments(): Promise<D365Environment[]> {
  const payload = await get<unknown>('/api/dynamics/environments');
  return unwrapRows(payload, 'environments').map((row) => normalizeEnvironment(row));
}

async function users(): Promise<D365User[]> {
  const payload = await get<unknown>('/api/dynamics/users');
  return unwrapRows(payload, 'users').map((row) => normalizeUser(row));
}

async function moduleStats(): Promise<D365ModuleStats[]> {
  const payload = await get<unknown>('/api/dynamics/module-stats');
  return unwrapRows(payload, 'modules').map((row) => normalizeModuleStats(row));
}

async function workflowHealth(): Promise<D365WorkflowHealth[]> {
  const payload = await get<unknown>('/api/dynamics/workflow-health');
  return unwrapRows(payload, 'workflows').map((row) => normalizeWorkflow(row));
}

async function bcStats(): Promise<D365BCStats[]> {
  const payload = await get<unknown>('/api/dynamics/bc-stats');
  return unwrapRows(payload, 'companies').map((row) => normalizeBcStats(row));
}

export const dynamicsApi = {
  environments,
  users,
  moduleStats,
  workflowHealth,
  bcStats,
};
