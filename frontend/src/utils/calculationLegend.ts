import { routePaths } from '../config/navigation';

export interface CalculationLegendRow {
  metric: string;
  formula: string;
  note: string;
}

export interface CalculationLegendSection {
  page: string;
  route: string;
  summary: string;
  rows: CalculationLegendRow[];
}

export const calculationLegendSections: CalculationLegendSection[] = [
  {
    page: 'Executive Summary',
    route: '/',
    summary: 'Rolls up the main cross-module KPIs used in the opening briefing.',
    rows: [
      {
        metric: 'Monthly cloud spend',
        formula: 'Cost summary total_1m, falling back to total_cost_1m.',
        note: 'This is the current 1-month Azure cost baseline shown on the hero card.',
      },
      {
        metric: 'Annualized run rate',
        formula: 'Monthly cloud spend x 12.',
        note: 'Used as an executive planning estimate, not a forecast model.',
      },
      {
        metric: 'Spend driver share',
        formula: '(Driver amount / monthly spend baseline) x 100.',
        note: 'Applied to top subscription and top resource-type driver bars.',
      },
      {
        metric: 'Security posture',
        formula: 'Defender overall_percentage from security telemetry.',
        note: 'Displayed as the main secure-score-style percentage.',
      },
      {
        metric: 'Asset hygiene',
        formula: '(Untagged resources / total resources) x 100.',
        note: 'Uses Inventory summary untagged_percentage directly.',
      },
      {
        metric: 'License efficiency',
        formula: 'Estimated waste monthly from license summary; if unavailable, shows Not available.',
        note: 'Waste depends on Graph telemetry and pricing availability. It is not the same as utilization percent.',
      },
      {
        metric: 'Data reliability',
        formula: 'Count of collected data gaps, grouped by severity.',
        note: 'High/medium/low counts come from the data gaps module.',
      },
      {
        metric: 'Insights coverage',
        formula: 'Count of generated executive insights by severity.',
        note: 'This is a count of findings, not a percentage coverage score.',
      },
    ],
  },
  {
    page: 'Resource Inventory',
    route: '/inventory',
    summary: 'Counts the Azure estate returned by Resource Graph after portal-aligned filtering.',
    rows: [
      {
        metric: 'Total resources',
        formula: 'Count of resource rows returned from Azure Resource Graph.',
        note: 'Hidden/system resource types excluded by the portal alignment filter are not counted.',
      },
      {
        metric: 'Total subscriptions',
        formula: 'Count of enabled subscriptions returned from ARM subscription listing.',
        note: 'Shown as current in-scope estate, not necessarily every tenant subscription ever created.',
      },
      {
        metric: 'Total resource groups',
        formula: 'Count of distinct resource groups returned by Resource Graph.',
        note: 'Empty groups can still appear separately in RG endpoints even when no resources are listed in some charts.',
      },
      {
        metric: 'Untagged percentage',
        formula: '(untagged_count / total_resources) x 100.',
        note: 'Derived in inventory summary service and reused across Inventory, Executive Summary, and reporting.',
      },
      {
        metric: 'Resources by group/type/location',
        formula: 'Grouped count of resources per category.',
        note: 'These are frequency distributions, not weighted by spend or risk.',
      },
      {
        metric: 'Top databases by size',
        formula: 'Top 10 databases sorted by current_size_gb when available, otherwise max_size_gb.',
        note: 'The page explicitly tells you whether current measured size or provisioned max size is being used.',
      },
    ],
  },
  {
    page: 'Applications Discovery',
    route: '/applications-discovery',
    summary: 'Infers likely application purpose from resource-group composition and resource relationships.',
    rows: [
      {
        metric: 'Application confidence',
        formula: 'Rule-based confidence score from matched component roles, naming hints, and archetype fit.',
        note: 'This is an inference score, not Azure-native telemetry.',
      },
      {
        metric: 'Component count',
        formula: 'Number of resources classified into the same inferred role.',
        note: 'Used in the component map table.',
      },
      {
        metric: 'Share',
        formula: '(Role spend / total costed spend for the resource group) x 100.',
        note: 'Only costed resources contribute to spend-share calculations.',
      },
    ],
  },
  {
    page: 'Cost Analysis',
    route: '/costs',
    summary: 'Builds 1, 3, and 6 month cost views and concentration metrics from Azure Cost Management data.',
    rows: [
      {
        metric: 'Total 1 month / 3 months / 6 months',
        formula: 'Sum of Azure actual cost across enabled subscriptions for the previous 1, 3, or 6 full calendar months.',
        note: '1 month = previous full month. 3 months = previous 3 full months. 6 months = previous 6 full months. These totals come from cost summary windows, not from manually summing visible chart rows.',
      },
      {
        metric: 'Trend percent',
        formula: '((current month - previous month) / previous month) x 100.',
        note: 'Used for trend badges and cost momentum insights. The monthly trend chart can include the current in-progress month, while the summary 1/3/6 month totals use full prior calendar months only.',
      },
      {
        metric: 'Annual cloud run rate',
        formula: 'Total monthly spend x 12.',
        note: 'Used as an annualized baseline for budget discussion.',
      },
      {
        metric: 'Optimization value at 10%',
        formula: 'Total monthly spend x 10%, then annualized x 12.',
        note: 'A scenario estimate for savings targeting.',
      },
      {
        metric: 'Subscription/resource group/resource share',
        formula: '(entity cost / selected window baseline) x 100.',
        note: 'Applied to concentration insights and several charts.',
      },
      {
        metric: 'Share of 6 months',
        formula: '(resource group 6 month cost / total 6 month cost baseline) x 100.',
        note: 'Shown in the resource group spend table to compare long-run weight.',
      },
      {
        metric: 'Top resource concentration',
        formula: 'Sort resources by monthly cost, keep adding until cumulative cost reaches 75% of monthly spend, then group remainder as Other resources.',
        note: 'This is meant to show the minimum named set driving most of the bill.',
      },
      {
        metric: 'Volatility',
        formula: 'sqrt(variance of 6-month trend) / mean monthly spend.',
        note: 'Used to identify unstable spending patterns.',
      },
    ],
  },
  {
    page: 'Security & Health',
    route: '/security',
    summary: 'Combines Defender posture and Azure Advisor score/recommendation telemetry.',
    rows: [
      {
        metric: 'Defender overall percentage',
        formula: '(overall_current / overall_max) x 100.',
        note: 'This is the tenant-level secure score shown on the page and reused elsewhere.',
      },
      {
        metric: 'Control health percentage',
        formula: '(healthy_count / (healthy_count + unhealthy_count)) x 100.',
        note: 'Designed to be more intuitive than raw current/max scoring alone.',
      },
      {
        metric: 'Advisor pillar percentage',
        formula: 'Advisor aggregated percentage returned by service, normalized to percent scale.',
        note: 'This reflects Azure Advisor scoring by category/pillar.',
      },
      {
        metric: 'Posture totals',
        formula: 'Healthy + unhealthy counts rolled up across returned controls.',
        note: 'Used to summarize assessed versus unhealthy control volume.',
      },
    ],
  },
  {
    page: 'Dynamics 365',
    route: '/dynamics',
    summary: 'Summarizes discovered D365/Dataverse/Business Central environments, users, workflows, and linked Azure signals.',
    rows: [
      {
        metric: 'Enabled environment rate',
        formula: '(enabled environments / discovered environments) x 100.',
        note: 'Derived from normalized environment status values.',
      },
      {
        metric: 'Dataverse DB usage',
        formula: '(sum of database_capacity_used_mb / sum of database_capacity_allocated_mb) x 100.',
        note: 'Only calculated when capacity fields are actually returned by the API.',
      },
      {
        metric: 'Dataverse file usage',
        formula: '(sum of file_capacity_used_mb / sum of file_capacity_allocated_mb) x 100.',
        note: 'Same rule as DB usage: only shown when allocated capacity is present.',
      },
      {
        metric: 'Workflow success rate',
        formula: 'Average of workflow success_rate values returned by telemetry.',
        note: 'Only workflows with a numeric success rate are included in the average.',
      },
      {
        metric: 'Workflow attention rate',
        formula: '(workflows under 95% success rate / workflows with success telemetry) x 100.',
        note: 'Used to highlight automation reliability risk.',
      },
      {
        metric: 'Integration linkage',
        formula: 'Count of integrations whose metadata contains Dynamics/Dataverse/Business Central/CRM keywords.',
        note: 'This is keyword matched evidence, not a full Dynamics dependency graph.',
      },
      {
        metric: 'Azure spend linkage',
        formula: 'Count and sum of costed Azure resources whose names/types/IDs match Dynamics keywords.',
        note: 'Useful directional signal, but depends on naming quality in Azure resources.',
      },
    ],
  },
  {
    page: 'License Management',
    route: '/licenses',
    summary: 'Tracks assigned, unused, underutilized, and inactive-license signals from Microsoft Graph.',
    rows: [
      {
        metric: 'Overall utilization',
        formula: '(total_consumed / total_purchased) x 100.',
        note: 'Exposed as overall_utilization_pct in the normalized summary.',
      },
      {
        metric: 'Unused licenses',
        formula: 'total_purchased - total_consumed.',
        note: 'Straight seat-count gap, not a monetary waste estimate.',
      },
      {
        metric: 'SKU utilization',
        formula: '(assigned licenses for SKU / total purchased for SKU) x 100.',
        note: 'Shown per SKU in the table and bar chart.',
      },
      {
        metric: 'Estimated monthly waste',
        formula: 'Sum of estimated waste from inactive licensed users and/or underutilized SKU logic when pricing is available.',
        note: 'Can be unavailable because Graph does not provide pricing consistently.',
      },
    ],
  },
  {
    page: 'Application Portfolio',
    route: '/portfolio',
    summary: 'Uses TIME classification to place applications by business value and technical fitness.',
    rows: [
      {
        metric: 'TIME classification',
        formula: 'Invest if business_value >= 4 and technical_fitness >= 4; Migrate if business_value >= 4 and technical_fitness < 4; Tolerate if business_value < 4 and technical_fitness >= 4; otherwise Eliminate.',
        note: 'This is a consulting decision aid based on entered scores, not system telemetry.',
      },
    ],
  },
  {
    page: 'Strategic Initiatives',
    route: '/initiatives',
    summary: 'Scores initiatives for relative prioritization and displays them in table/roadmap form.',
    rows: [
      {
        metric: 'Prioritization score',
        formula: '(priority weight x strategic_fit) / complexity.',
        note: 'Priority weight is mapped from the chosen priority level in the backend service.',
      },
      {
        metric: 'Deprecation aligned',
        formula: 'Boolean flag from initiative metadata.',
        note: 'Displayed as a RAG indicator, not a numeric score.',
      },
    ],
  },
  {
    page: 'Governance',
    route: '/governance',
    summary: 'Combines Azure Policy, RBAC, orphaned-resource telemetry, and inventory tag coverage into posture and cleanup signals.',
    rows: [
      {
        metric: 'Tagged resource coverage',
        formula: '((total_resources - untagged_count) / total_resources) x 100 from Inventory summary.',
        note: 'This is the factual asset-tagging metric from Azure Resource Graph. It is separate from Azure Policy compliance and can diverge materially.',
      },
      {
        metric: 'Evaluated resources',
        formula: 'Per subscription, max(total_resources, compliant + non_compliant_resources), then summed.',
        note: 'This protects against inconsistent Policy Insights payloads.',
      },
      {
        metric: 'Compliance rate',
        formula: '(compliant resources / evaluated resources) x 100.',
        note: 'Always constrained by evaluated resources, so it should remain within 0-100%.',
      },
      {
        metric: 'Non-compliance rate',
        formula: '(non-compliant resources / evaluated resources) x 100.',
        note: 'This is a policy-enforcement metric, not a tagging metric. A high compliance rate does not prove high tag coverage unless tag policies exist and are evaluated.',
      },
      {
        metric: 'Owner ratio',
        formula: '(Owner role assignments / total role assignments) x 100.',
        note: 'Used to flag over-concentration of privileged RBAC assignments.',
      },
      {
        metric: 'Cost-sensitive orphan count',
        formula: 'unattached_disks + unused_public_ips + unused_nics + unused_nsgs.',
        note: 'A practical cleanup subset more likely to have direct cost impact.',
      },
    ],
  },
  {
    page: 'Framework Insights',
    route: '/framework-insights',
    summary: 'Maps available module data to Azure WAF and CAF using scoring rules in the framework engine.',
    rows: [
      {
        metric: 'WAF overall score',
        formula: 'Average of scored WAF pillar scores produced by the framework engine.',
        note: 'This is a rule-based assessment score derived from current telemetry. It is not an official Microsoft score or certification result.',
      },
      {
        metric: 'Pillar score',
        formula: 'Rule-based score per pillar from mapped telemetry inputs in the WAF/CAF engine.',
        note: 'These are assessment scores derived from available evidence, not Azure-native KPI feeds. Microsoft documentation is used as reference guidance for the mapping logic.',
      },
      {
        metric: 'Scored pillars count',
        formula: 'Number of WAF pillars with enough evidence to produce a score.',
        note: 'Helps explain whether the overall score is broad-based or only partially evidenced.',
      },
      {
        metric: 'CAF average maturity',
        formula: 'Average maturity across CAF methodologies, normalized on a 1-5 scale.',
        note: 'CAF maturity is a rule-based interpretation of gathered evidence aligned to CAF practices. It is not a direct Microsoft maturity output returned by Azure APIs.',
      },
      {
        metric: 'CAF tagging and governance signals',
        formula: 'Ready/Govern methodologies reuse inventory tag coverage, policy compliance, RBAC, and orphaned-resource signals where relevant.',
        note: 'Some figures intentionally recur across CAF methodologies because one factual metric can support more than one practice area. That is evidence reuse, not duplicate source data.',
      },
    ],
  },
  {
    page: 'Data Pull',
    route: routePaths.dataPull,
    summary: 'Shows the latest pull state together with the currently tracked data gaps for the active profile.',
    rows: [
      {
        metric: 'Gap count by severity/module',
        formula: 'Simple grouped count of data gap records.',
        note: 'This page is descriptive; it does not create its own posture score.',
      },
    ],
  },
];
