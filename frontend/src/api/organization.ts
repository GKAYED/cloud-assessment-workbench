import { directGet, directPut } from './client';
import type { OrganizationContext, OrganizationContextUpdate } from '../types';

export const organizationApi = {
  get: (profileId: number) =>
    directGet<OrganizationContext>(`/api/profiles/${profileId}/organization-context`),

  update: (profileId: number, body: OrganizationContextUpdate) =>
    directPut<OrganizationContext>(`/api/profiles/${profileId}/organization-context`, body),
};
