import { directDel, directGet, directPost, directPut } from './client';
import type { AppPortfolioEntry, AppPortfolioEntryCreate } from '../types';

export const portfolioApi = {
  list: (profileId: number) =>
    directGet<AppPortfolioEntry[]>(`/api/portfolio?profile_id=${profileId}`),

  create: (profileId: number, body: AppPortfolioEntryCreate) =>
    directPost<AppPortfolioEntry>(`/api/portfolio?profile_id=${profileId}`, body),

  update: (id: number, body: Partial<AppPortfolioEntryCreate>) =>
    directPut<AppPortfolioEntry>(`/api/portfolio/${id}`, body),

  delete: (id: number) => directDel(`/api/portfolio/${id}`),
};
