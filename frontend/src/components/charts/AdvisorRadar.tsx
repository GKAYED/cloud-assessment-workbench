/**
 * AdvisorRadar — radar chart for Azure Advisor 5-pillar scores.
 */

import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { SECURITY_PRIMARY, CHART_GRID } from '../../utils/chartPalette';

interface AdvisorRadarProps {
  scores: { category: string; score: number; max_score?: number }[];
}

export const AdvisorRadar: React.FC<AdvisorRadarProps> = ({ scores }) => {
  const data = scores.map((s) => ({
    pillar: s.category,
    score: s.score,
    fullMark: s.max_score ?? 100,
  }));

  return (
    <ChartCard title="Advisor Scores" subtitle="5-pillar assessment">
      {data.length === 0 ? (
        <p className="empty-state">No Advisor scores available</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke={CHART_GRID} />
            <PolarAngleAxis dataKey="pillar" tick={{ fill: '#9498a8', fontSize: 12 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#9498a8', fontSize: 10 }} />
            <Radar
              dataKey="score"
              stroke={SECURITY_PRIMARY}
              fill={SECURITY_PRIMARY}
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 6 }}
              labelStyle={{ color: '#e4e6ed' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
