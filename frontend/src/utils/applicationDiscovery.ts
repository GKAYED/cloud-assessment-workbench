import type { Resource } from '../types';
import { normalizeResourceTypeName } from './resourceNaming';

type ComponentTier = 'edge' | 'app' | 'integration' | 'data' | 'security' | 'operations' | 'platform';

interface ComponentRule {
  id: string;
  label: string;
  description: string;
  tier: ComponentTier;
  weight: number;
  matchers: string[];
  hintTokens?: string[];
}

export interface ApplicationComponent {
  id: string;
  label: string;
  description: string;
  tier: ComponentTier;
  resources: Resource[];
}

export interface ResourceGroupApplicationProfile {
  resourceGroup: string;
  subscriptionId: string;
  resourceCount: number;
  applicationName: string;
  archetype: string;
  confidence: number;
  purposeSummary: string;
  componentMap: ApplicationComponent[];
  inferredFlows: string[];
  recommendations: string[];
}

const RULES: ComponentRule[] = [
  {
    id: 'web_frontend',
    label: 'Web frontend',
    description: 'Delivers browser-based experience and public HTTP endpoints.',
    tier: 'edge',
    weight: 3,
    matchers: ['microsoft.web/sites', 'microsoft.cdn/profiles', 'microsoft.cdn/endpoints', 'microsoft.frontdoor/frontdoors'],
    hintTokens: ['frontdoor', 'cdn', 'frontend', 'portal', 'website', 'web'],
  },
  {
    id: 'api_layer',
    label: 'API layer',
    description: 'Exposes APIs and request routing for consumers and internal services.',
    tier: 'app',
    weight: 3,
    matchers: ['microsoft.apimanagement/service', 'microsoft.web/sites', 'microsoft.containerinstance/containergroups'],
    hintTokens: ['apim', 'api', 'gateway'],
  },
  {
    id: 'integration_runtime',
    label: 'Integration runtime',
    description: 'Moves and transforms data between systems.',
    tier: 'integration',
    weight: 3,
    matchers: [
      'microsoft.logic/workflows',
      'microsoft.datafactory/factories',
      'microsoft.servicebus/namespaces',
      'microsoft.eventhub/namespaces',
      'microsoft.storage/storageaccounts',
    ],
    hintTokens: ['logic', 'workflow', 'datafactory', 'factory', 'servicebus', 'eventhub', 'integration', 'synapse'],
  },
  {
    id: 'data_store',
    label: 'Data store',
    description: 'Persists operational or analytical data.',
    tier: 'data',
    weight: 4,
    matchers: [
      'microsoft.sql/servers/databases',
      'microsoft.sql/managedinstances',
      'microsoft.dbforpostgresql/flexibleservers',
      'microsoft.dbformysql/flexibleservers',
      'microsoft.documentdb/databaseaccounts',
      'microsoft.storage/storageaccounts',
      'microsoft.synapse/workspaces',
    ],
    hintTokens: ['database', 'sql', 'postgres', 'mysql', 'cosmos', 'storage', 'synapse', 'lake', 'warehouse'],
  },
  {
    id: 'identity_and_secrets',
    label: 'Identity and secrets',
    description: 'Holds service credentials, certificates, and key material.',
    tier: 'security',
    weight: 2,
    matchers: ['microsoft.keyvault/vaults', 'microsoft.managedidentity/userassignedidentities'],
    hintTokens: ['vault', 'secret', 'certificate', 'identity', 'managedidentity'],
  },
  {
    id: 'network_boundary',
    label: 'Network boundary',
    description: 'Provides ingress, private connectivity, or network segmentation.',
    tier: 'edge',
    weight: 2,
    matchers: [
      'microsoft.network/applicationgateways',
      'microsoft.network/loadbalancers',
      'microsoft.network/privateendpoints',
      'microsoft.network/virtualnetworks',
      'microsoft.network/firewallpolicies',
      'microsoft.network/azurefirewalls',
    ],
    hintTokens: ['privateendpoint', 'private-link', 'privatelink', 'vnet', 'subnet', 'dns', 'firewall', 'applicationgateway', 'loadbalancer'],
  },
  {
    id: 'observability',
    label: 'Observability',
    description: 'Captures logs, telemetry, and performance traces.',
    tier: 'operations',
    weight: 2,
    matchers: ['microsoft.insights/components', 'microsoft.operationalinsights/workspaces', 'microsoft.dashboard/grafana'],
    hintTokens: ['insights', 'dashboard', 'grafana', 'monitor', 'diagnostic', 'loganalytics', 'workspace'],
  },
  {
    id: 'compute_platform',
    label: 'Compute platform',
    description: 'Runs application code and worker processes.',
    tier: 'platform',
    weight: 2,
    matchers: [
      'microsoft.web/serverfarms',
      'microsoft.compute/virtualmachines',
      'microsoft.containerregistry/registries',
      'microsoft.containerservice/managedclusters',
      'microsoft.app/containerapps',
      'microsoft.web/sites',
    ],
    hintTokens: ['vm', 'virtualmachine', 'container', 'aks', 'serverfarm', 'compute', 'appserviceplan'],
  },
];

