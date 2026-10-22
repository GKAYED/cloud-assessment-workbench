import type { ReactNode } from 'react';
import { ChartCard } from '../shared/ChartCard';

interface ManualContextSection {
  label: string;
  value: string;
}

interface EnvironmentSummary {
  production: number;
  sandbox: number;
}

interface BusinessCentralSummary {
  customers: number;
  vendors: number;
  items: number;
}

interface DynamicsFootprintSectionProps {
  envCount: number;
  userCount: number;
  moduleCount: number;
  totalWorkflows: number;
  workflowTelemetryCount: number;
  bcCompanies: number;
  environmentSummary: EnvironmentSummary;
  bcSummary: BusinessCentralSummary;
  footprintGuidance: string[];
  practicalNotes: string[];
  manualContextLoading: boolean;
  manualContextSections: ManualContextSection[];
  manualContextPrompts: string[];
  manualContextError: string | null;
  onEditManualContext: () => void;
  footprintTable: ReactNode;
}

export function DynamicsFootprintSection({
  envCount,
  userCount,
  moduleCount,
  totalWorkflows,
  workflowTelemetryCount,
  bcCompanies,
  environmentSummary,
  bcSummary,
  footprintGuidance,
  practicalNotes,
  manualContextLoading,
  manualContextSections,
  manualContextPrompts,
  manualContextError,
  onEditManualContext,
  footprintTable,
}: DynamicsFootprintSectionProps) {
  return (
    <ChartCard
      title="Dynamics 365 footprint"
      subtitle="A consolidated view of discovered environments, platform scale, and what the current evidence suggests"
    >
      <p className="dynamics-footprint-intro">
        This section summarises the currently visible Dynamics 365 / Dataverse footprint using the environments, users, solutions,
        workflows, and other platform telemetry that were successfully returned during the latest snapshot.
      </p>
      <div className="dynamics-footprint-action-grid">
        <article className="dynamics-footprint-action-card dynamics-footprint-action-card--high">
          <div className="dynamics-footprint-action-head">
            <h4>Environment footprint</h4>
            <span className="dynamics-footprint-action-badge">PLATFORM</span>
          </div>
          <p className="dynamics-footprint-action-metric">
            {envCount} discovered environments, including {environmentSummary.production} production-like and {environmentSummary.sandbox} non-production.
          </p>
          <p>{userCount.toLocaleString()} returned users and {moduleCount.toLocaleString()} returned solutions show a material multi-environment platform footprint.</p>
          <p><strong>What this suggests:</strong> Environment lifecycle, naming, and ownership discipline matter more once the estate spreads across multiple returned environments.</p>
        </article>

        <article className="dynamics-footprint-action-card dynamics-footprint-action-card--medium">
          <div className="dynamics-footprint-action-head">
            <h4>Customization and automation footprint</h4>
            <span className="dynamics-footprint-action-badge">ASSESS</span>
          </div>
          <p className="dynamics-footprint-action-metric">
            {moduleCount.toLocaleString()} returned solutions and {totalWorkflows.toLocaleString()} returned workflows were visible from the current snapshot.
          </p>
          <p>{workflowTelemetryCount.toLocaleString()} workflows include success telemetry, while role visibility remains permission-limited in part of the estate.</p>
          <p><strong>What this suggests:</strong> ALM discipline, solution ownership, flow cleanup, and access governance are likely to be important operating concerns.</p>
        </article>

        <article className="dynamics-footprint-action-card dynamics-footprint-action-card--low">
          <div className="dynamics-footprint-action-head">
            <h4>Business platform scale</h4>
            <span className="dynamics-footprint-action-badge">SCOPE</span>
          </div>
          <p className="dynamics-footprint-action-metric">
            {bcCompanies.toLocaleString()} returned Business Central compan{bcCompanies === 1 ? 'y' : 'ies'} and {bcSummary.customers.toLocaleString()} customers were visible in the current telemetry.
          </p>
          <p>{bcSummary.vendors.toLocaleString()} vendors and {bcSummary.items.toLocaleString()} items reinforce that the platform footprint extends beyond CRM-style environment metadata alone.</p>
          <p><strong>What this suggests:</strong> The Dynamics estate should be treated as a broader business platform footprint with multiple operational concerns across environments, customization, automation, and supporting business data.</p>
        </article>
      </div>

      <div className="dashboard-grid" style={{ marginTop: 20, marginBottom: 20 }}>
        <ChartCard title="What the current footprint suggests" subtitle="Interpretation of scale, complexity, and operating implications">
          <ul className="dynamics-bullet-list">
            {footprintGuidance.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Immediate validation actions" subtitle="Practical follow-up based on missing or weak Dynamics signals">
          {practicalNotes.length > 0 ? (
            <ol className="dynamics-bullet-list dynamics-bullet-list--ordered">
              {practicalNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ol>
          ) : (
            <p className="cost-chart-note">Current telemetry is reasonably complete for high-level Dynamics assessment.</p>
          )}
        </ChartCard>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 20 }}>
        <ChartCard
          title="Manual context to add later"
          subtitle="Customer-supplied platform context that complements the discovered footprint"
          headerActions={(
            <button type="button" className="chart-copy-btn" onClick={onEditManualContext}>
              Edit
            </button>
          )}
        >
          {manualContextLoading ? (
            <p className="loading-text">Loading manual context…</p>
          ) : manualContextSections.length > 0 ? (
            <div className="dynamics-manual-context-list">
              {manualContextSections.map((section) => (
                <div key={section.label} className="dynamics-manual-context-item">
                  <span className="summary-label">{section.label}</span>
                  <p>{section.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <ul className="dynamics-bullet-list">
              {manualContextPrompts.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {manualContextError && <p className="error-text">{manualContextError}</p>}
        </ChartCard>
      </div>

      {footprintTable}
    </ChartCard>
  );
}
