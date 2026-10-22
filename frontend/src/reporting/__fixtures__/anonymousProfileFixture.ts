import type { CafMethodology } from '../../api/framework';
import type { CostRecord, CostRollup, Resource, ResourceGroup, Subscription } from '../../types';

const SAMPLE_SUBSCRIPTION_ID = '00000000-0000-4000-8000-000000000001';

export const anonymousCostFixture: {
  subscriptions: Subscription[];
  resourceGroups: ResourceGroup[];
  resources: Resource[];
  costBySubscription: CostRollup[];
  costByResourceGroup: CostRollup[];
  costByResourceType: CostRollup[];
  costByResource: CostRecord[];
} = {
  subscriptions: [
    {
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      display_name: 'Sample Website Subscription',
      state: 'Enabled',
      tenant_id: '00000000-0000-4000-8000-000000000000',
    },
  ],
  resourceGroups: [
    {
      name: 'rg-sample-web',
      location: 'australiaeast',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      tags: {},
      provisioning_state: 'Succeeded',
      resource_count: 2,
    },
  ],
  resources: [
    {
      id: `/subscriptions/${SAMPLE_SUBSCRIPTION_ID}/resourceGroups/rg-sample-web/providers/Microsoft.Web/sites/sample-web`,
      name: 'sample-web',
      type: 'microsoft.web/sites',
      location: 'australiaeast',
      resource_group: 'rg-sample-web',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      subscription_name: 'Sample Website Subscription',
      tags: {},
      is_tagged: false,
    },
    {
      id: `/subscriptions/${SAMPLE_SUBSCRIPTION_ID}/resourceGroups/rg-sample-web/providers/Microsoft.Storage/storageAccounts/samplestorage001`,
      name: 'samplestorage001',
      type: 'microsoft.storage/storageaccounts',
      location: 'global',
      resource_group: 'rg-sample-web',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      subscription_name: 'Sample Website Subscription',
      tags: { application: 'sample' },
      is_tagged: true,
    },
  ],
  costBySubscription: [
    {
      group_key: SAMPLE_SUBSCRIPTION_ID,
      group_type: 'subscription',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      subscription_name: 'Sample Website Subscription',
      cost_1m: 120,
      cost_3m: 360,
      cost_6m: 720,
      currency: 'USD',
      trend: 'stable',
      resource_count: 1,
    },
  ],
  costByResourceGroup: [
    {
      group_key: 'rg-sample-web',
      group_type: 'resource_group',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      cost_1m: 120,
      cost_3m: 360,
      cost_6m: 720,
      currency: 'USD',
      trend: 'stable',
      resource_count: 1,
    },
  ],
  costByResourceType: [
    {
      group_key: 'microsoft.web/sites',
      group_type: 'resource_type',
      cost_1m: 120,
      cost_3m: 360,
      cost_6m: 720,
      currency: 'USD',
      trend: 'stable',
      resource_count: 1,
    },
  ],
  costByResource: [
    {
      resource_id: `/subscriptions/${SAMPLE_SUBSCRIPTION_ID}/resourceGroups/rg-sample-web/providers/Microsoft.Web/sites/sample-web`,
      resource_name: 'sample-web',
      resource_type: 'microsoft.web/sites',
      resource_group: 'rg-sample-web',
      subscription_id: SAMPLE_SUBSCRIPTION_ID,
      cost_1m: 120,
      cost_3m: 360,
      cost_6m: 720,
      currency: 'USD',
      trend: 'stable',
      monthly_avg_3m: 120,
      monthly_avg_6m: 120,
    },
  ],
};

export const anonymousCafMethodologyFixture: CafMethodology = {
  name: 'Govern',
  description: 'Sample governance methodology',
  maturity: 5,
  maturity_label: 'Optimised',
  has_signals: true,
  signals: ['Engine signal that should not override manual ratings'],
  sub_dimensions: [
    { name: 'Policy', status: 'Automated', score: 95, signals: [] },
    { name: 'Tagging', status: 'Partial', score: 35, signals: [] },
    { name: 'Ownership', status: 'Partial', score: 50, signals: [] },
  ],
};
