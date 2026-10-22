import type { CostRecord, D365Environment, D365ModuleStats, DynamicsResourceOverride, IntegrationPoint, Resource } from '../types';

export type SystemDynamicsClassification = 'likely_dynamics' | 'possible_dynamics' | 'shared' | 'not_dynamics';
export type EffectiveDynamicsClassification = SystemDynamicsClassification | 'confirmed_dynamics';

export interface DynamicsResourceAssessment {
  resource: Resource;
  cost?: CostRecord;
  systemClassification: SystemDynamicsClassification;
  confidence: number;
  reasons: string[];
  userOverride: DynamicsResourceOverride['override_status'] | 'use_system';
  effectiveClassification: EffectiveDynamicsClassification;
}

function tokenize(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function overrideToEffective(
  systemClassification: SystemDynamicsClassification,
  userOverride: DynamicsResourceOverride['override_status'] | 'use_system',
): EffectiveDynamicsClassification {
  if (userOverride === 'use_system') return systemClassification;
  if (userOverride === 'confirmed_dynamics') return 'confirmed_dynamics';
  if (userOverride === 'possible') return 'possible_dynamics';
  if (userOverride === 'shared') return 'shared';
  return 'not_dynamics';
}

export function classifyDynamicsResources(params: {
  resources: Resource[];
  costs: CostRecord[];
  integrations: IntegrationPoint[];
  environments: D365Environment[];
  modules: D365ModuleStats[];
  overrides: DynamicsResourceOverride[];
}): DynamicsResourceAssessment[] {
  const { resources, costs, integrations, environments, modules, overrides } = params;

  const strongKeywords = [
    'dynamics',
    'dataverse',
    'businesscentral',
    'business central',
    'crm',
    'powerapps',
    'power app',
    'powerplatform',
    'power platform',
    'commondataservice',
    'cds',
  ];
  const moderateKeywords = [
    'modeldriven',
    'xrm',
    'customerengagement',
    'ce-portal',
    'portal',
    'unified',
  ];
  const sharedTypeHints = [
    'microsoft.network/',
    'microsoft.insights/',
    'microsoft.operationalinsights/',
    'microsoft.alertsmanagement/',
    'microsoft.compute/disks',
    'microsoft.network/publicipaddresses',
  ];
  const supportTypeHints = [
    'microsoft.web/sites',
    'microsoft.web/serverfarms',
    'microsoft.web/sites/functions',
    'microsoft.logic/workflows',
    'microsoft.apimanagement/service',
    'microsoft.datafactory/factories',
    'microsoft.sql/servers/databases',
    'microsoft.storage/storageaccounts',
    'microsoft.keyvault/vaults',
    'microsoft.servicebus/namespaces',
  ];

  const envTokens = unique(
    environments.flatMap((env) => [
      env.display_name,
      env.name ?? '',
      env.url ?? '',
    ]).map(tokenize),
  );

  const moduleEnvTokens = unique(modules.map((m) => tokenize(m.environment_id || '')));

  const dynamicsIntegrationLookup = new Map<string, string[]>();
  for (const integration of integrations) {
    const haystack = tokenize([
      integration.name,
      integration.source_system,
      integration.source_resource_name,
      integration.target_system,
      integration.target_name,
      integration.integration_type,
    ].filter(Boolean).join(' '));
    const isDynamicsLinked = strongKeywords.some((keyword) => haystack.includes(keyword));
    if (!isDynamicsLinked) continue;

    const keys = unique([
      tokenize(integration.source_resource_id ?? ''),
      tokenize(integration.source_resource_name ?? ''),
      tokenize(integration.target_resource_id ?? ''),
      tokenize(integration.target_name ?? ''),
    ]);
    for (const key of keys) {
      if (!key) continue;
      const current = dynamicsIntegrationLookup.get(key) ?? [];
      current.push(integration.name || `${integration.source_resource_name} -> ${integration.target_name}`);
      dynamicsIntegrationLookup.set(key, unique(current));
    }
  }

  const costByResourceId = new Map(costs.map((row) => [row.resource_id.toLowerCase(), row] as const));
  const overrideByResourceId = new Map(overrides.map((row) => [row.resource_id.toLowerCase(), row] as const));

  return resources.map((resource) => {
    const resourceId = tokenize(resource.id);
    const resourceType = tokenize(resource.type);
    const resourceName = tokenize(resource.name);
    const resourceGroup = tokenize(resource.resource_group);
    const subscriptionName = tokenize(resource.subscription_name ?? '');
    const combined = [resourceId, resourceName, resourceGroup, resourceType, subscriptionName].join(' ');

    let score = 0;
    const reasons: string[] = [];

    const strongMatches = strongKeywords.filter((keyword) => combined.includes(keyword));
    if (strongMatches.length > 0) {
      score += 60;
      reasons.push(`Matched strong Dynamics terms: ${strongMatches.join(', ')}`);
    }

    const moderateMatches = moderateKeywords.filter((keyword) => combined.includes(keyword));
    if (moderateMatches.length > 0) {
      score += 20;
      reasons.push(`Matched supporting terms: ${moderateMatches.join(', ')}`);
    }

    const envMatch = [...envTokens, ...moduleEnvTokens].find((token) => token && combined.includes(token));
    if (envMatch) {
      score += 18;
      reasons.push(`Matched Dynamics environment token: ${envMatch}`);
    }

    const integrationHints = unique([
      ...(dynamicsIntegrationLookup.get(resourceId) ?? []),
      ...(dynamicsIntegrationLookup.get(resourceName) ?? []),
    ]);
    if (integrationHints.length > 0) {
      score += 25;
      reasons.push(`Matched Dynamics-linked integration evidence (${integrationHints.length})`);
    }

    if (supportTypeHints.some((hint) => resourceType.includes(hint)) && (strongMatches.length > 0 || envMatch || integrationHints.length > 0)) {
      score += 12;
      reasons.push(`Type is a common Dynamics support service: ${resource.type}`);
    }

    const sharedType = sharedTypeHints.some((hint) => resourceType.includes(hint));

    let systemClassification: SystemDynamicsClassification = 'not_dynamics';
    if (strongMatches.length > 0 || score >= 65) {
      systemClassification = 'likely_dynamics';
    } else if (score >= 28) {
      systemClassification = 'possible_dynamics';
    } else if (sharedType) {
      systemClassification = 'shared';
      reasons.push(`Type is likely shared infrastructure: ${resource.type}`);
    } else if (supportTypeHints.some((hint) => resourceType.includes(hint))) {
      systemClassification = 'shared';
      reasons.push(`Type is an application support service without enough Dynamics evidence: ${resource.type}`);
    }

    const override = overrideByResourceId.get(resourceId);
    const userOverride: DynamicsResourceOverride['override_status'] | 'use_system' = override?.override_status ?? 'use_system';
    const effectiveClassification = overrideToEffective(systemClassification, userOverride);

    return {
      resource,
      cost: costByResourceId.get(resourceId),
      systemClassification,
      confidence: Math.min(100, Math.max(5, score)),
      reasons: unique(reasons),
      userOverride,
      effectiveClassification,
    };
  }).sort((a, b) => {
    const spendDelta = (b.cost?.cost_1m ?? 0) - (a.cost?.cost_1m ?? 0);
    if (spendDelta !== 0) return spendDelta;
    return b.confidence - a.confidence;
  });
}
