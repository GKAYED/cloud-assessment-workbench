/**
 * PortfolioMatrix — 2×2 scatter plot (Business Value vs Technical Fitness).
 *
 * Quadrants: Invest (high/high), Migrate (high BV / low TF),
 *            Tolerate (low BV / high TF), Eliminate (low/low).
 */

import React from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Label,
  LabelList,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';

interface PortfolioMatrixProps {
  apps: {
    app_name: string;
    business_value?: number | null;
    technical_fitness?: number | null;
    time_classification?: string | null;
  }[];
}

const TIME_COLORS: Record<string, string> = {
  Invest: '#1d4ed8', // strong blue
  Migrate: '#d97706', // strong orange
  Tolerate: '#059669', // strong green
  Eliminate: '#dc2626', // strong red
};

export const PortfolioMatrix: React.FC<PortfolioMatrixProps> = ({ apps }) => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const axisColor = theme === 'dark' ? '#cbd5e1' : '#1f2937';
  const gridStroke = theme === 'dark' ? '#4b5563' : '#d1d5db';
  const refLineStroke = theme === 'dark' ? '#9ca3af' : '#94a3b8';
  const labelColor = theme === 'dark' ? '#f8fafc' : '#0f172a';
  const pointStroke = theme === 'dark' ? '#f8fafc' : '#0f172a';

  const data = apps
    .filter((a) => a.business_value != null && a.technical_fitness != null)
    .map((a) => ({
      x: a.technical_fitness!,
      y: a.business_value!,
      name: a.app_name,
      time: a.time_classification ?? 'Unknown',
      fill: TIME_COLORS[a.time_classification ?? ''] ?? '#6b7280',
    }));

  return (
    <ChartCard title="TIME Classification Matrix" subtitle="Business Value vs Technical Fitness">
      {data.length === 0 ? (
        <p className="empty-state">Add business value & technical fitness scores to view matrix</p>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 5]}
              tick={{ fill: axisColor, fontSize: 12 }}
              name="Technical Fitness"
            >
              <Label value="Technical Fitness →" position="insideBottom" offset={-15} style={{ fill: labelColor, fontSize: 12 }} />
            </XAxis>
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 5]}
              tick={{ fill: axisColor, fontSize: 12 }}
              name="Business Value"
            >
              <Label value="Business Value →" angle={-90} position="insideLeft" style={{ fill: labelColor, fontSize: 12 }} />
            </YAxis>
            <ReferenceLine x={3.5} stroke={refLineStroke} strokeDasharray="6 4" />
            <ReferenceLine y={3.5} stroke={refLineStroke} strokeDasharray="6 4" />
            <Tooltip
              contentStyle={{
                background: theme === 'dark' ? '#1a1d27' : '#ffffff',
                color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
                border: `1px solid ${theme === 'dark' ? '#2e3347' : '#cbd5e1'}`,
                borderRadius: 6,
                fontSize: 13,
              }}
              formatter={(_value: unknown, name: string | undefined, item: unknown) => {
                const payload = (item as { payload?: { x?: number; y?: number; name?: string; time?: string } } | undefined)?.payload;
                if (name === 'x') return [payload?.x ?? 0, 'Tech Fitness'];
                if (name === 'y') return [payload?.y ?? 0, 'Business Value'];
                return [payload?.name ?? 'Unknown', payload?.time ?? 'Unknown'];
              }}
              labelFormatter={() => ''}
            />
            <Scatter data={data} fill="#4f8ff7">
              <LabelList
                dataKey="name"
                position="top"
                offset={-18}
                style={{
                  fill: theme === 'dark' ? '#f8fafc' : '#0f172a',
                  fontSize: 16,
                  fontWeight: 600,
                  textAnchor: 'middle',
                  pointerEvents: 'none',
                }}
                formatter={(value) => {
                  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
                  return text.length > 26 ? `${text.slice(0, 23)}...` : text;
                }}
              />
              {data.map((entry, i) => (
                <circle key={i} r={7} fill={entry.fill} stroke={pointStroke} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
