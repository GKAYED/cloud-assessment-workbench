import { directDel, directGet, directPost, directPut } from './client';
import type { Initiative, InitiativeCreate } from '../types';

export const initiativesApi = {
  list: (profileId: number) =>
    directGet<Initiative[]>(`/api/initiatives?profile_id=${profileId}`),

  timeline: (profileId: number) =>
    directGet<Initiative[]>(`/api/initiatives/timeline?profile_id=${profileId}`),

  create: (profileId: number, body: InitiativeCreate) =>
    directPost<Initiative>(`/api/initiatives?profile_id=${profileId}`, body),

  update: (id: number, body: Partial<InitiativeCreate>) =>
    directPut<Initiative>(`/api/initiatives/${id}`, body),

  delete: (id: number) => directDel(`/api/initiatives/${id}`),
};
