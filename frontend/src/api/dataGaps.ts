import { del, get } from './client';
import type { DataGap } from '../types';

export const dataGapsApi = {
  list: async (): Promise<DataGap[]> => {
    const res = await get<{ gaps: DataGap[] }>('/api/data-gaps');
    return res.gaps ?? [];
  },
  clear: async (): Promise<void> => {
    await del('/api/data-gaps');
  },
};
