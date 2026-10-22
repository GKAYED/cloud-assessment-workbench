import type { ReactNode } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChartCard } from '../shared/ChartCard';

interface SimpleChartTheme {
  text: string;
  muted: string;
  grid: string;
  halo: string;
}

interface NamedValue {
  name: string;
  value: number;
}

interface ActivityValue extends NamedValue {
  fill: string;
}

interface EnvironmentBreakdownValue extends NamedValue {
  pct: number;
}

interface EnvironmentSummary {
  enabledRate: number | null;
  enabled: number;
  production: number;
  sandbox: number;
  dbUsagePct: number | null;
  dbUsed: number;
  dbAllocated: number;
  fileUsagePct: number | null;
  fileUsed: number;
  fileAllocated: number;
}

interface WorkflowSummary {
  withTelemetry: number;
  avgSuccessRate: number | null;
  attentionRate: number | null;
  attentionCount: number;
}

interface UserSummary {
  inactive30d: number;
  unknownActivity: number;
  disabled: number;
  topRoles: Array<{ name: string; count: number }>;
}

interface BusinessCentralSummary {
  customers: number;
  vendors: number;
  items: number;
  glEntries: number;
}

interface PieLabelRendererProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  percent?: number;
  value?: number | string;
  name?: string;
  index?: number;
  x?: number;
  y?: number;
  payload?: unknown;
}

type PieLabelRenderer = (props: PieLabelRendererProps) => ReactNode;

interface DynamicsChartsSectionsProps {
  envTypeChartData: NamedValue[];
  userActivityChartData: ActivityValue[];
  userEnvironmentChartData: EnvironmentBreakdownValue[];
  workflowEnvironmentChartData: EnvironmentBreakdownValue[];
  moduleEnvironmentChartData: EnvironmentBreakdownValue[];
  chartTheme: SimpleChartTheme;
  envPieColors: string[];
  environmentBreakdownColors: string[];
  userEnvironmentLabel: PieLabelRenderer;
  workflowEnvironmentLabel: PieLabelRenderer;
  moduleEnvironmentLabel: PieLabelRenderer;
}

