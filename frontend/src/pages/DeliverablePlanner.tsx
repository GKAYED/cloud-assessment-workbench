import { Link } from 'react-router-dom';
import { PageLayout } from '../components/layout/PageLayout';
import { deliverableSourceLinks } from '../config/navigation';
import './DeliverablePlanner.css';

type PlannerLink = {
  label: string;
  to: string;
};

type PlannerSection = {
  id: string;
  number: string;
  title: string;
  scopeAnchor: string;
  purpose: string;
  standaloneDocument: string[];
  complementaryReport: string[];
  supportingExports: string[];
  workingSources: PlannerLink[];
  readiness: string;
  remainingGaps: string[];
  exceedExpectation: string[];
};

const complementarySection: PlannerSection = {
  id: 'assessment-summary',
  number: '1',
  title: 'Complementary Assessment Summary',
  scopeAnchor:
    'This is the customer-facing companion piece that ties the separate deliverables together and explains the assessment scope, limitations, themes, and resulting actions.',
  purpose:
    'Provide the narrative layer that sits above the standalone deliverables, so the customer can read one concise summary document and then go deeper into the specialist packs only where needed.',
  standaloneDocument: [
    'Executive summary and assessment purpose',
    'Organisation context and operating context',
    'Assessment scope, method, and limitations',
    'List of standalone deliverables supplied with the assessment',
    'Snapshot timing, evidence coverage, and known data gaps',
    'Cross-cutting themes from interviews, transcripts, and analysis',
    'Common challenges and recurring operating-model patterns',
    'High-level recommendations, initiatives, and near-term actions',
  ],
  complementaryReport: [
    'This section is the overall report itself. It should not duplicate every table from every deliverable.',
    'Keep it high-level, readable, and selective.',
    'Use it to explain what the separate deliverables are, why they exist, and how they fit together.',
  ],
  supportingExports: [
    'PDF of the complementary assessment summary',
    'Optional workshop pack or slide export if needed later',
    'Link or stock-take of CSVs and spreadsheets supplied alongside the assessment',
  ],
  workingSources: deliverableSourceLinks.assessmentSummary,
  readiness: 'Substantially available now, but should be rewritten as a clean companion document rather than a copy of the legacy report format.',
  remainingGaps: [
    'Decide final tone and structure for the complementary summary document.',
    'Make the list of supplied deliverables and exported attachments explicit.',
    'Ensure the summary references each standalone pack without duplicating it.',
  ],
  exceedExpectation: [
    'Include a one-page delivery guide telling the customer how to use the deliverables together.',
    'Add a small attachment register showing every CSV, spreadsheet, and appendix supplied.',
  ],
};

