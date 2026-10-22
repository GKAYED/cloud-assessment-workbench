import { directDel, directGet, directPost, directPut } from './client';
import type { Recommendation, RecommendationCreate } from '../types';

export const recommendationsApi = {
  list: (profileId: number) =>
    directGet<Recommendation[]>(`/api/recommendations?profile_id=${profileId}`),

  create: (profileId: number, body: RecommendationCreate) =>
    directPost<Recommendation>(`/api/recommendations?profile_id=${profileId}`, body),

  update: (id: number, body: Partial<RecommendationCreate>) =>
    directPut<Recommendation>(`/api/recommendations/${id}`, body),

  delete: (id: number) => directDel(`/api/recommendations/${id}`),
};
