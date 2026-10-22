/**
 * usePdfExport — prints a report section by injecting a clone at <body> level
 * and calling window.print() on the *main* window.
 *
 * Root cause of the 0 KB / stuck-button problem with every popup approach:
 *   On Windows, Chrome's PDF driver writes the file asynchronously after the
 *   Save dialog closes.  Any call to win.close() — even inside afterprint —
 *   can race with that write and leave a 0 KB file.  Delaying close is not
 *   reliable: different drivers and OS builds have different flush timings.
 *
 * This approach eliminates the popup entirely:
 *   1. Clone the target element.
 *   2. Append the clone as a direct <body> child (outside .app-shell, so
 *      its overflow:hidden / overflow-y:auto constraints don't clip anything).
 *   3. Inject a <style> block that, inside @media print, hides every other
 *      direct <body> child and shows only the clone.
 *   4. Call window.print() — the *main* window, which is never closed.
 *   5. afterprint removes the injected nodes and resets state.
 *
 * No window is ever opened or closed, so there is no write-abort race and
 * no popup-blocker concern.
 */

import { useCallback, useState } from 'react';

const CONTAINER_ID = '__pdf-print-container';
const STYLE_ID     = '__pdf-print-style';

export function usePdfExport() {
  const [exporting, setExporting] = useState(false);

  const exportToPdf = useCallback(
    (elementId: string, filename: string = 'Cloud Assessment Workbench-Report') => {
      const element = document.getElementById(elementId);
      if (!element) return;

      setExporting(true);

      // Yield so the "Exporting…" label renders before we block the thread.
      setTimeout(() => {
        try {
          // ── 1. Clone + strip interactive elements ──────────────────
          const clone = element.cloneNode(true) as HTMLElement;
          for (const sel of [
            '.rpt-section__copy-btn',
            '.rpt-csv-btn',
            '.section-nav',
            'nav[aria-label]',
            '.rpt-toolbar',
            '.rpt-export-grid',
            'button',
          ]) {
            clone.querySelectorAll(sel).forEach(el => el.remove());
          }

          // ── 2. Inject clone at <body> level ─────────────────────────
          document.getElementById(CONTAINER_ID)?.remove();
          const container = document.createElement('div');
          container.id = CONTAINER_ID;
          container.appendChild(clone);
          document.body.appendChild(container);

          // ── 3. Inject @media print styles ──────────────────────────
          document.getElementById(STYLE_ID)?.remove();
          const styleEl = document.createElement('style');
          styleEl.id = STYLE_ID;
          styleEl.textContent = `
            /* On screen: keep the injected container invisible */
            #${CONTAINER_ID} { display: none !important; }

            @media print {
              /* Force light-theme CSS variables */
              :root {
                color-scheme: light;
                --color-bg: #ffffff;
                --color-surface: #ffffff;
                --color-surface-2: #f4f7fb;
                --color-border: #d0d8ec;
                --color-text: #111827;
                --color-text-primary: #111827;
                --color-text-secondary: #4b5563;
                --color-text-muted: #6b7280;
                --color-primary: #1d4ed8;
                --color-primary-hover: #1e40af;
                --color-success: #15803d;
                --color-warning: #b45309;
                --color-danger: #b91c1c;
                --color-info: #1d4ed8;
                --color-surface-elevated: #ffffff;
                --shadow: 0 1px 3px rgba(0,0,0,0.1);
              }

              /* Hide the entire React app; show only our clone */
              body > *:not(#${CONTAINER_ID}) { display: none !important; }

              #${CONTAINER_ID} {
                display: block !important;
                position: static !important;
                overflow: visible !important;
                width: 100% !important;
              }

              html, body {
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                height: auto !important;
                background: #ffffff !important;
                color: #111827 !important;
              }

              .rpt             { max-width: 100% !important; }
              .rpt-section     { page-break-inside: auto; }
              .rpt-section__heading,
              .rpt-sub-heading { page-break-after: avoid; }
              thead            { display: table-header-group; }
              tfoot            { display: table-footer-group; }
              tr               { page-break-inside: avoid; page-break-after: auto; }
              .rpt-table       { page-break-inside: auto; }

              @page { size: A4; margin: 20mm 15mm 25mm 15mm; }
            }
          `;
          document.head.appendChild(styleEl);

          // ── 4. Set suggested PDF filename via <title> ───────────────
          const prevTitle = document.title;
          document.title = filename;

          // ── 5. Print, then clean up after dialog closes ─────────────
          // In Chrome on Windows, window.print() blocks synchronously —
          // afterprint fires while print() is on the call stack and cleanup
          // runs before print() returns.  Nothing is ever closed, so
          // Chrome's PDF driver can finish writing without interruption.
          let cleaned = false;
          const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            document.getElementById(CONTAINER_ID)?.remove();
            document.getElementById(STYLE_ID)?.remove();
            document.title = prevTitle;
            setExporting(false);
          };

          window.addEventListener('afterprint', cleanup, { once: true });

          window.print();

          // Failsafe for browsers where afterprint doesn't fire (rare).
          // By the time this runs, cleaned is already true in Chrome,
          // so the guard prevents any double-cleanup.
          setTimeout(cleanup, 120_000);

        } catch {
          setExporting(false);
        }
      }, 200);
    },
    [],
  );

  return { exportToPdf, exporting };
}
