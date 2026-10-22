import { describe, expect, it } from 'vitest';
import { anonymousCostFixture } from '../__fixtures__/anonymousProfileFixture';
import {
  buildAllResourcesWithCostExportRows,
  buildCostByResourceExportRows,
  buildCostByResourceId,
  buildCostByResourceTypeExportRows,
  buildCostResourceCountByType,
  buildInventoryResourceCountBySubscription,
  buildSubscriptionNameMap,
} from '../costShaping';

describe('cost export shaping regression', () => {
  it('uses the same anonymous profile fixture for page/export cost rows', () => {
    const subscriptionNames = buildSubscriptionNameMap(anonymousCostFixture.subscriptions);
    const costResourceCountByType = buildCostResourceCountByType(anonymousCostFixture.costByResource);

    expect(
      buildCostByResourceTypeExportRows(anonymousCostFixture.costByResourceType, costResourceCountByType),
    ).toEqual([
      {
        'Resource Type': 'web / sites',
        'Friendly Name': 'App Service',
        '1-Month': '$120',
        '3-Month': '$360',
        '6-Month': '$720',
        Trend: '— stable',
        Count: 1,
      },
    ]);

    expect(buildCostByResourceExportRows(anonymousCostFixture.costByResource, subscriptionNames)).toEqual([
      {
        Subscription: 'Sample Website Subscription',
        'Resource Group': 'rg-sample-web',
        Resource: 'sample-web',
        'Resource Type': 'web / sites',
        'Friendly Type': 'App Service',
        '1-Month': '$120',
        '3-Month': '$360',
        '6-Month': '$720',
        Trend: '— stable',
      },
    ]);
  });

  it('keeps missing cost data explicit rather than inventing values', () => {
    const subscriptionNames = buildSubscriptionNameMap(anonymousCostFixture.subscriptions);
    const costByResourceId = buildCostByResourceId(anonymousCostFixture.costByResource);
    const allResourceRows = buildAllResourcesWithCostExportRows(
      anonymousCostFixture.resources,
      costByResourceId,
      subscriptionNames,
    );

    expect(allResourceRows).toHaveLength(2);
    expect(allResourceRows.find((row) => row.Resource === 'samplestorage001')).toMatchObject({
      '1-Month': '$0',
      '3-Month': '$0',
      '6-Month': '$0',
      Trend: '— stable',
    });
  });

  it('keeps inventory and costed-resource counts separate', () => {
    const inventoryCounts = buildInventoryResourceCountBySubscription(anonymousCostFixture.resourceGroups);

    expect(inventoryCounts.get(anonymousCostFixture.subscriptions[0].subscription_id)).toBe(2);
    expect(anonymousCostFixture.costBySubscription[0].resource_count).toBe(1);
  });
});