const deliverableSections: PlannerSection[] = [
  {
    id: 'inventory',
    number: '2',
    title: 'Inventory Deliverable',
    scopeAnchor:
      'Azure subscription and resource catalogue with cost breakdown, plus enough estate structure to understand the current Azure footprint.',
    purpose:
      'Provide a clear current-state inventory of the Azure estate, including subscriptions, resource groups, resources, and databases, packaged in a way the customer can keep using.',
    standaloneDocument: [
      'Azure estate overview',
      'Key counts across subscriptions, resource groups, resources, and databases',
      'Structure summary and notable concentrations',
      'Database and warehouse note',
      'Short interpretation of what the estate structure implies operationally',
      'Key observations worth carrying into governance, cost, and security discussions',
    ],
    complementaryReport: [
      'High-level inventory interpretation only',
      'One short summary of estate scale, concentration, and tagging/ownership signals',
      'Reference the standalone Inventory pack for full catalogue detail',
    ],
    supportingExports: [
      'Subscriptions export',
      'Resource groups export',
      'Resources export',
      'Databases export',
    ],
    workingSources: deliverableSourceLinks.inventory,
    readiness: 'Ready to package. Main remaining work is document structure and export stock-take rather than missing core data.',
    remainingGaps: [
      'Define the final standalone Inventory document template.',
      'Make export links or manual export notes explicit in the planner.',
      'Decide whether any application-level inventory cross-reference should be attached.',
    ],
    exceedExpectation: [
      'Add a short estate interpretation page before the raw catalogue exports.',
      'Provide a clean export checklist so the customer receives the exact supporting CSV set.',
    ],
  },
  {
    id: 'cost',
    number: '3',
    title: 'Cost and Spend Deliverable',
    scopeAnchor:
      'Spend and usage insights based on available reporting, including cost allocation by subscription and the strongest cost drivers.',
    purpose:
      'Provide a standalone spend picture that explains current Azure run rate, cost concentration, and the main cost drivers in a way leadership and technical owners can both use.',
    standaloneDocument: [
      'Cost overview with average monthly spend, latest month spend, and six-month total',
      'Monthly trend and notable movements',
      'Cost by subscription, resource group, and resource type',
      'Leading cost drivers and where spend is concentrated',
      'Short interpretation of what the spend pattern suggests',
      'Immediate optimisation opportunities and checks',
    ],
    complementaryReport: [
      'Only the high-level spend story and major observations',
      'One clear paragraph on where the estate spends money and what that means',
      'Reference the standalone Cost pack for charts, schedules, and detailed breakdowns',
    ],
    supportingExports: [
      'Cost by subscription export',
      'Cost by resource group export',
      'Cost by resource type export',
      'Optional monthly trend export if useful for customer-side validation',
    ],
    workingSources: deliverableSourceLinks.cost,
    readiness: 'Ready to package as a standalone deliverable. Core data is already there; the main gap is packaging and interpretation layout.',
    remainingGaps: [
      'Decide final narrative structure for the standalone Cost document.',
      'Confirm which detailed schedules should be exported separately rather than embedded.',
      'Ensure cost-driver labels are consistently customer-friendly in every output.',
    ],
    exceedExpectation: [
      'Add a simple optimisation heatmap or priority list for the top cost actions.',
      'Supply the customer with a concise analyst note explaining what to watch next month.',
    ],
  },
  {
    id: 'dynamics',
    number: '4',
    title: 'Dynamics 365 Deliverable',
    scopeAnchor:
      'Dynamics 365 environment overview covering modules, users, workflow activity, costs, linked Azure signals, and integration context where available.',
    purpose:
      'Provide a clear current-state picture of the Dynamics landscape so the customer can understand footprint, complexity, usage, and dependencies without relying on fragmented notes.',
    standaloneDocument: [
      'Dynamics footprint overview',
      'Environment summary and usage indicators',
      'Modules, solutions, users, and roles',
      'Workflow activity and operational health signals',
      'Linked Azure cost and integration context',
      'Short interpretation of what the current footprint suggests',
      'Immediate validation actions and limitations note',
    ],
    complementaryReport: [
      'High-level Dynamics summary only',
      'One short paragraph on footprint, complexity, and confidence level',
      'Reference the standalone Dynamics pack for environment-level detail',
    ],
    supportingExports: [
      'Environments export',
      'Users and roles export',
      'Workflow summary export',
      'Optional linked Azure resource export if useful',
    ],
    workingSources: deliverableSourceLinks.dynamics,
    readiness: 'Strong foundation already exists. Remaining work is mainly packaging it into a customer-ready standalone document.',
    remainingGaps: [
      'Decide the final structure of the standalone Dynamics pack.',
      'Clarify which linked Azure/cost signals belong in the main document versus appendix.',
      'Confirm whether Business Central context should be a small note or separate subsection.',
    ],
    exceedExpectation: [
      'Use the deliverable to create a concise platform footprint summary for leadership.',
      'Provide a validation appendix showing where the analysis is inferred versus directly evidenced.',
    ],
  },
  {
    id: 'integration',
    number: '5',
    title: 'Integration Deliverable',
    scopeAnchor:
      'Integration map with consolidation opportunities if applicable, provided in an accessible format the customer can keep maintaining.',
    purpose:
      'Turn the current discovered integration evidence into a trustworthy, maintainable integration baseline supported by both a summary document and a working register.',
    standaloneDocument: [
      'Purpose and limitations of the integration baseline',
      'What was found and how the current map was built',
      'Landscape interpretation',
      'Key integration patterns and external-party links',
      'Validation gaps, confidence, and what still needs confirmation',
      'Recommendations and consolidation opportunities',
    ],
    complementaryReport: [
      'Only the summary-level integration story',
      'One high-level paragraph on landscape shape, trust level, and major dependencies',
      'Reference the standalone Integration document and register for working detail',
    ],
    supportingExports: [
      'Integration Register spreadsheet / CSV',
      'Optional filtered workshop version for production subscriptions',
      'Manual annotation round-trip file for customer review',
    ],
    workingSources: deliverableSourceLinks.integration,
    readiness: 'Strong working baseline now exists. Summary packaging still needs to be shaped into the final customer deliverable.',
    remainingGaps: [
      'Standalone Integration Summary layout still needs final packaging work.',
      'Some rows still need customer validation and business context.',
      'Decide how the delivered register and summary should reference each other cleanly.',
    ],
    exceedExpectation: [
      'Provide a short workshop guide telling the customer how to keep the register current.',
      'Add a compact app-to-app landscape summary ahead of the detailed register export.',
    ],
  },
  {
    id: 'security',
    number: '6',
    title: 'Security Posture Deliverable',
    scopeAnchor:
      'High-level security posture based on available reporting, using the evidence available from Defender, Advisor, and related assessment data.',
    purpose:
      'Provide a standalone security posture view that is explicit about what was assessed, what was not collected, and where immediate attention is most warranted.',
    standaloneDocument: [
      'Security posture summary and limitations',
      'Defender secure score and supporting signals',
      'Advisor security recommendations and high-impact themes',
      'Healthy vs unhealthy resource view where available',
      'Short interpretation of what the current posture implies',
      'Priority remediation themes and actions',
    ],
    complementaryReport: [
      'A concise security posture summary',
      'High-level note on score, posture direction, and the most important risk themes',
      'Reference the standalone Security pack for deeper operational detail',
    ],
    supportingExports: [
      'Advisor recommendations export',
      'Defender scores / controls export',
      'Any security evidence schedules worth sharing outside the document',
    ],
    workingSources: deliverableSourceLinks.security,
    readiness: 'Good foundation for a standalone posture pack. Main gap is packaging and clarity around what is tooling-limited versus customer-fixable.',
    remainingGaps: [
      'Decide final standalone structure and level of detail.',
      'Be explicit about low-severity tooling gaps versus access gaps.',
      'Choose which detailed security schedules are appendix-only.',
    ],
    exceedExpectation: [
      'Add a one-page “what this means now” security interpretation page.',
      'Provide an action-priority shortlist rather than only raw score and finding data.',
    ],
  },
  {
    id: 'governance',
    number: '7',
    title: 'Governance Deliverable',
    scopeAnchor:
      'Configuration and governance insights based on available reporting, including policy, access, and operational hygiene signals.',
    purpose:
      'Provide a concise standalone governance view showing how controlled, consistent, and maintainable the current Azure estate appears from policy, access, and hygiene evidence.',
    standaloneDocument: [
      'Governance overview and interpretation',
      'Policy compliance picture and major exceptions',
      'RBAC / role assignment summary',
      'Operational hygiene findings such as orphaned resources',
      'Governance action priorities and likely next steps',
      'Short plain-English explanation of what the findings mean operationally',
    ],
    complementaryReport: [
      'One governance summary paragraph only',
      'Call out policy posture, access concentration, and hygiene risks at a high level',
      'Reference the standalone Governance pack for detail and follow-up evidence',
    ],
    supportingExports: [
      'Policy compliance export',
      'Role assignment or RBAC schedules where appropriate',
      'Orphaned resource export',
    ],
    workingSources: deliverableSourceLinks.governance,
    readiness: 'Substantially ready. Main work left is shaping the standalone pack and deciding which operational schedules go out separately.',
    remainingGaps: [
      'Finalize the standalone Governance document structure.',
      'Decide appendix/export treatment for access and orphan-resource detail.',
      'Keep the narrative action-oriented rather than overly operational.',
    ],
    exceedExpectation: [
      'Provide a short governance action pack with “do now / next / later” framing.',
      'Attach a compact hygiene schedule the customer can use as a cleanup tracker.',
    ],
  },
  {
    id: 'applications',
    number: '8',
    title: 'Applications and Portfolio Deliverable',
    scopeAnchor:
      'Azure-hosted application inventory and ownership map, plus a future-state portfolio view with prioritisation framework.',
    purpose:
      'Combine discovered applications, portfolio information, future-state posture, and prioritisation signals into one standalone application landscape deliverable.',
    standaloneDocument: [
      'Application landscape overview',
      'Discovered application patterns and what they suggest',
      'Portfolio summary with current and future-state context',
      'Strategic fit, ownership, and prioritisation signals',
      'Application-level observations that influence roadmap decisions',
      'Short interpretation of what the portfolio suggests about direction and capability readiness',
    ],
    complementaryReport: [
      'A concise portfolio and application summary',
      'One paragraph on discovered landscape, future-state readiness, and prioritisation themes',
      'Reference the standalone Applications and Portfolio pack for detailed working views',
    ],
    supportingExports: [
      'Applications Discovery export',
      'App Portfolio export',
      'Optional prioritisation / future-state spreadsheet if useful for customer workshop use',
    ],
    workingSources: deliverableSourceLinks.portfolio,
    readiness: 'Strong enough to package, but this is the deliverable that benefits most from careful storytelling and simplification.',
    remainingGaps: [
      'Decide the final blend between discovered application evidence and manually curated portfolio data.',
      'Keep the standalone document clear and not overly dense.',
      'Choose whether prioritisation detail lives in the main document or supporting export.',
    ],
    exceedExpectation: [
      'Create a clean landscape-first section before the detailed portfolio schedules.',
      'Use challenge and initiative themes to show why the portfolio priorities matter.',
    ],
  },
];

