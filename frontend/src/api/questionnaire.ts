/**
 * Questionnaire API client — WAF assessment questionnaire endpoints.
 */

import { get, post } from './client';

export interface PillarInfo {
  id: string;
  title: string;
  description: string;
  question_count: number;
}

export interface Choice {
  id: string;
  text: string;
  description: string;
}

export interface Question {
  id: string;
  type: string;
  title: string;
  description: string;
  is_required: boolean;
  choices: Choice[];
}

export interface PillarQuestions {
  pillar_id: string;
  pillar_title: string;
  questions: Question[];
}

export interface SubmitPayload {
  answers: Record<string, Record<string, string[]>>; // pillar_id -> question_id -> choice_ids[]
  notes: Record<string, string>; // question_id -> note text
}

export interface SubmitResponse {
  status: string;
  message: string;
  pillar_count: number;
}

export const questionnaireApi = {
  /** Fetch available WAF pillars */
  getPillars: () => get<{ pillars: PillarInfo[] }>('/api/questionnaire/pillars'),

  /** Fetch questions for selected pillars */
  getQuestions: (pillarIds: string[]) =>
    get<{ pillar_questions: PillarQuestions[] }>(
      `/api/questionnaire/questions?pillar_ids=${pillarIds.join(',')}`
    ),

  /** Submit assessment answers */
  submit: (payload: SubmitPayload) =>
    post<SubmitResponse>('/api/questionnaire/submit', payload),
};
