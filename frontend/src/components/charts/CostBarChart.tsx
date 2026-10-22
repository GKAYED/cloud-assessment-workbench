/**
 * CostBarChart — horizontal bar chart of top cost drivers.
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
import { COST_COLORS, CHART_GRID } from '../../utils/chartPalette';

interface CostBarChartProps {
  drivers: { resource_type: string; cost_1m: number }[];
  title?: string;
  maxItems?: number;
}

const COLORS = COST_COLORS;

export const CostBarChart: React.FC<CostBarChartProps> = ({
  drivers,
  title = 'Top Cost Drivers',
  maxItems = 7,
}) => {
  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const tickColor = isLightTheme ? '#475569' : '#9498a8';
  const gridColor = isLightTheme ? '#d7deeb' : CHART_GRID;
  const tooltipBg = isLightTheme ? '#ffffff' : '#1a1d27';
  const tooltipBorder = isLightTheme ? '#cbd5e1' : '#2e3347';
  const tooltipText = isLightTheme ? '#0f172a' : '#e4e6ed';
  const data = drivers.slice(0, maxItems).map((d) => ({
    name: `${d.resource_type.split('/').pop() ?? d.resource_type} (${formatCurrencyShort(d.cost_1m)})`,
    cost: d.cost_1m,
  }));

  return (
    <ChartCard title={title} subtitle="Last 30 days">
      {data.length === 0 ? (
        <p className="empty-state">No cost data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ left: 92, right: 18, top: 6, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
            <XAxis type="number" tick={{ fill: tickColor, fontSize: 13 }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: tickColor, fontSize: 13 }}
              width={120}
            />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6 }}
              labelStyle={{ color: tooltipText }}
              itemStyle={{ color: tooltipText }}
              formatter={(value: number | string | undefined) => {
                const numeric = Number(value ?? 0);
                return [`$${numeric.toLocaleString()}`, 'Cost'];
              }}
            />
            <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};

function formatCurrencyShort(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
