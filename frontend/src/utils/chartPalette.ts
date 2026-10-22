/**
 * Semantic chart color palettes by domain.
 * Each domain has a primary color, gradient array, and shared grid/label colors.
 *
 * Infrastructure constants use CSS custom properties so they adapt to the
 * active theme (light / dark) automatically. These should be used for all
 * Recharts CartesianGrid, XAxis/YAxis tick, and Tooltip styling.
 */

/* ── Grid & axis (theme-aware via CSS variables) ── */
/** CartesianGrid stroke — uses the theme border token */
export const CHART_GRID = 'var(--color-border)';
/** Axis tick fill — uses the muted-foreground token */
export const CHART_TICK_FILL = 'var(--color-muted-foreground)';
/** Bar/line label fill for text rendered outside/right of bars */
export const CHART_LABEL_FILL = 'var(--color-foreground)';

/** Recharts Tooltip contentStyle — adapts to popover background token */
export const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  color: 'var(--color-popover-foreground)',
} as const;

/** Recharts Tooltip labelStyle & itemStyle */
export const CHART_TOOLTIP_TEXT = { color: 'var(--color-popover-foreground)' } as const;

/* ── Legacy aliases (kept for backward compatibility) ── */
/** @deprecated Use CHART_LABEL_FILL instead */
export const CHART_LABEL_LIGHT = 'var(--color-foreground)';
/** @deprecated Use CHART_LABEL_FILL instead */
export const CHART_LABEL_DARK = 'var(--color-foreground)';

/* ── Cost domain — blue family ── */
export const COST_COLORS = ['#4f8ff7', '#60a5fa', '#7cb6ff', '#93c5fd', '#a5d8ff', '#bfdbfe', '#dbeafe'];
export const COST_PRIMARY = '#4f8ff7';

/* ── Security domain — rose family ── */
export const SECURITY_COLORS = ['#f87171', '#fb923c', '#fca5a5', '#fecaca', '#fee2e2'];
export const SECURITY_PRIMARY = '#f87171';

/* ── Inventory / asset domain — teal family ── */
export const INVENTORY_COLORS = ['#2dd4bf', '#5eead4', '#99f6e4', '#a7f3d0', '#ccfbf1'];
export const INVENTORY_PRIMARY = '#2dd4bf';

/* ── Framework / scoring domain — purple family ── */
export const FRAMEWORK_COLORS = ['#c084fc', '#a78bfa', '#818cf8', '#d8b4fe', '#e9d5ff'];
export const FRAMEWORK_PRIMARY = '#c084fc';

/* ── Governance — amber/orange (already distinct) ── */
export const GOVERNANCE_PRIMARY = '#f59e0b';

/* ── Licenses — blue/green pair ── */
export const LICENSE_PURCHASED = '#4f8ff7';
export const LICENSE_CONSUMED = '#34d399';
