/**
 * SummaryBar — shared top-of-page metric row.
 *
 * Two rendering modes:
 *  - **items** (structured): renders label / big-number / optional note per item
 *  - **children** (simple): renders arbitrary content inside the bar
 */

import React from 'react';

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}

interface SummaryBarProps {
  id?: string;
  className?: string;
  items?: SummaryItem[];
  children?: React.ReactNode;
}

export function SummaryBar({ id, className, items, children }: SummaryBarProps) {
  const cls = ['summary-bar', className].filter(Boolean).join(' ');

  if (children) {
    return (
      <div id={id} className={cls}>
        {children}
      </div>
    );
  }

  return (
    <div id={id} className={cls}>
      {items?.map((item, idx) => (
        <div key={idx} className="summary-item">
          <span className="summary-label">{item.label}</span>
          <span className="big-number">{item.value}</span>
          {item.note && <span className="summary-note">{item.note}</span>}
        </div>
      ))}
    </div>
  );
}
