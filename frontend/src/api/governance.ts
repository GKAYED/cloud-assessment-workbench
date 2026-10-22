import { get } from './client';
import type {
  PolicyComplianceResponse,
  RoleAssignmentsResponse,
  OrphanedResourcesResponse,
} from '../types';

export const governanceApi = {
  policyCompliance: () => get<PolicyComplianceResponse>('/api/governance/policy-compliance'),
  roleAssignments: () => get<RoleAssignmentsResponse>('/api/governance/role-assignments'),
  orphanedResources: () => get<OrphanedResourcesResponse>('/api/governance/orphaned-resources'),
};
