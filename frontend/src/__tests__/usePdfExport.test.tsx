/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePdfExport } from '../hooks/usePdfExport';

it('prepares report-only printing and cleans up after the dialog closes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const oldTitle = document.title;
  let printedText: string | null | undefined;
  let printedButtons = -1;
  const print = vi.spyOn(window, 'print').mockImplementation(() => {
    const report = document.getElementById('__pdf-print-container');
    printedText = report?.textContent;
    printedButtons = report?.querySelectorAll('button').length ?? -1;
    window.dispatchEvent(new Event('afterprint'));
  });
  function Harness() {
    const { exportToPdf } = usePdfExport();
    return <><section id="test-report">Synthetic assessment: 200<button>Edit</button></section>
      <button id="test-export" onClick={() => exportToPdf('test-report', 'Synthetic report')}>Export</button></>;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => document.getElementById('test-export')?.click());
    await act(async () => vi.advanceTimersByTime(200));
    expect(print).toHaveBeenCalledOnce();
    expect(printedText).toContain('Synthetic assessment: 200');
    expect(printedButtons).toBe(0);
    expect(document.getElementById('__pdf-print-container')).toBeNull();
    expect(document.getElementById('__pdf-print-style')).toBeNull();
    expect(document.title).toBe(oldTitle);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
