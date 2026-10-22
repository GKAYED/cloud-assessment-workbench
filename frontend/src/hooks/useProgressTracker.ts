/**
 * useProgressTracker — tracks loading state of all modules.
 */

import { useState, useCallback } from 'react';
import type { ModuleName } from '../types';

interface ModuleProgress {
  status: 'pending' | 'loading' | 'success' | 'error';
  message?: string;
}

type ProgressMap = Partial<Record<ModuleName, ModuleProgress>>;

const defaultModules: ModuleName[] = [
  'inventory',
  'inventory_summary',
  'databases',
  'costs',
  'cost_summary',
  'security',
  'integrations',
  'dynamics',
  'bc_stats',
  'licenses',
  'data_gaps',
  'insights',
  'portfolio',
  'initiatives',
];

function buildProgressMap(modules: ModuleName[]): ProgressMap {
  return modules.reduce((acc, module) => {
    acc[module] = { status: 'pending' };
    return acc;
  }, {} as ProgressMap);
}

export function useProgressTracker(trackedModules: ModuleName[] = defaultModules) {
  const [progress, setProgress] = useState<ProgressMap>(() => buildProgressMap(trackedModules));

  const updateModule = useCallback(
    (module: ModuleName, update: ModuleProgress) => {
      setProgress((prev) => {
        if (!(module in prev)) return prev;
        return { ...prev, [module]: update };
      });
    },
    []
  );

  const resetAll = useCallback(() => {
    setProgress(buildProgressMap(trackedModules));
  }, [trackedModules]);

  const completedCount = Object.values(progress).filter(
    (m) => m?.status === 'success' || m?.status === 'error'
  ).length;

  const totalCount = trackedModules.length;

  const overallPercentage = Math.round((completedCount / totalCount) * 100);

  const isComplete = completedCount === totalCount;

  const hasErrors = Object.values(progress).some((m) => m?.status === 'error');

  return {
    progress,
    updateModule,
    resetAll,
    completedCount,
    totalCount,
    overallPercentage,
    isComplete,
    hasErrors,
  };
}
