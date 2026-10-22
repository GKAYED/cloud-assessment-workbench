/**
 * InitiativeTimeline — Horizontal bar layout showing initiatives grouped by
 * quarter with relative bars representing priority / score.
 *
 * Recharts has no native Gantt so we render a horizontal BarChart where each
 * bar length is the prioritization score and the Y-axis is the initiative name.
 */

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';

interface InitiativeRow {
  name: string;
  score: number;
  priority: string;
  quarter?: string;
  status?: string;
}

interface InitiativeTimelineProps {
  data: InitiativeRow[];
  maxItems?: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#f87171',
  High: '#fbbf24',
  Medium: '#4f8ff7',
  Low: '#34d399',
};

export const InitiativeTimeline: React.FC<InitiativeTimelineProps> = ({ data, maxItems = 12 }) => {
  const sorted = [...data].sort((a, b) => b.score - a.score).slice(0, maxItems);

  return (
    <ChartCard title="Initiative Roadmap" subtitle="Prioritized by score — higher = more impactful">
      {sorted.length === 0 ? (
        <p className="empty-state">No initiatives scored yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(250, sorted.length * 36)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3347" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#9498a8', fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#9498a8', fontSize: 11 }}
              width={110}
            />
            <Tooltip
              contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 6, fontSize: 13 }}
              formatter={(value: number | string | undefined, _name: string | undefined, item: unknown) => {
                const payload = (item as { payload?: InitiativeRow } | undefined)?.payload;
                const numeric = Number(value ?? 0);
                return [
                  `${numeric.toFixed(0)} — ${payload?.priority ?? 'Unknown'}`,
                  payload?.quarter ?? 'Unscheduled',
                ];
              }}
            />
            <Bar dataKey="score" name="Score" radius={[0, 4, 4, 0]}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={PRIORITY_COLORS[entry.priority] ?? '#9498a8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