function PlannerList({ items }: { items: string[] }) {
  return (
    <ul className="deliverable-planner__list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function PlannerLinks({ items }: { items: PlannerLink[] }) {
  return (
    <div className="deliverable-planner__links">
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="deliverable-planner__link">
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function PlannerSectionCard({ section }: { section: PlannerSection }) {
  return (
    <section className="deliverable-planner__section" id={section.id}>
      <div className="deliverable-planner__section-head">
        <div className="deliverable-planner__section-number">{section.number}</div>
        <div>
          <h3>{section.title}</h3>
          <p className="deliverable-planner__scope">{section.scopeAnchor}</p>
        </div>
      </div>

      <div className="deliverable-planner__overview">
        <div className="deliverable-planner__overview-card">
          <span className="deliverable-planner__eyebrow">Purpose</span>
          <p>{section.purpose}</p>
        </div>
        <div className="deliverable-planner__overview-card">
          <span className="deliverable-planner__eyebrow">Current readiness</span>
          <p>{section.readiness}</p>
        </div>
      </div>

      <div className="deliverable-planner__grid">
        <article className="deliverable-planner__card">
          <h4>Standalone document should include</h4>
          <PlannerList items={section.standaloneDocument} />
        </article>

        <article className="deliverable-planner__card">
          <h4>Complementary report should include</h4>
          <PlannerList items={section.complementaryReport} />
        </article>

        <article className="deliverable-planner__card">
          <h4>Supporting exports and data packs</h4>
          <PlannerList items={section.supportingExports} />
        </article>

        <article className="deliverable-planner__card">
          <h4>Working source pages</h4>
          <PlannerLinks items={section.workingSources} />
        </article>

        <article className="deliverable-planner__card deliverable-planner__card--warning">
          <h4>Remaining gaps to close</h4>
          <PlannerList items={section.remainingGaps} />
        </article>

        <article className="deliverable-planner__card deliverable-planner__card--success">
          <h4>How to exceed expectation</h4>
          <PlannerList items={section.exceedExpectation} />
        </article>
      </div>
    </section>
  );
}

export default function DeliverablePlanner() {
  return (
    <PageLayout
      title="Deliverable Planner"
      subtitle="Working blueprint for the complementary assessment summary and the seven standalone customer deliverables."
      exportId="deliverable-planner-page"
    >
      <section className="deliverable-planner__hero">
        <div className="deliverable-planner__hero-copy">
          <p className="deliverable-planner__kicker">Delivery blueprint</p>
          <h3>One companion assessment summary, plus seven standalone deliverables the customer can use separately.</h3>
          <p>
            This page is designed as the working packaging plan for customer delivery. Each section explains what belongs in the standalone
            document, what stays in the complementary overall assessment, what supporting exports should go out with it, and what still needs
            to be closed before delivery is finalised.
          </p>
        </div>
        <div className="deliverable-planner__hero-panel">
          <span className="deliverable-planner__eyebrow">How to use this page</span>
          <ul className="deliverable-planner__hero-list">
            <li>Use Section 1 as the overall companion report structure.</li>
            <li>Use Sections 2 to 8 as the standalone deliverable blueprints.</li>
            <li>Copy sections into customer document templates as needed.</li>
            <li>Track manual exports and remaining packaging gaps before issue.</li>
          </ul>
        </div>
      </section>

      <section className="deliverable-planner__summary">
        <article className="deliverable-planner__summary-card">
          <span className="deliverable-planner__eyebrow">Overall package</span>
          <strong>1 companion summary + 7 standalone deliverables</strong>
          <p>Structured to match scope, customer expectation, and ease of reuse.</p>
        </article>
        <article className="deliverable-planner__summary-card">
          <span className="deliverable-planner__eyebrow">Core principle</span>
          <strong>Summary first. Working detail second.</strong>
          <p>Each deliverable should stand alone, while the companion summary ties them together.</p>
        </article>
        <article className="deliverable-planner__summary-card">
          <span className="deliverable-planner__eyebrow">Practical aim</span>
          <strong>Package what exists now. Close the presentation gaps.</strong>
          <p>The main task is structuring and presenting the evidence in the shape the customer expects.</p>
        </article>
      </section>

      <PlannerSectionCard section={complementarySection} />
      {deliverableSections.map((section) => (
        <PlannerSectionCard key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
