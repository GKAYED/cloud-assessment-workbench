import { get } from './client';
import type { AdvisorScoresResponse, AdvisorRecommendation, CspmInsightsResponse, DefenderScoreResponse } from '../types';

export const securityApi = {
  advisorScores: () => get<AdvisorScoresResponse>('/api/security/advisor-scores'),
  advisorRecommendations: () => get<AdvisorRecommendation[]>('/api/security/advisor-recommendations'),
  defenderScores: () => get<DefenderScoreResponse>('/api/security/defender-scores'),
  cspmInsights: () => get<CspmInsightsResponse>('/api/security/cspm-insights'),
};
