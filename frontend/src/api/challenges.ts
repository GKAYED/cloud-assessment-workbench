import { directDel, directGet, directPost, directPut } from './client';
import type { Challenge, ChallengeCreate } from '../types';

export const challengesApi = {
  list: (profileId: number) =>
    directGet<Challenge[]>(`/api/challenges?profile_id=${profileId}`),

  create: (profileId: number, body: ChallengeCreate) =>
    directPost<Challenge>(`/api/challenges?profile_id=${profileId}`, body),

  update: (id: number, body: Partial<ChallengeCreate>) =>
    directPut<Challenge>(`/api/challenges/${id}`, body),

  delete: (id: number) => directDel(`/api/challenges/${id}`),
};
