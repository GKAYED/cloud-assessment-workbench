import { directGet, directPost, directPut } from './client';

export type ReportVersion = 'legacy' | 'v2';
export type InterpretationRunStatus = 'draft' | 'edited' | 'approved' | 'superseded';

export interface ReportInterpretationSectionRecord {
  id?: number | null;
  run_id: number;
  section_key: string;
  source_kind: string;
  generated_text?: string | null;
  edited_text?: string | null;
  final_text?: string | null;
  last_edited_at?: string | null;
  last_edited_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ReportInterpretationRunRecord {
  id?: number | null;
  profile_id: number;
  report_version: ReportVersion;
  status: InterpretationRunStatus;
  approved: boolean;
  is_current: boolean;
  generation_trigger: string;
  source_snapshot_at?: string | null;
  source_profile_updated_at?: string | null;
  generated_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  generation_model?: string | null;
  generation_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sections: ReportInterpretationSectionRecord[];
}

export interface ReportInterpretationStateRecord {
  profile_id: number;
  report_version: ReportVersion;
  current_run?: ReportInterpretationRunRecord | null;
  sections: ReportInterpretationSectionRecord[];
  has_snapshot: boolean;
}

export const reportInterpretationApi = {
  get: (profileId: number) =>
    directGet<ReportInterpretationStateRecord>(`/api/profiles/${profileId}/report-interpretation`),

  generate: (profileId: number, body: { generation_notes?: string | null } = {}) =>
    directPost<ReportInterpretationStateRecord>(`/api/profiles/${profileId}/report-interpretation/generate`, body),

  regenerate: (profileId: number, body: { generation_notes?: string | null } = {}) =>
    directPost<ReportInterpretationStateRecord>(`/api/profiles/${profileId}/report-interpretation/regenerate`, body),

  updateSection: (profileId: number, sectionKey: string, body: { text: string; edited_by?: string | null }) =>
    directPut<ReportInterpretationSectionRecord>(
      `/api/profiles/${profileId}/report-interpretation/sections/${sectionKey}`,
      body,
    ),

  approve: (profileId: number, body: { approved_by?: string | null } = {}) =>
    directPost<ReportInterpretationStateRecord>(`/api/profiles/${profileId}/report-interpretation/approve`, body),
};
