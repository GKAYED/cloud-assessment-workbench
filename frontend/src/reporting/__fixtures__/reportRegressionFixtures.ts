import type { CafMethodology, ManualFrameworkRating } from '../../api/framework';
import type { CostRecord, CostRollup, Resource, ResourceGroup, Subscription } from '../../types';
import {
  anonymousCostByResourceGroup,
  anonymousCostBySubscription,
  anonymousCostByResourceType,
  anonymousCostRecords,
  anonymousResourceGroups,
  anonymousResources,
  anonymousSubscriptions,
} from './anonymousCostHierarchyFixture';
import { anonymousCafMethodologyFixture } from './anonymousProfileFixture';

export type ReportRegressionFixture = {
  profileLabel: string;
  subscriptions: Subscription[];
  resourceGroups: ResourceGroup[];
  resources: Resource[];
  costBySubscription: CostRollup[];
  costByResourceGroup: CostRollup[];
  costByResourceType: CostRollup[];
  costByResource: CostRecord[];
  cafMethodology: CafMethodology;
  manualCafRatings: Record<string, ManualFrameworkRating>;
  dataGaps: string[];
};

const cloneFixtureValue = <T>(value: T): T => structuredClone(value);

const deepFreezeFixture = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreezeFixture((value as Record<string, unknown>)[key]);
  }
  return value;
};

export const completeReportRegressionFixture: ReportRegressionFixture = deepFreezeFixture({
  profileLabel: 'complete-profile',
  subscriptions: cloneFixtureValue(anonymousSubscriptions),
  resourceGroups: cloneFixtureValue(anonymousResourceGroups),
  resources: cloneFixtureValue(anonymousResources),
  costBySubscription: cloneFixtureValue(anonymousCostBySubscription),
  costByResourceGroup: cloneFixtureValue(anonymousCostByResourceGroup),
  costByResourceType: cloneFixtureValue(anonymousCostByResourceType),
  costByResource: cloneFixtureValue(anonymousCostRecords),
  cafMethodology: cloneFixtureValue(anonymousCafMethodologyFixture),
  manualCafRatings: {
    Policy: 'green',
    Tagging: 'amber',
    Ownership: 'amber',
  },
  dataGaps: [],
});

export const partialReportRegressionFixture: ReportRegressionFixture = deepFreezeFixture({
  profileLabel: 'partial-profile',
  subscriptions: [
    {
      subscription_id: '33333333-3333-4333-8333-333333333333',
      display_name: 'Partial Demo Subscription',
      state: 'Enabled',
      tenant_id: 'tenant-demo',
    },
  ],
  resourceGroups: [
    {
      name: 'rg-partial-app',
      location: 'australiaeast',
      subscription_id: '33333333-3333-4333-8333-333333333333',
      tags: {},
      provisioning_state: 'Succeeded',
      resource_count: 1,
    },
  ],
  resources: [
    {
      id: '/subscriptions/33333333-3333-4333-8333-333333333333/resourceGroups/rg-partial-app/providers/Microsoft.Web/sites/partial-app',
      name: 'partial-app',
      type: 'Microsoft.Web/sites',
      location: 'australiaeast',
      resource_group: 'rg-partial-app',
      subscription_id: '33333333-3333-4333-8333-333333333333',
      subscription_name: 'Partial Demo Subscription',
      tags: {},
      is_tagged: false,
    },
  ],
  costBySubscription: [],
  costByResourceGroup: [],
  costByResourceType: [],
  costByResource: [],
  cafMethodology: {
    ...anonymousCafMethodologyFixture,
    maturity: 2,
    maturity_label: 'Developing',
    has_signals: false,
    signals: [],
    sub_dimensions: [],
  },
  manualCafRatings: {},
  dataGaps: [
    'No cost evidence was imported for the selected profile.',
    'No manual CAF ratings were captured for the selected profile.',
    'Only inventory evidence is present for the selected profile.',
  ],
});
