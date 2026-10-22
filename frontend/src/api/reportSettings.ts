import { directGet, directPut } from './client';
import type { ReportReleaseMode, ReportVisibilityId } from '../reportSettings';

export interface ReportSettingsRecord {
  id?: number | null;
  profile_id: number;
  visible_sections: Partial<Record<ReportVisibilityId, boolean>>;
  appendix_sections: Partial<Record<ReportVisibilityId, boolean>>;
  release_mode: ReportReleaseMode;
  created_at?: string | null;
  updated_at?: string | null;
}

export const reportSettingsApi = {
  get: (profileId: number) =>
    directGet<ReportSettingsRecord>(`/api/profiles/${profileId}/report-settings`),

  update: (
    profileId: number,
    body: {
      visible_sections: Partial<Record<ReportVisibilityId, boolean>>;
      appendix_sections: Partial<Record<ReportVisibilityId, boolean>>;
      release_mode: ReportReleaseMode;
    },
  ) => directPut<ReportSettingsRecord>(`/api/profiles/${profileId}/report-settings`, body),
};
