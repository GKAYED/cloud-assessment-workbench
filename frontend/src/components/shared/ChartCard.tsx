/**
 * ChartCard — wrapper for recharts components with title/subtitle.
 *
 * Can render simple bar/area/line charts via props, or wrap custom
 * chart components as children.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { copyElementAsImage } from '../../utils/clipboard';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface ChartCardProps {
  id?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
  /** Quick-render mode: pass data + keys + chartType to skip children */
  data?: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
  chartType?: 'bar' | 'area' | 'line';
  height?: number;
  barLabelMode?: 'axis' | 'inside' | 'vertical-inside';
  valueFormatter?: (value: number) => string;
  xAxisInterval?: number | 'preserveStart' | 'preserveEnd' | 'preserveStartEnd' | 'equidistantPreserveStart';
  xTickAngle?: number;
  xTickHeight?: number;
}

const CHART_COLOR = '#4f8ff7';
const GRID_COLOR = '#2e3347';

export const ChartCard: React.FC<ChartCardProps> = ({
  id,
  title,
  subtitle,
  children,
  className = '',
  headerActions,
  data,
  xKey = 'name',
  yKey = 'value',
  chartType = 'bar',
  height = 250,
  barLabelMode = 'axis',
  valueFormatter,
  xAxisInterval,
  xTickAngle = 0,
  xTickHeight,
}) => {
  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const tickColor = isLightTheme ? '#475569' : '#9498a8';
  const tooltipBg = isLightTheme ? '#ffffff' : '#1a1d27';
  const tooltipBorder = isLightTheme ? '#cbd5e1' : '#2e3347';
  const tooltipText = isLightTheme ? '#0f172a' : '#e4e6ed';
  const gridColor = isLightTheme ? '#d7deeb' : GRID_COLOR;
  const cardRef = useRef<HTMLDivElement>(null);
  const copyTargetRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyImage = useCallback(async () => {
    if (!copyTargetRef.current) return;
    const ok = await copyElementAsImage(copyTargetRef.current);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, []);
  const renderInsideBarLabel = (props: {
    x?: string | number;
    y?: string | number;
    width?: string | number;
    height?: string | number;
    index?: number;
    value?: unknown;
  }) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const index = Number(props.index ?? 0);
    const row = data?.[index] ?? {};
    const name = String(row[xKey] ?? props.value ?? '');
    const numericValue = Number(row[yKey] ?? 0);
    const label = `${name} (${valueFormatter ? valueFormatter(numericValue) : numericValue.toLocaleString()})`;
    const placeOutside = width < 180;
    return (
      <text
        x={placeOutside ? x + width + 8 : x + 12}
        y={y + height / 2}
        fill={placeOutside ? (isLightTheme ? '#334155' : '#cbd5e1') : '#f8fafc'}
        fontSize={12}
        fontWeight={600}
        dominantBaseline="middle"
        textAnchor="start"
      >
        {label}
      </text>
    );
  };

  const renderVerticalInsideBarLabel = (props: {
    x?: string | number;
    y?: string | number;
    height?: string | number;
    width?: string | number;
    value?: unknown;
    index?: number;
  }) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const height = Number(props.height ?? 0);
    const width = Number(props.width ?? 0);
    const index = Number(props.index ?? 0);
    const row = data?.[index] ?? {};
    const name = String(row[xKey] ?? '');
    const numericValue = Number(props.value ?? 0);
    const label = `${name} (${valueFormatter ? valueFormatter(numericValue) : numericValue.toLocaleString()})`;
    const anchorX = x + width / 2;
    const anchorY = y + height - 8;
    return (
      <text
        x={anchorX}
        y={anchorY}
        fill={isLightTheme ? '#0f172a' : '#f8fafc'}
        fontSize={13}
        fontWeight={700}
        textAnchor="start"
        dominantBaseline="hanging"
        transform={`rotate(-90, ${anchorX}, ${anchorY})`}
      >
        {label}
      </text>
    );
  };

  const renderQuickChart = () => {
    if (!data || data.length === 0) return <p className="empty-state">No data</p>;

    const common = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: tickColor, fontSize: 12 }}
          interval={xAxisInterval}
          angle={xTickAngle}
          height={xTickHeight}
        />
        <YAxis tick={{ fill: tickColor, fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 13 }}
          labelStyle={{ color: tooltipText }}
          itemStyle={{ color: tooltipText }}
        />
      </>
    );

    if (chartType === 'area') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            {common}
            <Area type="monotone" dataKey={yKey} stroke={CHART_COLOR} fill={CHART_COLOR} fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            {common}
            <Line type="monotone" dataKey={yKey} stroke={CHART_COLOR} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout={barLabelMode === 'inside' ? 'vertical' : 'horizontal'}
          margin={barLabelMode === 'inside'
            ? { top: 8, right: 220, bottom: 8, left: 12 }
            : barLabelMode === 'vertical-inside'
              ? { top: 28, right: 12, bottom: 8, left: 12 }
              : undefined}
        >
          {barLabelMode === 'inside' ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis type="number" tick={{ fill: tickColor, fontSize: 12 }} domain={[0, 'auto']} />
              <YAxis type="category" dataKey={xKey} hide />
              <Tooltip
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 13 }}
                labelStyle={{ color: tooltipText }}
                itemStyle={{ color: tooltipText }}
                formatter={(value: unknown) => {
                  const numericValue = Number(value ?? 0);
                  return [valueFormatter ? valueFormatter(numericValue) : numericValue.toLocaleString(), String(yKey)];
                }}
              />
            </>
          ) : barLabelMode === 'vertical-inside' ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey={xKey} hide />
              <YAxis tick={{ fill: tickColor, fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 6, fontSize: 13 }}
                labelStyle={{ color: tooltipText }}
                itemStyle={{ color: tooltipText }}
                formatter={(value: unknown) => {
                  const numericValue = Number(value ?? 0);
                  return [valueFormatter ? valueFormatter(numericValue) : numericValue.toLocaleString(), String(yKey)];
                }}
              />
            </>
          ) : common}
          <Bar dataKey={yKey} fill={CHART_COLOR} radius={barLabelMode === 'inside' ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
            {barLabelMode === 'inside' && (
              <LabelList
                dataKey={xKey}
                content={renderInsideBarLabel}
              />
            )}
            {barLabelMode === 'vertical-inside' && (
              <LabelList
                dataKey={yKey}
                content={renderVerticalInsideBarLabel}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div id={id} className={`chart-card ${className}`} ref={cardRef}>
      <div className="chart-card-header">
        <div className="chart-card-header-row">
          <div>
            <h3 className="chart-card-title">{title}</h3>
            {subtitle && <p className="chart-card-subtitle">{subtitle}</p>}
          </div>
          <div className="chart-card-header-actions">
            {headerActions}
            <button
              type="button"
              className="chart-copy-btn"
              onClick={handleCopyImage}
              title="Copy chart as image"
            >
              {copied ? <Check size={14} /> : <Camera size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
      <div className="chart-card-body" ref={copyTargetRef}>
        {data ? renderQuickChart() : children}
      </div>
    </div>
  );
};
