/**
 * LicenseUsageChart — Grouped bar chart showing purchased vs consumed per SKU.
 */

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';
import { LICENSE_PURCHASED, LICENSE_CONSUMED, CHART_GRID } from '../../utils/chartPalette';

interface LicenseRow {
  sku_name: string;
  purchased: number;
  consumed: number;
}

interface LicenseUsageChartProps {
  data: LicenseRow[];
  maxItems?: number;
}

export const LicenseUsageChart: React.FC<LicenseUsageChartProps> = ({ data, maxItems = 10 }) => {
  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const tickColor = isLightTheme ? '#475569' : '#9498a8';
  const gridColor = isLightTheme ? '#d7deeb' : CHART_GRID;
  const tooltipBg = isLightTheme ? '#ffffff' : '#1a1d27';
  const tooltipBorder = isLightTheme ? '#cbd5e1' : '#2e3347';
  const tooltipText = isLightTheme ? '#0f172a' : '#e4e6ed';
  const purchasedColor = isLightTheme ? '#3b82f6' : LICENSE_PURCHASED;
  const consumedColor = isLightTheme ? '#10b981' : LICENSE_CONSUMED;
  const sliced = [...data]
    .sort((a, b) => b.purchased - a.purchased)
    .slice(0, maxItems)
    .reverse();

  const formatCount = (value: number | string | undefined) => Number(value ?? 0).toLocaleString();

  return (
    <ChartCard title="License Utilization" subtitle="Purchased vs consumed units">
      {sliced.length === 0 ? (
        <p className="empty-state">No license data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={420}>
          <BarChart
            data={sliced}
            layout="vertical"
            barCategoryGap={10}
            margin={{ top: 8, right: 28, bottom: 8, left: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              type="number"
              tick={{ fill: tickColor, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="sku_name"
              tick={{ fill: tickColor, fontSize: 12 }}
              width={220}
            />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 13 }}
              labelStyle={{ color: tooltipText }}
              itemStyle={{ color: tooltipText }}
              formatter={(value: number | string | undefined) => [formatCount(value), 'Seats']}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
            <Bar dataKey="purchased" name="Purchased" fill={purchasedColor} radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="purchased"
                position="right"
                formatter={(value: unknown) => formatCount(value as number | string | undefined)}
                style={{ fill: tickColor, fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
            <Bar dataKey="consumed" name="Consumed" fill={consumedColor} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
