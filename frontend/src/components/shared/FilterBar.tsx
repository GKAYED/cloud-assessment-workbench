/**
 * FilterBar — shared search + select filter row.
 *
 * Renders an optional text search input followed by 0-N select dropdowns.
 * Each select gets an "All …" default option automatically.
 */

import React from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[] | string[];
  /** Placeholder for the "all" default option, e.g. "All Subscriptions" */
  allLabel?: string;
}

interface FilterBarProps {
  id?: string;
  className?: string;
  /** Text search input */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  filters?: FilterDef[];
  children?: React.ReactNode;
}

export function FilterBar({
  id,
  className,
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  filters,
  children,
}: FilterBarProps) {
  const cls = ['inventory-filters', className].filter(Boolean).join(' ');

  return (
    <div id={id} className={cls}>
      {onSearchChange != null && (
        <input
          aria-label={searchAriaLabel}
          className="inventory-filter-input"
          type="text"
          value={search ?? ''}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
        />
      )}
      {filters?.map((f, idx) => (
        <select
          key={idx}
          aria-label={f.ariaLabel}
          className="inventory-filter-select"
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
        >
          {f.allLabel && <option value="">{f.allLabel}</option>}
          {f.options.map((opt) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            return (
              <option key={val} value={val}>
                {lbl}
              </option>
            );
          })}
        </select>
      ))}
      {children}
    </div>
  );
}
