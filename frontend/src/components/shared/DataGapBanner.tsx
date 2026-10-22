/**
 * DataGapBanner — yellow warning banner shown when data gaps exist.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DataGapBannerProps {
  count: number;
  onClick?: () => void;
}

export const DataGapBanner: React.FC<DataGapBannerProps> = ({
  count,
  onClick,
}) => {
  if (count === 0) return null;

  return (
    <div className="data-gap-banner" onClick={onClick} role="button" tabIndex={0}>
      <AlertTriangle size={16} />
      <span>
        {count} data gap{count !== 1 ? 's' : ''} detected. Some information
        may be incomplete.{' '}
        {onClick && <strong>View details →</strong>}
      </span>
    </div>
  );
};
