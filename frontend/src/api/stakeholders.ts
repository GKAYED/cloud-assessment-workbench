import { directDel, directGet, directPost, directPut } from './client';
import type { StakeholderNote, StakeholderNoteCreate } from '../types';

export const stakeholdersApi = {
  list: (profileId: number) =>
    directGet<StakeholderNote[]>(`/api/stakeholders?profile_id=${profileId}`),

  create: (profileId: number, body: StakeholderNoteCreate) =>
    directPost<StakeholderNote>(`/api/stakeholders?profile_id=${profileId}`, body),

  update: (id: number, body: Partial<StakeholderNoteCreate>) =>
    directPut<StakeholderNote>(`/api/stakeholders/${id}`, body),

  delete: (id: number) => directDel(`/api/stakeholders/${id}`),
};
