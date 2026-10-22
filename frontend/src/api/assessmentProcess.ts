import { directGet, directPut } from './client';

export interface AssessmentProcessRecord {
  id?: number | null;
  profile_id: number;
  checklist: Record<string, boolean>;
  created_at?: string | null;
  updated_at?: string | null;
}

export const assessmentProcessApi = {
  get: (profileId: number) =>
    directGet<AssessmentProcessRecord>(`/api/profiles/${profileId}/assessment-process`),

  update: (
    profileId: number,
    body: {
      checklist: Record<string, boolean>;
    },
  ) => directPut<AssessmentProcessRecord>(`/api/profiles/${profileId}/assessment-process`, body),
};