export function DynamicsChartsSections({
  envTypeChartData,
  userActivityChartData,
  userEnvironmentChartData,
  workflowEnvironmentChartData,
  moduleEnvironmentChartData,
  chartTheme,
  envPieColors,
  environmentBreakdownColors,
  userEnvironmentLabel,
  workflowEnvironmentLabel,
  moduleEnvironmentLabel,
}: DynamicsChartsSectionsProps) {
  return (
    <>
      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        {envTypeChartData.length > 0 && (
          <ChartCard title="Environment type distribution" subtitle="Breakdown of discovered D365/Power Platform environments by type">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={envTypeChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="54%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  labelLine={{ stroke: chartTheme.grid, strokeWidth: 1.2 }}
                  label={({ name, value, x, y, textAnchor }: { name?: string; value?: number; x?: number; y?: number; textAnchor?: 'end' | 'inherit' | 'start' | 'middle' }) => {
                    if (!name || !value || x == null || y == null) return '';
                    return (
                      <text
                        x={x}
                        y={y}
                        fill={chartTheme.text}
                        stroke={chartTheme.halo}
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={12}
                        fontWeight={600}
                        textAnchor={(textAnchor ?? 'middle') as 'end' | 'inherit' | 'start' | 'middle'}
                        dominantBaseline="central"
                      >
                        {`${name} (${value})`}
                      </text>
                    );
                  }}
                >
                  {envTypeChartData.map((_, i) => (
                    <Cell key={i} fill={envPieColors[i % envPieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderColor: chartTheme.grid }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {userActivityChartData.length > 0 && (
          <ChartCard title="User activity breakdown" subtitle="30-day login activity status across discovered Dynamics users">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={userActivityChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: chartTheme.muted, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartTheme.text, fontSize: 12, fontWeight: 600 }} />
                <Tooltip contentStyle={{ borderColor: chartTheme.grid }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {userActivityChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        {userEnvironmentChartData.length > 0 && (
          <ChartCard title="Users by environment" subtitle="Share of discovered Dynamics users in each environment">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={userEnvironmentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="54%"
                  innerRadius={72}
                  outerRadius={122}
                  paddingAngle={2}
                  labelLine={{ stroke: chartTheme.grid, strokeWidth: 1.2 }}
                  label={userEnvironmentLabel}
                >
                  {userEnvironmentChartData.map((_, i) => (
                    <Cell key={i} fill={environmentBreakdownColors[i % environmentBreakdownColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, _name, item) => [`${String(value ?? 0)} (${item.payload?.pct ?? 0}%)`, 'Users']} contentStyle={{ borderColor: chartTheme.grid }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {workflowEnvironmentChartData.length > 0 && (
          <ChartCard title="Workflows by environment" subtitle="Share of discovered workflows in each environment">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={workflowEnvironmentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="54%"
                  innerRadius={72}
                  outerRadius={122}
                  paddingAngle={2}
                  labelLine={{ stroke: chartTheme.grid, strokeWidth: 1.2 }}
                  label={workflowEnvironmentLabel}
                >
                  {workflowEnvironmentChartData.map((_, i) => (
                    <Cell key={i} fill={environmentBreakdownColors[i % environmentBreakdownColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, _name, item) => [`${String(value ?? 0)} (${item.payload?.pct ?? 0}%)`, 'Workflows']} contentStyle={{ borderColor: chartTheme.grid }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {moduleEnvironmentChartData.length > 0 && (
          <ChartCard title="Solutions by environment" subtitle="Share of discovered solutions and modules in each environment">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={moduleEnvironmentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="54%"
                  innerRadius={72}
                  outerRadius={122}
                  paddingAngle={2}
                  labelLine={{ stroke: chartTheme.grid, strokeWidth: 1.2 }}
                  label={moduleEnvironmentLabel}
                >
                  {moduleEnvironmentChartData.map((_, i) => (
                    <Cell key={i} fill={environmentBreakdownColors[i % environmentBreakdownColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, _name, item) => [`${String(value ?? 0)} (${item.payload?.pct ?? 0}%)`, 'Solutions']} contentStyle={{ borderColor: chartTheme.grid }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
      <p className="section-note" style={{ marginTop: -8, marginBottom: 20 }}>
        These environment breakdown charts show only environments that returned rows in the relevant dataset, not all discovered environments.
      </p>
    </>
  );
}

interface DynamicsOperationalSummaryProps {
  envCount: number;
  environmentSummary: EnvironmentSummary;
  workflowSummary: WorkflowSummary;
  userSummary: UserSummary;
  moduleSummary: Array<{ name: string; count: number }>;
  bcSummary: BusinessCentralSummary;
  formatPercentValue: (value: number | null | undefined) => string;
  formatMbToGb: (value: number | null | undefined) => string;
}

export function DynamicsOperationalSummary({
  envCount,
  environmentSummary,
  workflowSummary,
  userSummary,
  moduleSummary,
  bcSummary,
  formatPercentValue,
  formatMbToGb,
}: DynamicsOperationalSummaryProps) {
  return (
    <>
      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        <ChartCard title="Environment posture" subtitle="What is currently known about environment shape and capacity">
          <div className="dynamics-metric-grid">
            <div className="dynamics-metric">
              <span className="summary-label">Enabled environments</span>
              <span className="big-number">{formatPercentValue(environmentSummary.enabledRate)}</span>
              <span className="summary-note">{environmentSummary.enabled} of {envCount || 0} discovered</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Production vs non-prod</span>
              <span className="big-number">{environmentSummary.production}/{environmentSummary.sandbox}</span>
              <span className="summary-note">Production / sandbox-trial-test environments</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">DB capacity usage</span>
              <span className="big-number">{formatPercentValue(environmentSummary.dbUsagePct)}</span>
              <span className="summary-note">
                {formatMbToGb(environmentSummary.dbUsed)} used of {formatMbToGb(environmentSummary.dbAllocated)}
              </span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">File capacity usage</span>
              <span className="big-number">{formatPercentValue(environmentSummary.fileUsagePct)}</span>
              <span className="summary-note">
                {formatMbToGb(environmentSummary.fileUsed)} used of {formatMbToGb(environmentSummary.fileAllocated)}
              </span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Operational signals" subtitle="User activity and automation reliability from available Dynamics telemetry">
          <div className="dynamics-metric-grid">
            <div className="dynamics-metric">
              <span className="summary-label">Workflow success average</span>
              <span className="big-number">{formatPercentValue(workflowSummary.avgSuccessRate)}</span>
              <span className="summary-note">{workflowSummary.withTelemetry} workflow(s) with success telemetry</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Workflow attention rate</span>
              <span className="big-number">{formatPercentValue(workflowSummary.attentionRate)}</span>
              <span className="summary-note">{workflowSummary.attentionCount} workflows below 95% success</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Inactive users</span>
              <span className="big-number">{userSummary.inactive30d}</span>
              <span className="summary-note">{userSummary.unknownActivity} with unknown recent activity</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Disabled users</span>
              <span className="big-number">{userSummary.disabled}</span>
              <span className="summary-note">Review for stale access and license reclaim</span>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 24 }}>
        <ChartCard title="Top role concentration" subtitle="Most common security roles returned for Dynamics users">
          {userSummary.topRoles.length > 0 ? (
            <div className="exec-driver-list">
              {userSummary.topRoles.map((role) => (
                <div key={role.name} className="exec-driver-row">
                  <div className="exec-driver-meta">
                    <span className="exec-driver-name">{role.name}</span>
                    <span className="exec-driver-value">{role.count} users</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="cost-chart-note">No role distribution could be derived from returned user telemetry.</p>
          )}
        </ChartCard>

        <ChartCard title="Solution concentration by environment" subtitle="Shows where returned Dynamics customization evidence is concentrated">
          {moduleSummary.length > 0 ? (
            <div className="exec-driver-list">
              {moduleSummary.map((row) => (
                <div key={row.name} className="exec-driver-row">
                  <div className="exec-driver-meta">
                    <span className="exec-driver-name">{row.name}</span>
                    <span className="exec-driver-value">{row.count} solutions</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="cost-chart-note">No solution distribution is available yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Business Central scale" subtitle="Aggregate counts across returned BC company telemetry">
          <div className="dynamics-metric-grid">
            <div className="dynamics-metric">
              <span className="summary-label">Customers</span>
              <span className="big-number">{bcSummary.customers.toLocaleString()}</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Vendors</span>
              <span className="big-number">{bcSummary.vendors.toLocaleString()}</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">Items</span>
              <span className="big-number">{bcSummary.items.toLocaleString()}</span>
            </div>
            <div className="dynamics-metric">
              <span className="summary-label">GL entries</span>
              <span className="big-number">{bcSummary.glEntries.toLocaleString()}</span>
            </div>
          </div>
        </ChartCard>
      </div>
    </>
  );
}
