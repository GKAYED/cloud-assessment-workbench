/**
 * CostTrendChart — area chart showing monthly cost trend over time.
 */

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { COST_PRIMARY, CHART_GRID } from '../../utils/chartPalette';

interface CostTrendChartProps {
  months: { month: string; amount: number }[];
  title?: string;
}

export const CostTrendChart: React.FC<CostTrendChartProps> = ({
  months,
  title = 'Monthly Cost Trend',
}) => {
  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const tickColor = isLightTheme ? '#475569' : '#9498a8';
  const gridColor = isLightTheme ? '#d7deeb' : CHART_GRID;
  const tooltipBg = isLightTheme ? '#ffffff' : '#1a1d27';
  const tooltipBorder = isLightTheme ? '#cbd5e1' : '#2e3347';
  const data = months.map((m) => ({ name: m.month, cost: m.amount }));

  return (
    <ChartCard title={title} subtitle="6-month history">
      {data.length === 0 ? (
        <p className="empty-state">No trend data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fill: tickColor, fontSize: 13 }} />
            <YAxis tick={{ fill: tickColor, fontSize: 13 }} />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6 }}
              formatter={(value: number | string | undefined) => {
                const numeric = Number(value ?? 0);
                return [`$${numeric.toLocaleString()}`, 'Cost'];
              }}
            />
            <Area
              type="monotone"
              dataKey="cost"
              stroke={COST_PRIMARY}
              fill={COST_PRIMARY}
              fillOpacity={isLightTheme ? 0.26 : 0.18}
              strokeWidth={3}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="cost"
                position="top"
                formatter={(value: unknown) => formatShortCurrency(Number(value ?? 0))}
                style={{ fill: tickColor, fontSize: 13, fontWeight: 600 }}
              />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};

function formatShortCurrency(value: number): string {
  if (value >= 1000) return `$${Math.round(value / 100) / 10}k`;
  return `$${Math.round(value)}`;
}
