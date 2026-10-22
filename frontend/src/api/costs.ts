import { get } from './client';
import type { CostRecord, CostRollup, CostSummary } from '../types';

function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asTrend(value: unknown): 'increasing' | 'decreasing' | 'stable' {
  return value === 'increasing' || value === 'decreasing' || value === 'stable'
    ? value
    : 'stable';
}

function normalizeMonth(value: unknown): string {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}/.test(text)) return text.slice(0, 7);
  if (/^\d{6}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
  return text;
}

function normalizeRollup(row: unknown): CostRollup {
  const data = (row as Record<string, unknown>) ?? {};
  return {
    group_key: String(data.group_key ?? ''),
    group_type: (data.group_type as CostRollup['group_type']) ?? 'subscription',
    subscription_id: data.subscription_id ? String(data.subscription_id) : undefined,
    cost_1m: num(data.cost_1m),
    cost_3m: num(data.cost_3m),
    cost_6m: num(data.cost_6m),
    currency: String(data.currency ?? 'USD'),
    trend: asTrend(data.trend),
    resource_count: num(data.resource_count),
    resource_name: data.resource_name ? String(data.resource_name) : undefined,
    resource_type: data.resource_type ? String(data.resource_type) : undefined,
    resource_group: data.resource_group ? String(data.resource_group) : undefined,
    subscription_name: data.subscription_name ? String(data.subscription_name) : undefined,
    amount: data.amount != null ? num(data.amount) : undefined,
  };
}

function normalizeRecord(row: unknown): CostRecord {
  const data = (row as Record<string, unknown>) ?? {};
  const c1 = num(data.cost_1m);
  const c3 = num(data.cost_3m);
  const c6 = num(data.cost_6m);
  return {
    resource_id: String(data.resource_id ?? ''),
    resource_name: String(data.resource_name ?? ''),
    resource_type: String(data.resource_type ?? ''),
    resource_group: String(data.resource_group ?? ''),
    subscription_id: String(data.subscription_id ?? ''),
    cost_1m: c1,
    cost_3m: c3,
    cost_6m: c6,
    currency: String(data.currency ?? 'USD'),
    trend: asTrend(data.trend),
    monthly_avg_3m: data.monthly_avg_3m != null ? num(data.monthly_avg_3m) : c3 / 3,
    monthly_avg_6m: data.monthly_avg_6m != null ? num(data.monthly_avg_6m) : c6 / 6,
  };
}

function normalizeSummary(raw: unknown): CostSummary {
  const data = (raw as Record<string, unknown>) ?? {};
  const total1m = num(data.total ?? data.total_cost_1m);
  const total3m = num(data.total_cost_3m);
  const total6m = num(data.total_cost_6m);

  const byMonthRaw = Array.isArray(data.by_month) ? data.by_month : [];
  const byMonth = byMonthRaw
    .map((entry) => {
      const row = (entry as Record<string, unknown>) ?? {};
      return {
        month: normalizeMonth(row.month),
        amount: num(row.amount),
      };
    })
    .filter((row) => row.month.length > 0);

  let derivedTrendPercent = 0;
  if (byMonth.length >= 2) {
    const previous = byMonth[byMonth.length - 2]?.amount ?? 0;
    const latest = byMonth[byMonth.length - 1]?.amount ?? 0;
    derivedTrendPercent = previous > 0 ? ((latest - previous) / previous) * 100 : 0;
  }

  const trendPercent = data.trend_percent != null ? num(data.trend_percent) : derivedTrendPercent;
  const overallTrend = asTrend(data.overall_trend ?? data.trend_direction);
  const trendDirection =
    data.trend_direction != null
      ? String(data.trend_direction)
      : trendPercent > 1
        ? 'increasing'
        : trendPercent < -1
          ? 'decreasing'
          : overallTrend;

  return {
    total_cost_1m: Number(total1m.toFixed(2)),
    total_cost_3m: Number(total3m.toFixed(2)),
    total_cost_6m: Number(total6m.toFixed(2)),
    total: Number(total1m.toFixed(2)),
    currency: String(data.currency ?? 'USD'),
    overall_trend: overallTrend,
    trend_direction: trendDirection,
    trend_percent: Number(trendPercent.toFixed(1)),
    top_cost_drivers: (Array.isArray(data.top_cost_drivers) ? data.top_cost_drivers : []) as CostRecord[],
    by_month: byMonth,
  };
}

async function byResource(): Promise<CostRecord[]> {
  const rows = await get<CostRecord[]>('/api/costs/by-resource');
  return rows.map((row) => normalizeRecord(row));
}

async function byResourceGroup(): Promise<CostRollup[]> {
  const rows = await get<CostRollup[]>('/api/costs/by-resource-group');
  return rows.map((row) => normalizeRollup(row));
}

async function bySubscription(): Promise<CostRollup[]> {
  const rows = await get<CostRollup[]>('/api/costs/by-subscription');
  return rows.map((row) => normalizeRollup(row));
}

async function byResourceType(): Promise<CostRollup[]> {
  const rows = await get<CostRollup[]>('/api/costs/by-resource-type');
  return rows.map((row) => normalizeRollup(row));
}

async function summary(): Promise<CostSummary> {
  const raw = await get<CostSummary>('/api/costs/summary');
  return normalizeSummary(raw);
}

export const costsApi = {
  byResource,
  byResourceGroup,
  bySubscription,
  byResourceType,
  summary,
};
