/**
 * trendCalculator.ts — compute trend direction and percentage change.
 */

export type TrendDirection = 'increasing' | 'decreasing' | 'stable';

export interface TrendResult {
  direction: TrendDirection;
  changePercent: number;
  changeAbsolute: number;
}

/**
 * Compute trend between current and previous values.
 * @param current Current period value
 * @param previous Previous period value
 * @param threshold Minimum percentage change to count as increasing/decreasing (default 1%)
 */
export function computeTrend(
  current: number,
  previous: number,
  threshold: number = 1
): TrendResult {
  if (previous === 0) {
    return {
      direction: current > 0 ? 'increasing' : 'stable',
      changePercent: current > 0 ? 100 : 0,
      changeAbsolute: current,
    };
  }

  const changeAbsolute = current - previous;
  const changePercent = (changeAbsolute / Math.abs(previous)) * 100;

  let direction: TrendDirection = 'stable';
  if (changePercent > threshold) direction = 'increasing';
  else if (changePercent < -threshold) direction = 'decreasing';

  return { direction, changePercent: Math.round(changePercent * 10) / 10, changeAbsolute };
}

/**
 * Compute monthly trend from an array of { month, amount } records.
 * Returns trend comparing last month vs. the one before.
 */
export function computeMonthlyTrend(
  records: { month: string; amount: number }[]
): TrendResult | null {
  if (records.length < 2) return null;
  const sorted = [...records].sort((a, b) => a.month.localeCompare(b.month));
  const current = sorted[sorted.length - 1].amount;
  const previous = sorted[sorted.length - 2].amount;
  return computeTrend(current, previous);
}
