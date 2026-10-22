/**
 * formatters.ts — shared formatting helpers.
 */

/** Format a number as USD currency. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact number (e.g. 1.2K, 3.4M). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

/** Format ISO date string to locale date. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format ISO date string to locale date-time. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Title-case a string (e.g. "virtual_machine" → "Virtual Machine"). */
export function titleCase(s: string): string {
  return s
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Truncate string to max length with ellipsis. */
export function truncate(s: string, max: number = 60): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Percentage string. */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
