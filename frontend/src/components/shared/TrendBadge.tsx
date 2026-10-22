/**
 * TrendBadge — shows increasing/decreasing/stable indicator.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface TrendBadgeProps {
  trend: 'increasing' | 'decreasing' | 'stable';
  label?: string;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({ trend, label }) => {
  const config = {
    increasing: { icon: TrendingUp, className: 'trend-up', text: 'Increasing' },
    decreasing: { icon: TrendingDown, className: 'trend-down', text: 'Decreasing' },
    stable: { icon: Minus, className: 'trend-stable', text: 'Stable' },
  };

  const { icon: Icon, className, text } = config[trend];

  return (
    <span className={`trend-badge ${className}`}>
      <Icon size={14} />
      <span>{label || text}</span>
    </span>
  );
};
