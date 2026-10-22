import { describe, expect, it } from 'vitest';
import {
  buildAllResourcesWithCostExportRows,
  buildCostByResourceGroupExportRows,
  buildCostBySubscriptionExportRows,
  buildCostResourceCountByType,
  buildCostByResourceId,
  buildInventoryResourceCountBySubscription,
  buildSubscriptionNameMap,
  buildTopCostDriverExportRows,
} from '../costShaping';
import {
  anonymousCostByResourceGroup,
  anonymousCostBySubscription,
  anonymousCostRecords,
  anonymousResourceGroups,
  anonymousResources,
  anonymousSubscriptions,
} from '../__fixtures__/anonymousCostHierarchyFixture';

describe('cost and inventory hierarchy regression contract', () => {
  it('keeps subscription inventory counts separate from costed resource counts', () => {
    const subscriptionNames = buildSubscriptionNameMap(anonymousSubscriptions);
    const inventoryCounts = buildInventoryResourceCountBySubscription(anonymousResourceGroups);
    const rows = buildCostBySubscriptionExportRows(anonymousCostBySubscription, subscriptionNames, inventoryCounts);
    const demoWebSubscriptionRow = rows.find((row) => row.Subscription === 'Demo Web Subscription');
    const sharedServicesSubscriptionRow = rows.find((row) => row.Subscription === 'Demo Shared Services Subscription');

    expect(demoWebSubscriptionRow).toBeDefined();
    expect(demoWebSubscriptionRow?.['Inventory Resources']).toBe(5);
    expect(demoWebSubscriptionRow?.['Costed Resources']).toBe(2);
    expect(sharedServicesSubscriptionRow).toBeDefined();
    expect(sharedServicesSubscriptionRow?.['Inventory Resources']).toBe(1);
    expect(sharedServicesSubscriptionRow?.['Costed Resources']).toBe(1);
  });

  it('does not invent cost rows for inventory-only resource groups', () => {
    const rows = buildCostByResourceGroupExportRows(anonymousCostByResourceGroup);
    const resourceGroupsWithCost = rows.map((row) => row['Resource Group']);

    expect(resourceGroupsWithCost).toHaveLength(2);
    expect(resourceGroupsWithCost).toEqual(expect.arrayContaining(['rg-web-prod', 'rg-shared']));
    expect(resourceGroupsWithCost).not.toContain('rg-web-empty-cost');
  });

  it('counts resources by type from cost records only', () => {
    const counts = buildCostResourceCountByType(anonymousCostRecords);

    expect(counts.get('microsoft.web/sites')).toBe(1);
    expect(counts.get('microsoft.storage/storageaccounts')).toBe(1);
    expect(counts.get('microsoft.insights/metricalerts')).toBeUndefined();
  });

  it('can produce a full inventory plus cost view without dropping uncosted resources', () => {
    const subscriptionNames = buildSubscriptionNameMap(anonymousSubscriptions);
    const costByResourceId = buildCostByResourceId(anonymousCostRecords);
    const rows = buildAllResourcesWithCostExportRows(anonymousResources, costByResourceId, subscriptionNames);

    expect(rows).toHaveLength(4);
    expect(rows.find((row) => row.Resource === 'demo-alert')?.['1-Month']).toBe('$0');
    expect(rows.find((row) => row.Resource === 'demo-web')?.['1-Month']).toBe('$100');
  });

  it('preserves legacy blank names in the top cost driver export', () => {
    const rows = buildTopCostDriverExportRows(anonymousCostRecords);
    const blankNameRow = rows.find((row) => row.Resource === '');

    expect(blankNameRow).toBeDefined();
    expect(blankNameRow?.['Resource Group']).toBe('rg-shared');
  });
});
