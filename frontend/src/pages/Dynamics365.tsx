/**
 * Dynamics365.tsx — D365 environment health, modules, and usage.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { DataTable } from '../components/shared/DataTable';
import { useModuleData } from '../hooks/useModuleData';
import { CHART_GRID } from '../utils/chartPalette';
import { dynamicsApi } from '../api/dynamics';
import { dynamicsContextApi } from '../api/dynamicsContext';
import { dataGapsApi } from '../api/dataGaps';
import { useProfile } from '../hooks/useProfile';
import type {
  D365Environment,
  D365User,
  D365WorkflowHealth,
  D365ModuleStats,
  D365BCStats,
  DynamicsManualContext,
  DynamicsManualContextUpdate,
  DataGap,
  ModuleState,
} from '../types';
import { createColumnHelper } from '@tanstack/react-table';
import { MODULE_CACHE_KEYS } from '../cache/moduleKeys';
import { DynamicsTableSection } from '../components/dynamics/DynamicsTableSection';
import { DynamicsManualContextPanel } from '../components/dynamics/DynamicsManualContextPanel';
import { DynamicsCoverageSignalGrid } from '../components/dynamics/DynamicsCoverageSignalGrid';
import { DynamicsFootprintSection } from '../components/dynamics/DynamicsFootprintSection';
import { DynamicsChartsSections, DynamicsOperationalSummary } from '../components/dynamics/DynamicsChartsSections';

function safePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function formatPercentValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatMbToGb(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${(value / 1024).toFixed(1)} GB`;
}

function environmentLabel(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text || 'Unknown environment';
}

function buildEnvironmentBreakdown<T>(
  rows: T[] | null | undefined,
  selector: (row: T) => string | null | undefined,
): Array<{ name: string; value: number; pct: number }> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const key = environmentLabel(selector(row));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? safePercent(value, total) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function renderEnvironmentDonutLabel(
  entryLabel: 'users' | 'workflows' | 'solutions',
  fill: string,
  stroke: string,
) {
  return ({
    name,
    value,
    x,
    y,
    textAnchor,
  }: {
    name?: string;
    value?: number | string;
    x?: number;
    y?: number;
    textAnchor?: 'end' | 'inherit' | 'start' | 'middle';
  }) => {
    const numericValue = typeof value === 'number' ? value : Number(value ?? NaN);
    if (!name || !Number.isFinite(numericValue) || numericValue <= 0 || x == null || y == null) return '';
    return (
      <text
        x={x}
        y={y}
        fill={fill}
        stroke={stroke}
        strokeWidth={3}
        paintOrder="stroke"
        fontSize={12}
        fontWeight={600}
        textAnchor={textAnchor ?? 'middle'}
        dominantBaseline="central"
      >
        {`${name} (${numericValue} ${entryLabel})`}
      </text>
    );
  };
}

interface DynamicsFootprintRow {
  environment: string;
  type: string;
  region: string;
  version: string;
  status: string;
  users: number;
  solutions: number;
  workflows: number;
  roles: string;
}

const EMPTY_DYNAMICS_CONTEXT_FORM: DynamicsManualContextUpdate = {
  extra_environments: '',
  dataverse_capacity_notes: '',
  dataverse_license_notes: '',
  dataverse_cost_notes: '',
  discovery_gap_notes: '',
  additional_notes: '',
};

/* ── Environment columns ─────────────────────────────────────────── */