const ARCHETYPE_HINTS: Array<{
  id: string;
  label: string;
  description: string;
  components: string[];
}> = [
  {
    id: 'web_transactional',
    label: 'Web transactional application',
    description: 'Customer or staff-facing web workload with an API/application layer and persistent data store.',
    components: ['web_frontend', 'api_layer', 'data_store'],
  },
  {
    id: 'integration_data_platform',
    label: 'Integration and data platform',
    description: 'Data movement and transformation workload integrating multiple systems with analytics or storage endpoints.',
    components: ['integration_runtime', 'data_store'],
  },
  {
    id: 'integration_api_hub',
    label: 'API and integration hub',
    description: 'API management and integration orchestration layer connecting internal and external systems.',
    components: ['api_layer', 'integration_runtime'],
  },
  {
    id: 'platform_foundation',
    label: 'Platform foundation and shared services',
    description: 'Shared infrastructure components supporting multiple workloads or environments.',
    components: ['compute_platform', 'network_boundary', 'identity_and_secrets'],
  },
];

function normalizeType(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

function buildResourceHintText(resource: Resource): string {
  return [
    resource.type,
    resource.id,
    resource.name,
    resource.resource_group,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/[^a-zA-Z0-9/._-]+/g, ' ')
    .toLowerCase();
}

function tokenMatchScore(text: string, token: string): number {
  if (!token) return 0;
  if (text.includes(`/${token}/`)) return 3;
  if (text.includes(`/${token}`)) return 3;
  if (text.includes(`${token}/`)) return 2;
  if (text.includes(token)) return 1;
  return 0;
}

function inferRuleFromHints(resource: Resource): ComponentRule | null {
  const text = buildResourceHintText(resource);
  let bestRule: ComponentRule | null = null;
  let bestScore = 0;

  for (const rule of RULES) {
    const tokens = rule.hintTokens ?? [];
    const score = tokens.reduce((sum, token) => sum + tokenMatchScore(text, token), 0);
    if (score > bestScore) {
      bestRule = rule;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestRule : null;
}

function roleForResource(resource: Resource): ComponentRule {
  const t = normalizeType(resource.type);
  for (const rule of RULES) {
    if (rule.matchers.some((matcher) => t.startsWith(matcher))) return rule;
  }
  const inferredRule = inferRuleFromHints(resource);
  if (inferredRule) return inferredRule;
  return {
    id: 'uncategorized',
    label: 'Unclassified components',
    description: 'Resources that require manual interpretation in architectural context.',
    tier: 'platform',
    weight: 1,
    matchers: [],
  };
}

function buildComponentMap(resources: Resource[]): ApplicationComponent[] {
  const byRole = new Map<string, ApplicationComponent>();
  for (const resource of resources) {
    const role = roleForResource(resource);
    const existing = byRole.get(role.id);
    if (existing) {
      existing.resources.push(resource);
      continue;
    }
    byRole.set(role.id, {
      id: role.id,
      label: role.label,
      description: role.description,
      tier: role.tier,
      resources: [resource],
    });
  }
  return [...byRole.values()].sort((a, b) => b.resources.length - a.resources.length);
}

function detectArchetype(components: ApplicationComponent[]): { archetype: string; summary: string; confidence: number } {
  if (components.length === 0) {
    return {
      archetype: 'Unknown workload',
      summary: 'No resources were available to infer application purpose.',
      confidence: 0,
    };
  }

  const componentIds = new Set(components.map((component) => component.id));
  const weightedPresence = new Map<string, number>();
  for (const component of components) {
    const rule = RULES.find((entry) => entry.id === component.id);
    if (!rule) continue;
    weightedPresence.set(rule.id, (weightedPresence.get(rule.id) ?? 0) + (rule.weight * component.resources.length));
  }

  let best = ARCHETYPE_HINTS[ARCHETYPE_HINTS.length - 1];
  let bestScore = -1;
  for (const hint of ARCHETYPE_HINTS) {
    let score = 0;
    for (const componentId of hint.components) {
      if (componentIds.has(componentId)) score += weightedPresence.get(componentId) ?? 1;
    }
    if (score > bestScore) {
      best = hint;
      bestScore = score;
    }
  }

  const totalWeight = [...weightedPresence.values()].reduce((sum, value) => sum + value, 0);
  const normalized = totalWeight > 0 ? Math.round(Math.min(95, (bestScore / totalWeight) * 100 + 25)) : 25;
  return {
    archetype: best.label,
    summary: best.description,
    confidence: normalized,
  };
}

function inferFlows(components: ApplicationComponent[]): string[] {
  const ids = new Set(components.map((component) => component.id));
  const flows: string[] = [];
  if (ids.has('web_frontend') && ids.has('api_layer')) {
    flows.push('Web frontend likely sends user requests into the API/application layer.');
  }
  if (ids.has('api_layer') && ids.has('data_store')) {
    flows.push('Application services likely read/write operational data stores.');
  }
  if (ids.has('integration_runtime') && ids.has('data_store')) {
    flows.push('Integration runtime likely loads or synchronizes data into platform storage.');
  }
  if (ids.has('network_boundary') && ids.has('api_layer')) {
    flows.push('Network boundary resources appear to control ingress/egress around application APIs.');
  }
  if (ids.has('identity_and_secrets') && (ids.has('api_layer') || ids.has('integration_runtime') || ids.has('data_store'))) {
    flows.push('Identity and secret stores likely provide credentials and certificates for runtime components.');
  }
  if (ids.has('observability')) {
    flows.push('Telemetry components indicate centralized monitoring and diagnostics are in place.');
  }
  if (flows.length === 0) {
    flows.push('Resource relationships are not explicit from inventory alone; component naming and tags should be reviewed.');
  }
  return flows;
}

function inferRecommendations(components: ApplicationComponent[]): string[] {
  const ids = new Set(components.map((component) => component.id));
  const recommendations: string[] = [];
  if (!ids.has('identity_and_secrets')) recommendations.push('Review whether secrets are stored in Key Vault instead of app settings or code.');
  if (!ids.has('observability')) recommendations.push('Add Application Insights or Log Analytics coverage for this resource group.');
  if (ids.has('data_store') && !ids.has('network_boundary')) recommendations.push('Validate private endpoints or firewall boundaries for data stores.');
  if (ids.has('web_frontend') && !ids.has('network_boundary')) recommendations.push('Confirm WAF/App Gateway/Front Door protection for internet-facing apps.');
  if (recommendations.length === 0) recommendations.push('Validate component ownership, RTO/RPO, and deployment pipeline maturity for this application group.');
  return recommendations;
}

function inferApplicationName(resourceGroup: string, resources: Resource[]): string {
  const preferred = resources
    .map((resource) => resource.name?.trim())
    .find((name) => !!name && !/^(log|diag|monitor|insights|workspace)/i.test(name!));
  return preferred || resourceGroup;
}

export function buildResourceGroupApplicationProfile(resourceGroup: string, subscriptionId: string, resources: Resource[]): ResourceGroupApplicationProfile {
  const components = buildComponentMap(resources);
  const archetype = detectArchetype(components);
  const flows = inferFlows(components);
  const recommendations = inferRecommendations(components);
  return {
    resourceGroup,
    subscriptionId,
    resourceCount: resources.length,
    applicationName: inferApplicationName(resourceGroup, resources),
    archetype: archetype.archetype,
    confidence: archetype.confidence,
    purposeSummary: archetype.summary,
    componentMap: components.map((component) => ({
      ...component,
      resources: [...component.resources].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    inferredFlows: flows,
    recommendations,
  };
}

export function summarizeComponentTypes(resources: Resource[]): string[] {
  const byType = new Map<string, number>();
  for (const resource of resources) {
    const label = normalizeResourceTypeName(resource.type);
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type} (${count})`);
}
