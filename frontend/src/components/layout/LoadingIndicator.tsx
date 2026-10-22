/**
 * LoadingIndicator — skeleton-based loading state for pages and panels.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';

interface LoadingIndicatorProps {
  message?: string;
  compact?: boolean;
  className?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Loading...',
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'loading-indicator',
        compact && 'loading-indicator--compact',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-indicator__skeletons" aria-hidden="true">
        <Skeleton className="loading-indicator__skeleton loading-indicator__skeleton--lead" />
        <Skeleton className="loading-indicator__skeleton loading-indicator__skeleton--mid" />
        <Skeleton className="loading-indicator__skeleton loading-indicator__skeleton--tail" />
      </div>
      <span className="loading-indicator__message">{message}</span>
    </div>
  );
};
