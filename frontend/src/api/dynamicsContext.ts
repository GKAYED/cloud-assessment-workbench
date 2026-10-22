import { directGet, directPut } from './client';
import type { DynamicsManualContext, DynamicsManualContextUpdate } from '../types';

export const dynamicsContextApi = {
  get: (profileId: number) =>
    directGet<DynamicsManualContext>(`/api/profiles/${profileId}/dynamics-manual-context`),

  update: (profileId: number, body: DynamicsManualContextUpdate) =>
    directPut<DynamicsManualContext>(`/api/profiles/${profileId}/dynamics-manual-context`, body),
};
