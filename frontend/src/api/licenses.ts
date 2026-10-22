import { get } from './client';
import type { LicenseSKU, UserLicense, LicenseSummary } from '../types';

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

function unwrapRows(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  const data = (payload as Record<string, unknown>) ?? {};
  const keyed = data[key];
  return Array.isArray(keyed) ? keyed : [];
}

function normalizeSku(row: unknown): LicenseSKU {
  const data = (row as Record<string, unknown>) ?? {};
  const total = num(data.total ?? data.purchased ?? data.total_licenses);
  const assigned = num(data.assigned ?? data.consumed ?? data.assigned_licenses);
  const available = num(data.available ?? data.available_licenses ?? Math.max(0, total - assigned));
  const utilization = data.utilization_percent != null
    ? num(data.utilization_percent)
    : data.utilization_pct != null
      ? num(data.utilization_pct)
      : total > 0
        ? (assigned / total) * 100
        : 0;

  return {
    sku_id: String(data.sku_id ?? ''),
    sku_part_number: String(data.sku_part_number ?? ''),
    sku_display_name: String(data.sku_display_name ?? data.friendly_name ?? data.sku_name ?? ''),
    purchased: total,
    consumed: assigned,
    available,
    utilization_pct: utilization,
    is_underutilized: Boolean(data.is_underutilized ?? available > 0),
    is_payg: Boolean(data.is_payg ?? false),
    sku_name: data.sku_name ? String(data.sku_name) : undefined,
    friendly_name: data.friendly_name ? String(data.friendly_name) : undefined,
    total,
    assigned,
    utilization_percent: utilization,
  };
}

function normalizeUser(row: unknown): UserLicense {
  const data = (row as Record<string, unknown>) ?? {};
  const inactiveRaw = data.is_inactive_30d;
  return {
    user_id: String(data.user_id ?? ''),
    display_name: String(data.display_name ?? ''),
    user_principal_name: String(data.user_principal_name ?? data.upn ?? ''),
    assigned_licenses: Array.isArray(data.assigned_licenses)
      ? data.assigned_licenses.map((item) => String(item))
      : [],
    last_sign_in: data.last_sign_in ? String(data.last_sign_in) : null,
    is_inactive_30d: typeof inactiveRaw === 'boolean' ? inactiveRaw : null,
    estimated_monthly_cost: numOrNull(data.estimated_monthly_cost),
  };
}

function normalizeSummary(summary: unknown, skus: LicenseSKU[] = []): LicenseSummary {
  const data = (summary as Record<string, unknown>) ?? {};
  const totalLicenses = num(data.total_licenses ?? data.total_purchased ?? data.total_licensed_seats);
  const assignedLicenses = num(data.assigned_licenses ?? data.total_consumed ?? data.total_assigned_seats);
  const unusedLicenses = num(data.unused_licenses ?? data.total_available ?? data.total_available_seats);
  const underutilizedRaw = Array.isArray(data.underutilized_skus) ? data.underutilized_skus : [];
  const underutilized = underutilizedRaw.map((item) => {
    if (typeof item === 'string') {
      return {
        sku_id: '',
        sku_part_number: item,
        sku_display_name: item,
        purchased: 0,
        consumed: 0,
        available: 0,
        utilization_pct: 0,
        is_underutilized: true,
        friendly_name: item,
        total: 0,
        assigned: 0,
        utilization_percent: 0,
      } satisfies LicenseSKU;
    }
    return normalizeSku(item);
  });

  const derivedTotal = totalLicenses > 0 ? totalLicenses : skus.reduce((sum, row) => sum + (row.total ?? row.purchased ?? 0), 0);
  const derivedAssigned = assignedLicenses > 0 ? assignedLicenses : skus.reduce((sum, row) => sum + (row.assigned ?? row.consumed ?? 0), 0);
  const derivedUnused = unusedLicenses > 0 ? unusedLicenses : Math.max(0, derivedTotal - derivedAssigned);
  const utilization = data.overall_utilization_pct != null
    ? num(data.overall_utilization_pct)
    : derivedTotal > 0
      ? (derivedAssigned / derivedTotal) * 100
      : 0;

  return {
    total_skus: num(data.total_skus),
    total_purchased: derivedTotal,
    total_consumed: derivedAssigned,
    total_available: derivedUnused,
    overall_utilization_pct: utilization,
    underutilized_skus: underutilized,
    inactive_licensed_users: num(data.inactive_licensed_users),
    estimated_waste_monthly: numOrNull(data.estimated_waste_monthly),
    total_licenses: derivedTotal,
    assigned_licenses: derivedAssigned,
    unused_licenses: derivedUnused,
    estimated_monthly_cost: numOrNull(data.estimated_monthly_cost),
    payg_note: data.payg_note ? String(data.payg_note) : null,
  };
}

async function skus(): Promise<LicenseSKU[]> {
  const payload = await get<unknown>('/api/licenses/skus');
  const rows = unwrapRows(payload, 'skus');
  return rows.map((row) => normalizeSku(row));
}

async function users(): Promise<UserLicense[]> {
  const payload = await get<unknown>('/api/licenses/users');
  const rows = unwrapRows(payload, 'users');
  return rows.map((row) => normalizeUser(row));
}

async function summary(): Promise<LicenseSummary> {
  const payload = await get<unknown>('/api/licenses/summary');
  const data = Array.isArray(payload)
    ? {}
    : ((payload as Record<string, unknown>) ?? {});
  const summaryPayload =
    'total_licenses' in data
      || 'total_purchased' in data
      || 'total_licensed_seats' in data
      || 'overall_utilization_pct' in data
      ? data
      : (data.summary as Record<string, unknown>) ?? data;
  return normalizeSummary(summaryPayload);
}

export const licensesApi = {
  skus,
  users,
  summary,
};
