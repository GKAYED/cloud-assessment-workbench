import { get } from './client';
import type { ExecutiveInsight } from '../types';

export const insightsApi = {
  list: async (): Promise<ExecutiveInsight[]> => {
    const res = await get<{ insights: ExecutiveInsight[] }>('/api/insights');
    return res.insights ?? [];
  },
  recommendations: async () => {
    const res = await get<{ recommendations: unknown[] }>('/api/insights/recommendations');
    return res.recommendations ?? [];
  },
};
