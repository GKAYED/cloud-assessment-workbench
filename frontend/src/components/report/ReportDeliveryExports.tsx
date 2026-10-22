import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { costsApi } from '../../api/costs';
import { securityApi } from '../../api/security';
import { inventoryApi } from '../../api/inventory';
import { integrationsApi } from '../../api/integrations';
import { dynamicsApi } from '../../api/dynamics';
import { licensesApi } from '../../api/licenses';
import { portfolioApi } from '../../api/portfolio';
import { challengesApi } from '../../api/challenges';
import { initiativesApi } from '../../api/initiatives';
import { recommendationsApi } from '../../api/recommendations';
import { stakeholdersApi } from '../../api/stakeholders';
import { frameworkApi } from '../../api/framework';
import { governanceApi } from '../../api/governance';
import { useModuleData } from '../../hooks/useModuleData';
import { useProfile } from '../../hooks/useProfile';
import { MODULE_CACHE_KEYS } from '../../cache/moduleKeys';
import { downloadCsvBundle, type CsvRow } from '../../utils/csv';
import { formatCurrency, formatDate, formatPercent, titleCase } from '../../utils/formatters';
import {
  buildCostExportRows,
  buildSubscriptionNameMap,
} from '../../reporting/costShaping';
import {
  advisorResourceDisplay,
  looksLikeId,
  nameFromResourceId,
  readablePillar,
  replaceSubscriptionIdsInText,
  resolveSubscriptionName,
  shortType,
} from '../../reporting/reportShaping';

