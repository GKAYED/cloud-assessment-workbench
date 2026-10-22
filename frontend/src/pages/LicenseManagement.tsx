/**
 * LicenseManagement.tsx — Microsoft 365 / Azure AD license overview.
 */

import { useMemo, useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { SummaryBar } from '../components/shared/SummaryBar';
import { DataTable } from '../components/shared/DataTable';
import { ChartCard } from '../components/shared/ChartCard';
import { useModuleData } from '../hooks/useModuleData';
import { licensesApi } from '../api/licenses';
import type { LicenseSKU, LicenseSummary, UserLicense } from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCompact, formatCurrency } from '../utils/formatters';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';

const col = createColumnHelper<LicenseSKU>();

const columns = [
  col.accessor((row) => row.sku_name ?? row.sku_part_number, { id: 'sku_name', header: 'SKU' }),
  col.accessor((row) => row.friendly_name ?? row.sku_display_name, { id: 'friendly_name', header: 'Plan' }),
  col.accessor((row) => row.total ?? row.purchased, { id: 'total', header: 'Total' }),
  col.accessor((row) => row.assigned ?? row.consumed, { id: 'assigned', header: 'Assigned' }),
  col.accessor('available', { header: 'Available' }),
  col.accessor((row) => row.utilization_percent ?? row.utilization_pct, {
    id: 'utilization_percent',
    header: 'Utilization',
    cell: (info) => {
      const row = info.row.original;
      return `${info.getValue().toFixed(0)}%${row.is_payg ? ' PAYG' : ''}`;
    },
  }),
  col.accessor((row) => row.is_underutilized, {
    id: 'underutilized_status',
    header: 'Underutilized',
    cell: (info) => (info.row.original.is_payg ? 'N/A PAYG' : info.getValue() ? 'Yes' : 'No'),
  }),
];

const userCol = createColumnHelper<UserLicense>();
const userColumns = [
  userCol.accessor('display_name', { header: 'User' }),
  userCol.accessor('user_principal_name', { header: 'UPN' }),
  userCol.accessor((row) => row.assigned_licenses.join(', '), {
    id: 'assigned_licenses',
    header: 'Assigned Licenses',
  }),
  userCol.accessor('last_sign_in', {
    header: 'Last Sign-In',
    cell: (info) => info.getValue() ?? 'Not available',
  }),
  userCol.accessor('is_inactive_30d', {
    header: 'Inactive (30d)',
    cell: (info) => {
      const value = info.getValue();
      if (value == null) return 'Unknown';
      return value ? 'Yes' : 'No';
    },
  }),
];

export default function LicenseManagement() {
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'inactive' | 'unknown'>('all');
  const [userLicenseFilter, setUserLicenseFilter] = useState<string>('');

  const skus = useModuleData<LicenseSKU[]>(() => licensesApi.skus(), [], { cacheKey: MODULE_CACHE_KEYS.licensesSkus });
  const summary = useModuleData<LicenseSummary>(() => licensesApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.licensesSummary });
  const users = useModuleData<UserLicense[]>(() => licensesApi.users(), [], { cacheKey: MODULE_CACHE_KEYS.licensesUsers });

  const estimatedMonthlyCostLabel = summary.data?.estimated_monthly_cost == null
    ? 'Not available'
    : formatCurrency(summary.data.estimated_monthly_cost);

  const userLicenseOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of users.data ?? []) {
      for (const license of row.assigned_licenses) values.add(license);
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [users.data]);

  const filteredUsers = useMemo(() => {
    return (users.data ?? []).filter((row) => {
      if (userStatusFilter === 'inactive' && row.is_inactive_30d !== true) return false;
      if (userStatusFilter === 'active' && row.is_inactive_30d !== false) return false;
      if (userStatusFilter === 'unknown' && row.is_inactive_30d != null) return false;
      if (userLicenseFilter && !row.assigned_licenses.includes(userLicenseFilter)) return false;
      return true;
    });
  }, [users.data, userStatusFilter, userLicenseFilter]);

  const paygNote = summary.data?.payg_note
    ?? 'SKUs reported by Microsoft Graph with purchased quantities of 10,000, 100,000, or 1,000,000 are flagged as pay-as-you-go allocations for reporting clarity. For these SKUs, imported purchased, consumed, available, and utilisation values are preserved as returned by the source system, and the underutilised status is presented as not applicable.';

  return (
    <PageLayout title="License Management" exportId="license-page">
      <p className="inventory-summary-note">Source: Microsoft Graph (`/api/licenses/skus`, `/api/licenses/users`, `/api/licenses/summary`).</p>
      {summary.status === 'success' && summary.data && (
        <SummaryBar items={[
          { label: 'Total Licenses', value: formatCompact(summary.data.total_licenses ?? 0) },
          { label: 'Assigned', value: formatCompact(summary.data.assigned_licenses ?? 0) },
          { label: 'Unused', value: formatCompact(summary.data.unused_licenses ?? 0) },
          {
            label: 'Est. Monthly Cost',
            value: estimatedMonthlyCostLabel,
            note: summary.data.estimated_monthly_cost == null
              ? 'Graph does not return license pricing in this API.'
              : undefined,
          },
        ]} />
      )}

      {skus.status === 'success' && skus.data && (
        <ChartCard
          title="License Utilization by SKU"
          data={skus.data
            .map((s) => {
              const value = s.utilization_percent ?? s.utilization_pct;
              const name = s.friendly_name ?? s.sku_display_name;
              return {
                name: `${name} ${Math.round(Number(value ?? 0))}%`,
                value,
              };
            })
            .filter((row) => Number(row.value ?? 0) > 0)}
          xKey="name"
          yKey="value"
          chartType="bar"
          height={420}
          barLabelMode="inside"
        />
      )}

      <p className="inventory-summary-note">{paygNote}</p>

      <h3>License SKUs</h3>
      {skus.status === 'success' && skus.data ? (
        skus.data.length > 0 ? (
          <DataTable data={skus.data} columns={columns} exportFileName="license sku summary" />
        ) : (
          <p className="empty-state">No license SKU data was returned from Microsoft Graph for the active profile.</p>
        )
      ) : skus.status === 'error' ? (
        <p className="error-text">Failed to load licenses: {skus.error}</p>
      ) : (
        <p className="loading-text">Loading licenses…</p>
      )}

      <h3>Licensed Users</h3>
      {users.status === 'success' && users.data ? (
        users.data.length > 0 ? (
          <>
            <div className="security-filter-row">
              <select className="inventory-filter-select" value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'unknown')}>
                <option value="all">All users</option>
                <option value="active">Active in last 30 days</option>
                <option value="inactive">Inactive in last 30 days</option>
                <option value="unknown">Unknown activity</option>
              </select>
              <select className="inventory-filter-select" value={userLicenseFilter} onChange={(e) => setUserLicenseFilter(e.target.value)}>
                <option value="">All licenses</option>
                {userLicenseOptions.map((license) => (
                  <option key={license} value={license}>{license}</option>
                ))}
              </select>
            </div>
            <p className="cost-chart-note">{filteredUsers.length} licensed user(s) shown after filters.</p>
            <DataTable data={filteredUsers} columns={userColumns} exportFileName="licensed users" />
          </>
        ) : (
          <p className="empty-state">No licensed users were returned from Microsoft Graph for the active profile.</p>
        )
      ) : users.status === 'error' ? (
        <p className="error-text">Failed to load licensed users: {users.error}</p>
      ) : (
        <p className="loading-text">Loading licensed users…</p>
      )}
    </PageLayout>
  );
}
