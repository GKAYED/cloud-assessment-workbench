/**
 * ResourceTypeDonut — pie/donut chart of resource count by type.
 */

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { ChartCard } from '../shared/ChartCard';

interface ResourceTypeDonutProps {
  distribution: Record<string, number>;
  maxSlices?: number;
  height?: number;
}

const COLORS = [
  '#4f8ff7', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#f472b6', '#60a5fa', '#818cf8', '#fb923c', '#38bdf8',
];

export const ResourceTypeDonut: React.FC<ResourceTypeDonutProps> = ({
  distribution,
  maxSlices = 8,
  height = 760,
}) => {
  const sorted = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1]);

  const top = sorted.slice(0, maxSlices);
  const otherCount = sorted.slice(maxSlices).reduce((sum, [, v]) => sum + v, 0);
  if (otherCount > 0) top.push(['Other', otherCount]);

  const total = top.reduce((sum, [, count]) => sum + count, 0);

  const data = top.map(([name, count]) => ({
    name: name.split('/').pop() ?? name,
    value: count,
  }));

  const renderOuterLabel = (props: { x?: number; y?: number; name?: string | number }) => {
    const { x, y, name } = props;
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    return (
      <text
        x={x}
        y={y}
        fill="#f3f4f6"
        fontSize={19}
        fontWeight={700}
        textAnchor={x > 0 ? 'start' : 'end'}
        dominantBaseline="central"
      >
        {`${name}`}
      </text>
    );
  };

  return (
    <ChartCard title="Resources by Type">
      {data.length === 0 ? (
        <p className="empty-state">No resource data</p>
      ) : (
        <div className="resource-type-donut">
          <div className="resource-type-donut__labels">
            {data.map((item, index) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.name} className="resource-type-donut__label">
                  <span
                    className="resource-type-donut__swatch"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="resource-type-donut__name">{`${item.name} (${item.value.toLocaleString()})`}</span>
                  <span className="resource-type-donut__pct">{pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="resource-type-donut__chart">
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="56%"
                  cy="52%"
                  innerRadius={120}
                  outerRadius={228}
                  paddingAngle={2}
                  label={renderOuterLabel}
                  labelLine={{ stroke: '#8ea2d9', strokeWidth: 1.5 }}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 6, fontSize: 13 }}
                  itemStyle={{ color: '#f3f4f6' }}
                  labelStyle={{ color: '#9498a8' }}
                  formatter={(value, name) => [value == null ? '0' : value.toLocaleString(), name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  );
};