const envCol = createColumnHelper<D365Environment>();
const envColumns = [
  envCol.accessor((row) => row.display_name || row.name, { id: 'name', header: 'Environment' }),
  envCol.accessor((row) => row.environment_type || row.type || '—', { id: 'type', header: 'Environment type' }),
  envCol.accessor('region', { header: 'Region' }),
  envCol.accessor((row) => row.version ?? '', { id: 'version', header: 'Version' }),
  envCol.accessor((row) => row.status ?? row.state ?? '', { id: 'status', header: 'Status' }),
  envCol.accessor('url', {
    header: 'URL',
    cell: (info) => {
      const val = info.getValue();
      if (!val) return '—';
      const short = val.replace(/^https?:\/\//, '');
      return <a href={val} target="_blank" rel="noopener noreferrer" className="link-subtle">{short}</a>;
    },
  }),
];

/* ── User columns ────────────────────────────────────────────────── */

const userCol = createColumnHelper<D365User>();
const userColumns = [
  userCol.accessor((row) => row.display_name ?? row.full_name, { id: 'name', header: 'Name' }),
  userCol.accessor('email', { header: 'Email' }),
  userCol.accessor((row) => environmentLabel(row.environment), { id: 'environment', header: 'Environment' }),
  userCol.accessor((row) => (row.roles ?? row.security_roles ?? []).join(', ') || '—', { id: 'roles', header: 'Roles' }),
  userCol.accessor((row) => row.business_unit ?? '', { id: 'bu', header: 'Business Unit' }),
  userCol.accessor((row) => row.license_type ?? '—', { id: 'license', header: 'License' }),
];

/* ── Module Stats columns ────────────────────────────────────────── */

const modCol = createColumnHelper<D365ModuleStats>();
const modColumns = [
  modCol.accessor('entity_name', { header: 'Solution / Entity' }),
  modCol.accessor('module', { header: 'Unique Name' }),
  modCol.accessor('environment_id', { header: 'Environment' }),
  modCol.accessor('record_count', {
    header: 'Record Count',
    cell: (info) => {
      const value = info.getValue();
      return value != null ? value.toLocaleString() : '—';
    },
  }),
];

/* ── Workflow columns ────────────────────────────────────────────── */

const wfCol = createColumnHelper<D365WorkflowHealth>();
const wfColumns = [
  wfCol.accessor((row) => row.workflow_name || row.name || '', { id: 'name', header: 'Workflow' }),
  wfCol.accessor('environment_id', { header: 'Environment' }),
  wfCol.accessor((row) => row.status || row.state || '', {
    id: 'status',
    header: 'Status',
    cell: (info) => {
      const rawValue = info.getValue();
      const val = rawValue == null ? '' : String(rawValue);
      const lowered = val.toLowerCase();
      const cls = lowered === 'running' || lowered === 'active' ? 'tier--good' : 'tier--poor';
      return <span className={cls}>{val}</span>;
    },
  }),
  wfCol.accessor('success_rate', {
    header: 'Success Rate',
    cell: (info) => {
      const val = info.getValue();
      return val != null ? `${val}%` : '—';
    },
  }),
  wfCol.accessor('total_runs', {
    header: 'Total Runs',
    cell: (info) => {
      const val = info.getValue();
      return val != null ? val.toLocaleString() : '—';
    },
  }),
];

/* ── BC Stats columns ────────────────────────────────────────────── */

const bcCol = createColumnHelper<D365BCStats>();
const bcColumns = [
  bcCol.accessor('company_name', { header: 'Company' }),
  bcCol.accessor('environment_id', { header: 'Environment' }),
  bcCol.accessor('customers_count', {
    header: 'Customers',
    cell: (info) => {
      const value = info.getValue();
      return value != null ? value.toLocaleString() : '—';
    },
  }),
  bcCol.accessor('vendors_count', {
    header: 'Vendors',
    cell: (info) => {
      const value = info.getValue();
      return value != null ? value.toLocaleString() : '—';
    },
  }),
  bcCol.accessor('items_count', {
    header: 'Items',
    cell: (info) => {
      const value = info.getValue();
      return value != null ? value.toLocaleString() : '—';
    },
  }),
  bcCol.accessor('gl_entries_count', {
    header: 'GL Entries',
    cell: (info) => {
      const value = info.getValue();
      return value != null ? value.toLocaleString() : '—';
    },
  }),
];

const footprintCol = createColumnHelper<DynamicsFootprintRow>();
const footprintColumns = [
  footprintCol.accessor('environment', { header: 'Environment' }),
  footprintCol.accessor('type', { header: 'Type' }),
  footprintCol.accessor('region', { header: 'Region' }),
  footprintCol.accessor('version', { header: 'Version' }),
  footprintCol.accessor('status', { header: 'Status' }),
  footprintCol.accessor('users', {
    header: 'Users',
    cell: (info) => info.getValue().toLocaleString(),
  }),
  footprintCol.accessor('solutions', {
    header: 'Solutions',
    cell: (info) => info.getValue().toLocaleString(),
  }),
  footprintCol.accessor('workflows', {
    header: 'Workflows',
    cell: (info) => info.getValue().toLocaleString(),
  }),
  footprintCol.accessor('roles', { header: 'Roles in returned data' }),
];

/* ── Main component ──────────────────────────────────────────────── */

export default function Dynamics365() {
  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const chartTheme = {
    text: isLightTheme ? '#334155' : '#cbd5e1',
    muted: isLightTheme ? '#64748b' : '#94a3b8',
    grid: isLightTheme ? '#d7e2f0' : CHART_GRID,
    halo: isLightTheme ? 'rgba(255,255,255,0.94)' : 'rgba(15,23,42,0.55)',
  };
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const [manualContext, setManualContext] = useState<DynamicsManualContext | null>(null);
  const [manualContextLoading, setManualContextLoading] = useState(false);
  const [manualContextError, setManualContextError] = useState<string | null>(null);
  const [manualContextPanelOpen, setManualContextPanelOpen] = useState(false);
  const [manualContextSaving, setManualContextSaving] = useState(false);
  const [manualContextForm, setManualContextForm] = useState<DynamicsManualContextUpdate>(EMPTY_DYNAMICS_CONTEXT_FORM);
  const manualContextLoadRequestSeqRef = useRef(0);
  const manualContextSaveRequestSeqRef = useRef(0);
  const manualContextProfileEpochRef = useRef(0);
  const envs = useModuleData<D365Environment[]>(() => dynamicsApi.environments(), [], {
    cacheKey: MODULE_CACHE_KEYS.dynamicsEnvironments,
  });
  const users = useModuleData<D365User[]>(() => dynamicsApi.users(), [], {
    cacheKey: MODULE_CACHE_KEYS.dynamicsUsers,
  });
  const workflows = useModuleData<D365WorkflowHealth[]>(() => dynamicsApi.workflowHealth(), [], {
    cacheKey: MODULE_CACHE_KEYS.dynamicsWorkflowHealth,
  });
  const moduleStats = useModuleData<D365ModuleStats[]>(() => dynamicsApi.moduleStats(), [], {
    cacheKey: MODULE_CACHE_KEYS.dynamicsModuleStats,
  });
  const bcStats = useModuleData<D365BCStats[]>(() => dynamicsApi.bcStats(), [], {
    cacheKey: MODULE_CACHE_KEYS.dynamicsBcStats,
  });
  const gaps = useModuleData<DataGap[]>(() => dataGapsApi.list(), [], {
    cacheKey: MODULE_CACHE_KEYS.dataGaps,
  });

  useEffect(() => {
    manualContextProfileEpochRef.current += 1;
    manualContextSaveRequestSeqRef.current += 1;
    const requestSeq = ++manualContextLoadRequestSeqRef.current;
    setManualContext(null);
    setManualContextPanelOpen(false);
    setManualContextSaving(false);
    if (!profileId) {
      setManualContextLoading(false);
      setManualContextError(null);
      setManualContextForm(EMPTY_DYNAMICS_CONTEXT_FORM);
      return;
    }
    let cancelled = false;
    setManualContextLoading(true);
    setManualContextError(null);
    dynamicsContextApi
      .get(profileId)
      .then((row) => {
        if (cancelled || manualContextLoadRequestSeqRef.current !== requestSeq) return;
        setManualContext(row);
        setManualContextForm({
          extra_environments: row.extra_environments ?? '',
          dataverse_capacity_notes: row.dataverse_capacity_notes ?? '',
          dataverse_license_notes: row.dataverse_license_notes ?? '',
          dataverse_cost_notes: row.dataverse_cost_notes ?? '',
          discovery_gap_notes: row.discovery_gap_notes ?? '',
          additional_notes: row.additional_notes ?? '',
        });
      })
      .catch((err: unknown) => {
        if (cancelled || manualContextLoadRequestSeqRef.current !== requestSeq) return;
        setManualContextError(err instanceof Error ? err.message : 'Failed to load Dynamics manual context.');
      })
      .finally(() => {
        if (cancelled || manualContextLoadRequestSeqRef.current !== requestSeq) return;
        setManualContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const dynamicsGaps = useMemo(() => {
    return (gaps.data ?? []).filter((gap) => {
      const moduleName = (gap.module ?? '').toLowerCase();
      return moduleName.includes('dynamics');
    });
  }, [gaps.data]);

  const authGaps = dynamicsGaps.filter((g) => {
    const reason = (g.reason ?? '').toLowerCase();
    return reason.includes('401') || reason.includes('unauthorized') || reason.includes('illegal header');
  });

  /* ── Counts for the hero bar ───────────────────────────────────── */
  const envCount = envs.data?.length ?? 0;
  const userCount = users.data?.length ?? 0;
  const moduleCount = moduleStats.data?.length ?? 0;
  const totalWorkflows = workflows.data?.length ?? 0;
  const bcCompanies = bcStats.data?.length ?? 0;

  const environmentSummary = useMemo(() => {
    const rows = envs.data ?? [];
    const enabled = rows.filter((row) => ['enabled', 'active', 'available'].includes(String(row.status ?? row.state ?? '').toLowerCase())).length;
    const production = rows.filter((row) => String(row.environment_type ?? row.type ?? '').toLowerCase().includes('prod')).length;
    const sandbox = rows.filter((row) => {
      const type = String(row.environment_type ?? row.type ?? '').toLowerCase();
      return type.includes('sandbox') || type.includes('test') || type.includes('trial');
    }).length;
    const dbUsed = rows.reduce((sum, row) => sum + (row.database_capacity_used_mb ?? 0), 0);
    const dbAllocated = rows.reduce((sum, row) => sum + (row.database_capacity_allocated_mb ?? 0), 0);
    const fileUsed = rows.reduce((sum, row) => sum + (row.file_capacity_used_mb ?? 0), 0);
    const fileAllocated = rows.reduce((sum, row) => sum + (row.file_capacity_allocated_mb ?? 0), 0);
    return {
      enabled,
      enabledRate: safePercent(enabled, rows.length),
      production,
      sandbox,
      dbUsed,
      dbAllocated,
      dbUsagePct: dbAllocated > 0 ? safePercent(dbUsed, dbAllocated) : null,
      fileUsed,
      fileAllocated,
      fileUsagePct: fileAllocated > 0 ? safePercent(fileUsed, fileAllocated) : null,
    };
  }, [envs.data]);

  const userSummary = useMemo(() => {
    const rows = users.data ?? [];
    const disabled = rows.filter((row) => row.is_disabled).length;
    const active30d = rows.filter((row) => row.is_active_30d === true).length;
    const inactive30d = rows.filter((row) => row.is_active_30d === false).length;
    const unknownActivity = rows.filter((row) => row.is_active_30d == null).length;
    const roles = new Map<string, number>();
    for (const row of rows) {
      for (const role of row.roles ?? row.security_roles ?? []) {
        const key = role.trim();
        if (!key) continue;
        roles.set(key, (roles.get(key) ?? 0) + 1);
      }
    }
    const topRoles = [...roles.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { disabled, active30d, inactive30d, unknownActivity, topRoles };
  }, [users.data]);

  const workflowSummary = useMemo(() => {
    const rows = workflows.data ?? [];
    const withTelemetry = rows.filter((row) => row.success_rate != null);
    const avgSuccessRate = withTelemetry.length > 0
      ? Number((withTelemetry.reduce((sum, row) => sum + Number(row.success_rate ?? 0), 0) / withTelemetry.length).toFixed(1))
      : null;
    const attention = withTelemetry.filter((row) => Number(row.success_rate ?? 100) < 95);
    const inactive = rows.filter((row) => !['running', 'active'].includes(String(row.status ?? row.state ?? '').toLowerCase()));
    return {
      withTelemetry: withTelemetry.length,
      avgSuccessRate,
      attentionCount: attention.length,
      attentionRate: withTelemetry.length > 0 ? safePercent(attention.length, withTelemetry.length) : null,
      inactiveCount: inactive.length,
      topAttention: attention
        .sort((a, b) => Number(a.success_rate ?? 100) - Number(b.success_rate ?? 100))
        .slice(0, 5),
    };
  }, [workflows.data]);

  const moduleSummary = useMemo(() => {
    const rows = moduleStats.data ?? [];
    const byEnvironment = new Map<string, number>();
    for (const row of rows) {
      const key = row.environment_id || 'Unknown environment';
      byEnvironment.set(key, (byEnvironment.get(key) ?? 0) + 1);
    }
    return [...byEnvironment.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [moduleStats.data]);

  const bcSummary = useMemo(() => {
    const rows = bcStats.data ?? [];
    return {
      companies: rows.length,
      customers: rows.reduce((sum, row) => sum + (row.customers_count ?? 0), 0),
      vendors: rows.reduce((sum, row) => sum + (row.vendors_count ?? 0), 0),
      items: rows.reduce((sum, row) => sum + (row.items_count ?? 0), 0),
      glEntries: rows.reduce((sum, row) => sum + (row.gl_entries_count ?? 0), 0),
    };
  }, [bcStats.data]);

  const roleAccessGaps = useMemo(
    () => dynamicsGaps.filter((gap) => String(gap.missing_data ?? gap.field ?? '').toLowerCase().startsWith('security_roles_')),
    [dynamicsGaps],
  );

  const dynamicsFootprintRows = useMemo(() => {
    const userCounts = new Map<string, number>();
    const moduleCounts = new Map<string, number>();
    const workflowCounts = new Map<string, number>();
    const rolesByEnv = new Map<string, Map<string, number>>();

    for (const row of users.data ?? []) {
      const key = environmentLabel(row.environment);
      userCounts.set(key, (userCounts.get(key) ?? 0) + 1);
      const bucket = rolesByEnv.get(key) ?? new Map<string, number>();
      for (const role of row.roles ?? row.security_roles ?? []) {
        const trimmed = String(role).trim();
        if (!trimmed) continue;
        bucket.set(trimmed, (bucket.get(trimmed) ?? 0) + 1);
      }
      rolesByEnv.set(key, bucket);
    }

    for (const row of moduleStats.data ?? []) {
      const key = environmentLabel(row.environment_id);
      moduleCounts.set(key, (moduleCounts.get(key) ?? 0) + 1);
    }

    for (const row of workflows.data ?? []) {
      const key = environmentLabel(row.environment_id);
      workflowCounts.set(key, (workflowCounts.get(key) ?? 0) + 1);
    }

    const roleGapKeys = new Set(
      roleAccessGaps.map((gap) => String(gap.missing_data ?? gap.field ?? '').replace(/^security_roles_/i, '').toLowerCase()),
    );

    return (envs.data ?? []).map((env) => {
      const name = environmentLabel(env.display_name || env.name);
      const envDomainKey = String(env.domain_name ?? '').trim().toLowerCase();
      const roleMap = (envDomainKey ? rolesByEnv.get(envDomainKey) : undefined) ?? rolesByEnv.get(name);
      const topRoles = roleMap
        ? [...roleMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([role]) => role)
        : [];
      const roles = topRoles.length > 0
        ? topRoles.join(', ')
        : envDomainKey && roleGapKeys.has(envDomainKey)
          ? 'Not returned due to role-assignment permissions'
          : 'No role data returned';

      return {
        environment: name,
        type: env.environment_type || env.type || 'Unknown',
        region: env.region || '—',
        version: env.version || '—',
        status: env.status || env.state || 'Unknown',
        users: (envDomainKey ? userCounts.get(envDomainKey) : undefined) ?? userCounts.get(name) ?? 0,
        solutions: (envDomainKey ? moduleCounts.get(envDomainKey) : undefined) ?? moduleCounts.get(name) ?? 0,
        workflows: (envDomainKey ? workflowCounts.get(envDomainKey) : undefined) ?? workflowCounts.get(name) ?? 0,
        roles,
      };
    }).sort((a, b) => b.users - a.users || b.solutions - a.solutions || a.environment.localeCompare(b.environment));
  }, [envs.data, moduleStats.data, roleAccessGaps, users.data, workflows.data]);

  const footprintDrivers = useMemo(() => {
    const topUsers = [...dynamicsFootprintRows].sort((a, b) => b.users - a.users)[0] ?? null;
    const topSolutions = [...dynamicsFootprintRows].sort((a, b) => b.solutions - a.solutions)[0] ?? null;
    const topWorkflows = [...dynamicsFootprintRows].sort((a, b) => b.workflows - a.workflows)[0] ?? null;
    return { topUsers, topSolutions, topWorkflows };
  }, [dynamicsFootprintRows]);

  const footprintGuidance = useMemo(() => {
    const notes: string[] = [];
    if (envCount > 5) {
      notes.push(`The estate spans ${envCount} discovered environments, so naming, lifecycle control, and release discipline become important to avoid platform sprawl.`);
    }
    if ((footprintDrivers.topUsers?.users ?? 0) >= 300) {
      notes.push(`${footprintDrivers.topUsers?.environment} has the largest returned user population (${footprintDrivers.topUsers?.users.toLocaleString()}), which is a good candidate for focused access review and security role cleanup.`);
    }
    if ((footprintDrivers.topSolutions?.solutions ?? 0) >= 500) {
      notes.push(`${footprintDrivers.topSolutions?.environment} carries the heaviest returned solution footprint (${footprintDrivers.topSolutions?.solutions.toLocaleString()}), which suggests ALM, solution layering, and dependency management should be reviewed closely.`);
    }
    if ((footprintDrivers.topWorkflows?.workflows ?? 0) >= 500) {
      notes.push(`${footprintDrivers.topWorkflows?.environment} has the largest automation footprint (${footprintDrivers.topWorkflows?.workflows.toLocaleString()} workflows), so monitoring, ownership, and inactive flow cleanup matter more there.`);
    }
    if (roleAccessGaps.length > 0) {
      notes.push('Security role visibility is incomplete because role-assignment entities were not readable in one or more environments, so role model conclusions should be treated as partial.');
    }
    return notes;
  }, [envCount, footprintDrivers, roleAccessGaps.length]);

  const manualContextPrompts = useMemo(() => {
    const notes = [
      'Record any known environments that were not discovered through the APIs, including their purpose and business owner.',
      'Confirm which environments are production-critical, sandbox, training, partner-facing, or legacy.',
      'Add context on major solutions, departments served, and any integrations that are business-critical but not obvious from metadata alone.',
    ];
    if (roleAccessGaps.length > 0) {
      notes.push('Document key security roles or access model patterns manually until Dataverse role-assignment read access is available.');
    }
    return notes;
  }, [roleAccessGaps.length]);

  const manualContextSections = useMemo(() => {
    const sections = [
      { label: 'Additional environments not returned by APIs', value: manualContext?.extra_environments ?? '' },
      { label: 'Dataverse capacity notes', value: manualContext?.dataverse_capacity_notes ?? '' },
      { label: 'Dataverse license notes', value: manualContext?.dataverse_license_notes ?? '' },
      { label: 'Dataverse cost notes', value: manualContext?.dataverse_cost_notes ?? '' },
      { label: 'Discovery and permission gap notes', value: manualContext?.discovery_gap_notes ?? '' },
      { label: 'Additional manual context', value: manualContext?.additional_notes ?? '' },
    ].filter((section) => section.value.trim().length > 0);
    return sections;
  }, [manualContext]);

  const openManualContextPanel = useCallback(() => {
    setManualContextForm({
      extra_environments: manualContext?.extra_environments ?? '',
      dataverse_capacity_notes: manualContext?.dataverse_capacity_notes ?? '',
      dataverse_license_notes: manualContext?.dataverse_license_notes ?? '',
      dataverse_cost_notes: manualContext?.dataverse_cost_notes ?? '',
      discovery_gap_notes: manualContext?.discovery_gap_notes ?? '',
      additional_notes: manualContext?.additional_notes ?? '',
    });
    setManualContextPanelOpen(true);
  }, [manualContext]);

  const closeManualContextPanel = useCallback(() => {
    setManualContextPanelOpen(false);
  }, []);

  const updateManualContextField = useCallback(
    <K extends keyof DynamicsManualContextUpdate>(field: K, value: DynamicsManualContextUpdate[K]) => {
      setManualContextForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const saveManualContext = useCallback(async () => {
    if (!profileId) return;
    const requestSeq = ++manualContextSaveRequestSeqRef.current;
    const profileEpoch = manualContextProfileEpochRef.current;
    setManualContextSaving(true);
    setManualContextError(null);
    try {
      const payload: DynamicsManualContextUpdate = {
        extra_environments: manualContextForm.extra_environments?.trim() || null,
        dataverse_capacity_notes: manualContextForm.dataverse_capacity_notes?.trim() || null,
        dataverse_license_notes: manualContextForm.dataverse_license_notes?.trim() || null,
        dataverse_cost_notes: manualContextForm.dataverse_cost_notes?.trim() || null,
        discovery_gap_notes: manualContextForm.discovery_gap_notes?.trim() || null,
        additional_notes: manualContextForm.additional_notes?.trim() || null,
      };
      const saved = await dynamicsContextApi.update(profileId, payload);
      if (manualContextSaveRequestSeqRef.current !== requestSeq || manualContextProfileEpochRef.current !== profileEpoch) return;
      setManualContext(saved);
      setManualContextPanelOpen(false);
    } catch (err) {
      if (manualContextSaveRequestSeqRef.current === requestSeq && manualContextProfileEpochRef.current === profileEpoch) {
        setManualContextError(err instanceof Error ? err.message : 'Failed to save Dynamics manual context.');
      }
    } finally {
      if (manualContextSaveRequestSeqRef.current === requestSeq && manualContextProfileEpochRef.current === profileEpoch) {
        setManualContextSaving(false);
      }
    }
  }, [manualContextForm, profileId]);

  const coverageSignals = useMemo(() => {
    return [
      {
        label: 'Environments',
        value: envCount,
        status: envCount > 0 ? 'good' : 'poor',
        note: envCount > 0 ? `${environmentSummary.enabled} enabled discovered` : 'No environment metadata returned',
      },
      {
        label: 'Users',
        value: userCount,
        status: userCount > 0 ? 'good' : 'poor',
        note: userCount > 0 ? `${userSummary.active30d} active in 30 days` : 'No user telemetry returned',
      },
      {
        label: 'Solutions',
        value: moduleCount,
        status: moduleCount > 0 ? 'good' : 'watch',
        note: moduleCount > 0 ? 'Returned module and customization metadata' : 'No solution metadata returned',
      },
      {
        label: 'Workflows',
        value: totalWorkflows,
        status: workflowSummary.withTelemetry > 0 ? 'good' : totalWorkflows > 0 ? 'watch' : 'poor',
        note: workflowSummary.withTelemetry > 0 ? `${workflowSummary.withTelemetry} with success telemetry` : 'Success telemetry missing',
      },
      {
        label: 'Business Central',
        value: bcCompanies,
        status: bcCompanies > 0 ? 'good' : 'watch',
        note: bcCompanies > 0 ? `${bcSummary.customers.toLocaleString()} customers across returned companies` : 'No BC companies returned',
      },
      {
        label: 'Business Central companies',
        value: bcCompanies.toLocaleString(),
        status: bcCompanies > 0 ? 'good' : 'watch',
        note: bcCompanies > 0 ? 'BC company telemetry returned' : 'No Business Central company telemetry returned',
      },
    ];
  }, [
    bcCompanies,
    bcSummary.customers,
    envCount,
    environmentSummary.enabled,
    moduleCount,
    totalWorkflows,
    userCount,
    userSummary.active30d,
    workflowSummary.withTelemetry,
  ]);

  const practicalNotes = useMemo(() => {
    const notes: string[] = [];
    if (authGaps.length > 0) {
      notes.push('Dataverse auth gaps are blocking parts of the page, so absence of data does not always mean absence of capability.');
    }
    if (workflowSummary.withTelemetry === 0 && totalWorkflows > 0) {
      notes.push('Workflow rows exist, but success telemetry is missing, so automation reliability cannot yet be judged defensibly.');
    }
    if (environmentSummary.dbUsagePct != null && environmentSummary.dbUsagePct > 80) {
      notes.push('Dataverse database capacity is above 80% of returned allocation, which should be reviewed before growth becomes a delivery constraint.');
    }
    if (userSummary.inactive30d > 0) {
      notes.push(`${userSummary.inactive30d} Dynamics users show no activity in the last 30 days and should be checked for license and access cleanup.`);
    }
    return notes;
  }, [
    authGaps.length,
    environmentSummary.dbUsagePct,
    totalWorkflows,
    userSummary.inactive30d,
    workflowSummary.withTelemetry,
  ]);

  /* ── Chart data for visual summary ── */
  const ENV_PIE_COLORS = isLightTheme
    ? ['#4f46e5', '#7c3aed', '#8b5cf6', '#6366f1']
    : ['#6366f1', '#a78bfa', '#c4b5fd', '#e0e7ff'];
  const userBarColors = useMemo(
    () => (isLightTheme ? ['#16a34a', '#d97706', '#64748b', '#dc2626'] : ['#22c55e', '#f59e0b', '#94a3b8', '#ef4444']),
    [isLightTheme],
  );
  const ENVIRONMENT_BREAKDOWN_COLORS = isLightTheme
    ? ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#e11d48', '#4f46e5']
    : ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb7185', '#818cf8'];

  const envTypeChartData = useMemo(() => {
    const rows = envs.data ?? [];
    const map = new Map<string, number>();
    for (const row of rows) {
      const type = row.environment_type || row.type || 'Unknown';
      map.set(type, (map.get(type) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [envs.data]);

  const userActivityChartData = useMemo(() => [
    { name: 'Active 30d', value: userSummary.active30d, fill: userBarColors[0] },
    { name: 'Inactive 30d', value: userSummary.inactive30d, fill: userBarColors[1] },
    { name: 'Unknown', value: userSummary.unknownActivity, fill: userBarColors[2] },
    { name: 'Disabled', value: userSummary.disabled, fill: userBarColors[3] },
  ].filter((d) => d.value > 0), [userBarColors, userSummary]);

  const userEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(users.data, (row) => row.environment),
    [users.data],
  );
  const workflowEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(workflows.data, (row) => row.environment_id),
    [workflows.data],
  );
  const moduleEnvironmentChartData = useMemo(
    () => buildEnvironmentBreakdown(moduleStats.data, (row) => row.environment_id),
    [moduleStats.data],
  );
  const userEnvironmentLabel = useMemo(
    () => renderEnvironmentDonutLabel('users', chartTheme.text, chartTheme.halo),
    [chartTheme.halo, chartTheme.text],
  );
  const workflowEnvironmentLabel = useMemo(
    () => renderEnvironmentDonutLabel('workflows', chartTheme.text, chartTheme.halo),
    [chartTheme.halo, chartTheme.text],
  );
  const moduleEnvironmentLabel = useMemo(
    () => renderEnvironmentDonutLabel('solutions', chartTheme.text, chartTheme.halo),
    [chartTheme.halo, chartTheme.text],
  );

  return (
    <PageLayout title="Dynamics 365" exportId="dynamics-page">
      {authGaps.length > 0 && (
        <p className="error-text" style={{ marginBottom: 16 }}>
          Dynamics data access is blocked for one or more environments (Dataverse returned 401).
          Reconnect profile auth with Dataverse scope and ensure the signed-in identity has read permissions.
        </p>
      )}

      {dynamicsGaps.length > 0 && authGaps.length === 0 && (
        <p className="section-note" style={{ marginBottom: 16 }}>
          {dynamicsGaps.length} data gap{dynamicsGaps.length > 1 ? 's' : ''} detected. Some Dynamics data may be
          incomplete. Check the Data Pull page for the latest gap details.
        </p>
      )}

      <DynamicsCoverageSignalGrid signals={coverageSignals} />

      <DynamicsFootprintSection
        envCount={envCount}
        userCount={userCount}
        moduleCount={moduleCount}
        totalWorkflows={totalWorkflows}
        workflowTelemetryCount={workflowSummary.withTelemetry}
        bcCompanies={bcCompanies}
        environmentSummary={environmentSummary}
        bcSummary={bcSummary}
        footprintGuidance={footprintGuidance}
        practicalNotes={practicalNotes}
        manualContextLoading={manualContextLoading}
        manualContextSections={manualContextSections}
        manualContextPrompts={manualContextPrompts}
        manualContextError={manualContextError}
        onEditManualContext={openManualContextPanel}
        footprintTable={(
          <DataTable
            data={dynamicsFootprintRows}
            columns={footprintColumns}
            exportFileName="dynamics-footprint-by-environment"
          />
        )}
      />

      <DynamicsChartsSections
        envTypeChartData={envTypeChartData}
        userActivityChartData={userActivityChartData}
        userEnvironmentChartData={userEnvironmentChartData}
        workflowEnvironmentChartData={workflowEnvironmentChartData}
        moduleEnvironmentChartData={moduleEnvironmentChartData}
        chartTheme={chartTheme}
        envPieColors={ENV_PIE_COLORS}
        environmentBreakdownColors={ENVIRONMENT_BREAKDOWN_COLORS}
        userEnvironmentLabel={userEnvironmentLabel}
        workflowEnvironmentLabel={workflowEnvironmentLabel}
        moduleEnvironmentLabel={moduleEnvironmentLabel}
      />

      <DynamicsOperationalSummary
        envCount={envCount}
        environmentSummary={environmentSummary}
        workflowSummary={workflowSummary}
        userSummary={userSummary}
        moduleSummary={moduleSummary}
        bcSummary={bcSummary}
        formatPercentValue={formatPercentValue}
        formatMbToGb={formatMbToGb}
      />

      {/* ── Environments ─────────────────────────────────────────── */}
      <DynamicsTableSection
        title="Environments"
        hook={envs as ModuleState<D365Environment[]>}
        columns={envColumns}
        emptyMessage="No Dataverse/Power Platform environments were discovered. Ensure the signed-in identity has at least Basic User role in a Dataverse environment."
      />

      {/* ── Users & Roles ────────────────────────────────────────── */}
      <DynamicsTableSection
        title="Users & Roles"
        hook={users as ModuleState<D365User[]>}
        columns={userColumns}
        emptyMessage="No Dynamics users were returned. The signed-in identity may lack access to systemusers in the discovered environments."
      />

      {/* ── Modules & Solutions ──────────────────────────────────── */}
      <DynamicsTableSection
        title="Modules & Solutions"
        hook={moduleStats as ModuleState<D365ModuleStats[]>}
        columns={modColumns}
        emptyMessage="No module or solution data was returned from the discovered environments."
      />

      {/* ── Workflow Health ──────────────────────────────────────── */}
      <DynamicsTableSection
        title="Workflow Health"
        hook={workflows as ModuleState<D365WorkflowHealth[]>}
        columns={wfColumns}
        emptyMessage="No workflow records were returned from the discovered environments."
      />
      <p className="section-note" style={{ marginTop: -8, marginBottom: 20 }}>
        Workflow status now uses friendly labels where possible. Common meanings: <strong>Draft</strong> = not active,
        <strong> Activated</strong> = enabled, <strong>Suspended</strong> = paused or blocked.
      </p>

      {/* ── Business Central ─────────────────────────────────────── */}
      <DynamicsTableSection
        title="Business Central"
        hook={bcStats as ModuleState<D365BCStats[]>}
        columns={bcColumns}
        emptyMessage="No Business Central companies were returned. BC API token scope and user licence are required."
      />
      <DynamicsManualContextPanel
        open={manualContextPanelOpen}
        form={manualContextForm}
        saving={manualContextSaving}
        onClose={closeManualContextPanel}
        onSave={saveManualContext}
        onFieldChange={updateManualContextField}
      />
    </PageLayout>
  );
}
