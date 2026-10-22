/**
 * ScoreCard — displays a score value with gauge/label.
 */

import React from 'react';
import { toSentenceCase } from '../../utils/text';

interface ScoreCardProps {
  label: string;
  value: number;
  maxValue?: number;
  unit?: string;
  color?: string;
  showBar?: boolean;
  preserveLabelCase?: boolean;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  label,
  value,
  maxValue = 100,
  unit = '%',
  color,
  showBar = true,
  preserveLabelCase = false,
}) => {
  const safeMax = maxValue > 0 ? maxValue : 1;
  const percentage = Math.min((value / safeMax) * 100, 100);
  const barColor =
    color || (percentage >= 80 ? '#22c55e' : percentage >= 50 ? '#f59e0b' : '#ef4444');
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <div className="score-card">
      <div className="score-label">{preserveLabelCase ? label : toSentenceCase(label)}</div>
      <div className="score-value">
        {displayValue}
        <span className="score-unit">{unit}</span>
      </div>
      {showBar && (
        <div className="score-bar-bg">
          <div
            className="score-bar"
            style={{ width: `${percentage}%`, backgroundColor: barColor }}
          />
        </div>
      )}
    </div>
  );
};
