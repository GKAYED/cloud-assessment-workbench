/**
 * RAGStatus — Red/Amber/Green status indicator with distinct shapes per status.
 * Shapes reinforce color for accessibility:
 *   green → circle, amber → diamond, red → square, grey → circle.
 */

import React from 'react';

interface RAGStatusProps {
  status: 'red' | 'amber' | 'green' | 'grey';
  label?: string;
  size?: number;
}

const shapes: Record<string, string> = {
  green: '50%',    // circle
  grey: '50%',     // circle
  amber: '2px',    // rotated → diamond
  red: '2px',      // square (slight rounding)
};

const colors: Record<string, string> = {
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#22c55e',
  grey: '#9ca3af',
};

export const RAGStatus: React.FC<RAGStatusProps> = ({
  status,
  label,
  size = 10,
}) => {
  const isDiamond = status === 'amber';

  return (
    <span className="rag-status">
      <span
        className="rag-dot"
        style={{
          width: size,
          height: size,
          backgroundColor: colors[status],
          borderRadius: shapes[status],
          display: 'inline-block',
          transform: isDiamond ? 'rotate(45deg)' : undefined,
        }}
      />
      {label && <span className="rag-label">{label}</span>}
    </span>
  );
};