function DeliveryExportGroup({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: Array<{ label: string; fileName: string; rows: CsvRow[] }>;
}) {
  const available = actions.filter((item) => item.rows.length > 0);
  if (!available.length) return null;
  return (
    <div className="report-delivery-card">
      <div className="report-delivery-card__header">
        <div>
          <h3 className="report-delivery-card__title">{title}</h3>
          <p className="report-delivery-card__desc">{description}</p>
        </div>
        <button type="button" className="report-delivery-btn" onClick={() => downloadCsvBundle(available)}>
          <Download size={14} />
          Export all
        </button>
      </div>
      <div className="report-delivery-card__actions">
        {available.map((item) => (
          <button key={item.fileName} type="button" className="report-delivery-btn" onClick={() => downloadCsvBundle([item])}>
            <Download size={14} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReportDeliveryExports() {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;

  const subscriptions = useModuleData(() => inventoryApi.subscriptions(), [], { cacheKey: MODULE_CACHE_KEYS.inventorySubscriptions });
  const invSummary = useModuleData(() => inventoryApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.inventorySummary });
  const resources = useModuleData(() => inventoryApi.resources(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryResources });
  const resourceGroups = useModuleData(() => inventoryApi.resourceGroups(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryResourceGroups });
  const databases = useModuleData(() => inventoryApi.databases(), [], { cacheKey: MODULE_CACHE_KEYS.inventoryDatabases });
  const costSummary = useModuleData(() => costsApi.summary(), [], { cacheKey: MODULE_CACHE_KEYS.costSummary });
  const costBySub = useModuleData(() => costsApi.bySubscription(), [], { cacheKey: MODULE_CACHE_KEYS.costBySubscription });
  const costByRG = useModuleData(() => costsApi.byResourceGroup(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceGroup });
  const costByType = useModuleData(() => costsApi.byResourceType(), [], { cacheKey: MODULE_CACHE_KEYS.costByResourceType });
  const costByResource = useModuleData(() => costsApi.byResource(), [], { cacheKey: MODULE_CACHE_KEYS.costByResource });
  const defender = useModuleData(() => securityApi.defenderScores(), [], { cacheKey: MODULE_CACHE_KEYS.securityDefenderScores });
  const advisorScores = useModuleData(() => securityApi.advisorScores(), [], { cacheKey: MODULE_CACHE_KEYS.securityAdvisorScores });
  const advisorRecs = useModuleData(() => securityApi.advisorRecommendations(), [], { cacheKey: MODULE_CACHE_KEYS.securityAdvisorRecommendations });
  const govPolicy = useModuleData(() => governanceApi.policyCompliance(), [], { cacheKey: MODULE_CACHE_KEYS.governancePolicyCompliance });
  const govRbac = useModuleData(() => governanceApi.roleAssignments(), [], { cacheKey: MODULE_CACHE_KEYS.governanceRoleAssignments });
  const govOrphans = useModuleData(() => governanceApi.orphanedResources(), [], { cacheKey: MODULE_CACHE_KEYS.governanceOrphanedResources });
  const intList = useModuleData(() => integrationsApi.list(), [], { cacheKey: MODULE_CACHE_KEYS.integrationsList });
  const d365Envs = useModuleData(() => dynamicsApi.environments(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsEnvironments });
  const d365Users = useModuleData(() => dynamicsApi.users(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsUsers });
  const d365Modules = useModuleData(() => dynamicsApi.moduleStats(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsModuleStats });
  const d365Workflows = useModuleData(() => dynamicsApi.workflowHealth(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsWorkflowHealth });
  const d365BC = useModuleData(() => dynamicsApi.bcStats(), [], { cacheKey: MODULE_CACHE_KEYS.dynamicsBcStats });
  const licSkus = useModuleData(() => licensesApi.skus(), [], { cacheKey: MODULE_CACHE_KEYS.licensesSkus });
  const licUsers = useModuleData(() => licensesApi.users(), [], { cacheKey: MODULE_CACHE_KEYS.licensesUsers });
  const portfolio = useModuleData(() => profileId ? portfolioApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: 'portfolio.list' });
  const challenges = useModuleData(() => profileId ? challengesApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: MODULE_CACHE_KEYS.challengesList });
  const recommendations = useModuleData(() => profileId ? recommendationsApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: MODULE_CACHE_KEYS.recommendationsList });
  const initiatives = useModuleData(() => profileId ? initiativesApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: 'initiatives.list' });
  const stakeholders = useModuleData(() => profileId ? stakeholdersApi.list(profileId) : Promise.resolve([]), [profileId], { cacheKey: 'stakeholders.list' });
  const framework = useModuleData(() => frameworkApi.insights(), [], { cacheKey: MODULE_CACHE_KEYS.frameworkInsights });

  const subNameMap = useMemo(() => buildSubscriptionNameMap(subscriptions.data ?? []), [subscriptions.data]);

  const resourcesByType = useMemo(
    () => Object.entries(invSummary.data?.resources_by_type ?? {}).sort((a, b) => b[1] - a[1]),
    [invSummary.data?.resources_by_type],
  );

  const dynamicsIntegrationRows = useMemo(
    () => (intList.data ?? []).filter((item) => {
      const hay = `${item.name ?? ''} ${item.source_system ?? ''} ${item.source_resource_name ?? ''} ${item.target_system ?? ''} ${item.target_name ?? ''}`.toLowerCase();
      return hay.includes('dynamics') || hay.includes('dataverse') || hay.includes('crm');
    }),
    [intList.data],
  );

  const dynamicsCostRows = useMemo(
    () => (costByResource.data ?? []).filter((item) => {
      const hay = `${item.resource_name ?? ''} ${item.resource_type ?? ''} ${item.resource_group ?? ''}`.toLowerCase();
      return hay.includes('dynamics') || hay.includes('dataverse') || hay.includes('crm');
    }),
    [costByResource.data],
  );

  const costExportRows = useMemo(
    () => buildCostExportRows({
      costBySubscription: costBySub.data ?? [],
      costByResourceGroup: costByRG.data ?? [],
      costByResourceType: costByType.data ?? [],
      costByResource: costByResource.data ?? [],
      resources: resources.data ?? [],
      subscriptionNames: subNameMap,
      resourceGroups: resourceGroups.data ?? [],
      subscriptions: subscriptions.data ?? [],
    }),
    [
      costByRG.data,
      costByResource.data,
      costBySub.data,
      costByType.data,
      resourceGroups.data,
      resources.data,
      subNameMap,
      subscriptions.data,
    ],
  );

  const filePrefix = useMemo(() => `${activeProfile?.customer_name ?? 'assessment'}-assessment`, [activeProfile?.customer_name]);

  const actionCsvExports = useMemo(() => [
    {
      label: 'Recommendations',
      fileName: `${filePrefix}-strategic-recommendations`,
      rows: (recommendations.data ?? []).map((item) => ({
        ID: item.recommendation_id ?? '',
        Recommendation: item.title,
        Priority: item.priority,
        Type: item.recommendation_type ?? '',
        Category: item.category ?? '',
        'Primary Outcome': item.primary_outcome ?? '',
        'Evidence Sources': item.evidence_sources?.join('; ') ?? '',
        Validation: item.validation_status ?? '',
      })),
    },
    {
      label: 'Challenges',
      fileName: `${filePrefix}-cross-organisation-challenges`,
      rows: (challenges.data ?? []).map((item) => ({
        ID: item.challenge_id ?? '',
        Challenge: item.title,
        Impact: item.impact_level,
        Category: item.category ?? '',
        'Primary Effect': item.primary_effect ?? '',
        'Evidence Sources': item.evidence_sources?.join('; ') ?? '',
      })),
    },
    {
      label: 'Initiatives',
      fileName: `${filePrefix}-strategic-initiatives`,
      rows: (initiatives.data ?? []).map((item) => ({
        Initiative: item.name,
        Description: item.description ?? '',
        Priority: item.priority,
        Status: item.status,
        Category: item.category ?? '',
        'Target Quarter': item.target_quarter ?? '',
        'Effort (weeks)': item.estimated_effort_weeks ?? '',
      })),
    },
    {
      label: 'Advisor recommendations',
      fileName: `${filePrefix}-azure-advisor-recommendations`,
      rows: (advisorRecs.data ?? []).map((item) => {
        const resource = advisorResourceDisplay(item, subNameMap);
        return {
          Impact: item.impact,
          Category: readablePillar(item.category),
          Resource: resource.name,
          Subscription: resource.subscription,
          Description: replaceSubscriptionIdsInText(item.description, subNameMap),
          Remediation: replaceSubscriptionIdsInText(item.remediation, subNameMap),
        };
      }),
    },
    {
      label: 'Policy compliance',
      fileName: `${filePrefix}-governance-policy-compliance`,
      rows: (govPolicy.data?.by_subscription ?? []).map((item) => ({
        Subscription: resolveSubscriptionName(item.subscription_name, item.subscription_id, subNameMap),
        'Total Resources': item.total_resources,
        Compliant: item.compliant,
        'Non-Compliant Resources': item.non_compliant_resources,
        'Non-Compliant Policies': item.non_compliant_policies,
      })),
    },
    {
      label: 'Orphaned resources',
      fileName: `${filePrefix}-orphaned-resources`,
      rows: (govOrphans.data?.orphans ?? []).map((item) => ({
        Name: item.resource_name,
        Category: item.category,
        Type: shortType(item.resource_type),
        Location: item.location,
        'Resource Group': item.resource_group,
        Subscription: resolveSubscriptionName(item.subscription_name, item.subscription_id, subNameMap),
      })),
    },
    {
      label: 'Integration register',
      fileName: `${filePrefix}-integration-register`,
      rows: (intList.data ?? []).map((item) => ({
        Name: item.name ?? '',
        Source: item.source_resource_name || item.source_system || nameFromResourceId(item.source_resource_id, 'Unknown'),
        Target: item.target_name && !looksLikeId(item.target_name) ? item.target_name : item.target_system || nameFromResourceId(item.target_resource_id, item.target_name || '—'),
        Type: item.integration_type,
        Protocol: item.protocol ?? '',
        Direction: titleCase(item.direction),
        Health: item.health_status ?? 'Not monitored',
      })),
    },
    {
      label: 'License SKU detail',
      fileName: `${filePrefix}-license-sku-detail`,
      rows: (licSkus.data ?? []).map((item) => ({
        SKU: item.sku_display_name || item.sku_part_number,
        Purchased: item.purchased,
        Consumed: item.consumed,
        Available: item.available,
        Utilisation: `${formatPercent(item.utilization_pct, 0)}${item.is_payg ? ' PAYG' : ''}`,
        Underutilised: item.is_payg ? 'N/A PAYG' : item.is_underutilized ? 'Yes' : 'No',
      })),
    },
    {
      label: 'Application portfolio',
      fileName: `${filePrefix}-application-portfolio`,
      rows: (portfolio.data ?? []).map((item) => ({
        Application: item.app_name,
        Purpose: item.purpose ?? '',
        'Business Owner': item.business_owner ?? '',
        'Technical Owner': item.technical_owner ?? '',
        Criticality: item.criticality ?? '',
        Status: item.status ?? '',
        'Future State': item.future_state ?? '',
      })),
    },
  ], [advisorRecs.data, challenges.data, filePrefix, govOrphans.data?.orphans, govPolicy.data?.by_subscription, initiatives.data, intList.data, licSkus.data, portfolio.data, recommendations.data, subNameMap]);

  const referenceCsvExports = useMemo(() => [
    { label: 'Subscriptions', fileName: `${filePrefix}-subscriptions`, rows: (subscriptions.data ?? []).map((item) => ({ 'Subscription Name': item.display_name, 'Subscription ID': item.subscription_id, State: item.state, 'Tenant ID': item.tenant_id })) },
    { label: 'Resource groups', fileName: `${filePrefix}-resource-groups`, rows: (resourceGroups.data ?? []).map((item) => ({ 'Resource Group': item.name, Location: item.location, Resources: item.resource_count, Subscription: resolveSubscriptionName(undefined, item.subscription_id, subNameMap) })) },
    { label: 'Resources by type', fileName: `${filePrefix}-resources-by-type`, rows: resourcesByType.map(([type, count]) => ({ 'Resource Type': shortType(type), Count: count, '% of Total': invSummary.data ? formatPercent((count / invSummary.data.total_resources) * 100, 1) : '' })) },
    { label: 'Databases', fileName: `${filePrefix}-databases`, rows: (databases.data ?? []).map((item) => ({ Name: item.resource_name, Type: item.database_type, 'SKU Tier': item.sku_tier ?? '', 'Size (GB)': item.current_size_gb?.toFixed(1) ?? item.max_size_gb?.toFixed(1) ?? '', Status: item.status, 'Resource Group': item.resource_group })) },
    { label: 'Cost trend', fileName: `${filePrefix}-monthly-cost-trend`, rows: (costSummary.data?.by_month ?? []).map((item) => ({ Month: item.month, Spend: formatCurrency(item.amount) })) },
    { label: 'Cost by subscription', fileName: `${filePrefix}-cost-by-subscription`, rows: costExportRows.bySubscription },
    { label: 'Cost by resource group', fileName: `${filePrefix}-cost-by-resource-group`, rows: costExportRows.byResourceGroup },
    { label: 'Cost by resource type', fileName: `${filePrefix}-cost-by-resource-type`, rows: costExportRows.byResourceType },
    { label: 'Top cost drivers', fileName: `${filePrefix}-top-cost-drivers`, rows: costExportRows.topCostDrivers },
    { label: 'Cost by resource', fileName: `${filePrefix}-cost-by-resource`, rows: costExportRows.byResource },
    {
      label: 'All resources with cost',
      fileName: `${filePrefix}-all-resources-with-cost`,
      rows: costExportRows.allResourcesWithCost,
    },
    { label: 'Defender scores', fileName: `${filePrefix}-defender-scores`, rows: (defender.data?.scores ?? []).map((item) => ({ Subscription: resolveSubscriptionName(item.subscription_name, undefined, subNameMap), 'Current Score': item.current_score.toFixed(1), 'Max Score': item.max_score.toFixed(1), Percentage: formatPercent(item.percentage, 0) })) },
    { label: 'Defender controls', fileName: `${filePrefix}-defender-control-breakdown`, rows: (defender.data?.controls ?? []).map((item) => ({ Control: looksLikeId(item.name) ? titleCase(item.name.split('/').pop() ?? item.name) : item.name, Subscription: resolveSubscriptionName(undefined, item.subscription_id, subNameMap), Score: item.current_score.toFixed(1), Max: item.max_score.toFixed(1), Percentage: formatPercent(item.percentage, 0), Healthy: item.healthy_count, Unhealthy: item.unhealthy_count, 'Not Applicable': item.not_applicable_count })) },
    { label: 'Advisor scores', fileName: `${filePrefix}-advisor-scores`, rows: (advisorScores.data?.aggregated_scores ?? []).filter((item) => !looksLikeId(item.pillar)).map((item) => ({ Pillar: readablePillar(item.pillar), Score: item.score.toFixed(1), Percentage: formatPercent(item.percentage, 0), 'Potential Improvement': item.potential_score_increase != null && item.potential_score_increase > 0 ? `+${item.potential_score_increase.toFixed(1)}` : '' })) },
    { label: 'RBAC by role', fileName: `${filePrefix}-rbac-by-role`, rows: Object.entries(govRbac.data?.by_role ?? {}).sort((a, b) => b[1] - a[1]).map(([role, count]) => ({ Role: role, Count: count })) },
    { label: 'RBAC by principal type', fileName: `${filePrefix}-rbac-by-principal-type`, rows: Object.entries(govRbac.data?.by_principal_type ?? {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ 'Principal Type': type, Count: count })) },
    { label: 'Dynamics environments', fileName: `${filePrefix}-dynamics-environments`, rows: (d365Envs.data ?? []).map((item) => ({ Name: item.display_name, Type: item.environment_type, Region: item.region, State: item.state, 'DB Used (MB)': item.database_capacity_used_mb?.toLocaleString() ?? '', 'DB Allocated (MB)': item.database_capacity_allocated_mb?.toLocaleString() ?? '', URL: item.url ?? '' })) },
    { label: 'Dynamics users', fileName: `${filePrefix}-dynamics-users`, rows: (d365Users.data ?? []).map((item) => ({ Name: item.display_name ?? item.full_name ?? '', Email: item.email ?? '', Environment: item.environment || 'Unknown environment', Roles: (item.roles ?? item.security_roles ?? []).join('; '), 'Business Unit': item.business_unit ?? '', Disabled: item.is_disabled ? 'Yes' : 'No', 'Active 30d': item.is_active_30d == null ? 'Unknown' : item.is_active_30d ? 'Yes' : 'No' })) },
    { label: 'Dynamics modules', fileName: `${filePrefix}-dynamics-modules`, rows: (d365Modules.data ?? []).map((item) => ({ Module: item.module, Entity: item.entity_name, 'Record Count': item.record_count?.toLocaleString() ?? '', Environment: item.environment_id })) },
    { label: 'Dynamics workflows', fileName: `${filePrefix}-dynamics-workflows`, rows: (d365Workflows.data ?? []).map((item) => ({ Workflow: item.workflow_name ?? item.name, State: item.state, Status: item.status, 'Success Rate': item.success_rate != null ? formatPercent(item.success_rate, 0) : '', 'Total Runs': item.total_runs ?? '', Environment: item.environment_id })) },
    { label: 'Business Central', fileName: `${filePrefix}-business-central`, rows: (d365BC.data ?? []).map((item) => ({ Company: item.company_name, Customers: item.customers_count?.toLocaleString() ?? '', Vendors: item.vendors_count?.toLocaleString() ?? '', Items: item.items_count?.toLocaleString() ?? '', 'GL Entries': item.gl_entries_count?.toLocaleString() ?? '', Environment: item.environment_id })) },
    { label: 'Dynamics linkage integrations', fileName: `${filePrefix}-dynamics-linked-integrations`, rows: dynamicsIntegrationRows.map((item) => ({ Integration: item.name, Source: item.source_system ?? item.source_resource_name ?? '', Target: item.target_system ?? item.target_name ?? '', Type: item.integration_type, Status: item.health_status ?? 'Not monitored' })) },
    { label: 'Dynamics linkage costs', fileName: `${filePrefix}-dynamics-linked-costs`, rows: dynamicsCostRows.map((item) => ({ Resource: item.resource_name, Type: shortType(item.resource_type), '1-Month': formatCurrency(item.cost_1m ?? 0), '3-Month': formatCurrency(item.cost_3m ?? 0), '6-Month': formatCurrency(item.cost_6m ?? 0) })) },
    { label: 'License users', fileName: `${filePrefix}-licensed-users`, rows: (licUsers.data ?? []).map((item) => ({ User: item.display_name, UPN: item.user_principal_name, Licenses: item.assigned_licenses.length, 'Last Sign-In': item.last_sign_in ? formatDate(item.last_sign_in) : '', 'Inactive 30d': item.is_inactive_30d == null ? '' : item.is_inactive_30d ? 'Yes' : 'No', 'Est. Monthly Cost': item.estimated_monthly_cost != null ? formatCurrency(item.estimated_monthly_cost) : '' })) },
    { label: 'Stakeholder interviews', fileName: `${filePrefix}-stakeholder-interviews`, rows: (stakeholders.data ?? []).map((item) => ({ Stakeholder: item.stakeholder_name, Role: item.role ?? '', Department: item.department ?? '', Date: item.interview_date ? formatDate(item.interview_date) : '', 'Key Findings': item.key_findings ?? '', 'Pain Points': item.pain_points ?? '', Notes: item.notes ?? '' })) },
    { label: 'WAF pillars', fileName: `${filePrefix}-waf-pillars`, rows: Object.values(framework.data?.waf_pillars ?? {}).sort((a, b) => a.score - b.score).map((item) => ({ Pillar: item.name, Score: formatPercent(item.score, 0), Findings: item.findings.length, 'Future-phase Opportunities': item.phase2_opportunities.length, Description: item.description })) },
    { label: 'WAF findings', fileName: `${filePrefix}-waf-findings`, rows: Object.values(framework.data?.waf_pillars ?? {}).flatMap((pillar) => pillar.findings.map((finding) => ({ Pillar: pillar.name, Source: finding.source, Subscription: finding.subscription_name ?? '', Detail: finding.detail, 'Checklist Ref': finding.checklist_ref }))) },
    { label: 'CAF maturity', fileName: `${filePrefix}-caf-maturity`, rows: Object.values(framework.data?.caf_methodologies ?? {}).sort((a, b) => a.maturity - b.maturity).map((item) => ({ Methodology: item.name, Maturity: `${item.maturity.toFixed(1)} / 5`, Label: item.maturity_label, Signals: item.signals.join('; '), Description: item.description })) },
    { label: 'Future-phase opportunities', fileName: `${filePrefix}-future-phase-opportunities`, rows: (framework.data?.phase2_summary ?? []).map((item) => ({ Title: item.title, Description: item.description, Pillar: item.pillar ?? '', Reference: item.ref })) },
  ], [advisorScores.data?.aggregated_scores, costExportRows.allResourcesWithCost, costExportRows.byResource, costExportRows.byResourceGroup, costExportRows.byResourceType, costExportRows.bySubscription, costExportRows.topCostDrivers, costSummary.data?.by_month, d365BC.data, d365Envs.data, d365Modules.data, d365Users.data, d365Workflows.data, databases.data, defender.data?.controls, defender.data?.scores, dynamicsCostRows, dynamicsIntegrationRows, filePrefix, framework.data?.caf_methodologies, framework.data?.phase2_summary, framework.data?.waf_pillars, govRbac.data?.by_principal_type, govRbac.data?.by_role, invSummary.data, licUsers.data, resourceGroups.data, resourcesByType, stakeholders.data, subNameMap, subscriptions.data]);

  return (
    <section className="report-settings report-delivery">
      <div className="report-settings__header">
        <div>
          <h3>Report deliverables</h3>
          <p>
            Export working Excel packs for customer handover. This keeps the assessment report page focused on the report itself,
            while this page becomes the place to manage deliverable outputs.
          </p>
        </div>
      </div>

      <div className="report-delivery-grid">
        <DeliveryExportGroup
          title="Working deliverables"
          description="Action-oriented workbook exports intended for customer teams to track remediation, planning, and follow-up work."
          actions={actionCsvExports}
        />
        <DeliveryExportGroup
          title="Reference schedules"
          description="Supporting workbook exports for the underlying evidence and detailed analysis schedules."
          actions={referenceCsvExports}
        />
      </div>
    </section>
  );
}
