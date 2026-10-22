import { get, post } from './client';
import type { DynamicsResourceOverride } from '../types';

export type DynamicsOverrideStatus = 'use_system' | 'confirmed_dynamics' | 'possible' | 'shared' | 'not_dynamics';

export const dynamicsOverridesApi = {
  list: (profileId: number) =>
    get<DynamicsResourceOverride[]>(`/api/dynamics-resource-overrides?profile_id=${profileId}`),

  upsert: (profileId: number, body: { resource_id: string; override_status: DynamicsOverrideStatus; notes?: string | null }) =>
    post<DynamicsResourceOverride | null>(`/api/dynamics-resource-overrides/upsert?profile_id=${profileId}`, body),
};
