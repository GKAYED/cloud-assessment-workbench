import { get } from './client';
import type { Subscription, Resource, ResourceGroup, InventorySummary, InventoryTreeNode, DatabaseOverview } from '../types';

export const inventoryApi = {
  subscriptions: () => get<Subscription[]>('/api/inventory/subscriptions'),
  resources: () => get<Resource[]>('/api/inventory/resources'),
  resourceGroups: () => get<ResourceGroup[]>('/api/inventory/resource-groups'),
  summary: () => get<InventorySummary>('/api/inventory/summary'),
  tree: () => get<InventoryTreeNode[]>('/api/inventory/tree'),
  databases: () => get<DatabaseOverview[]>('/api/inventory/databases'),
};
