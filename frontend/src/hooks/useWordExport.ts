/**
 * useWordExport — exports the Assessment Report as a Word-compatible .doc file.
 *
 * Strategy
 * --------
 * 1. All chart cards (.chart-card) and the roadmap preview (.rpt-roadmap-preview)
 *    are snapshot-captured as PNG images via html2canvas.  This means every
 *    Recharts SVG, ResponsiveContainer, and custom chart component renders
 *    faithfully in Word without needing SVG support.
 *
 * 2. The report DOM is cloned, chart containers are replaced by <img> tags,
 *    and UI-only elements (copy buttons, CSV buttons, section-nav) are stripped.
 *
 * 3. The clone is embedded in a complete HTML document with embedded
 *    Word-friendly CSS (no CSS vars, light-theme colours).  The file is
 *    downloaded as .doc — Word, LibreOffice, and Google Docs all open HTML-
 *    based .doc files natively and allow further editing / splitting.
 *
 * Dynamic nature is preserved: every call captures the current live state of the
 * page, including any data loaded from the backend for the active profile.
 */

import { useCallback, useState } from 'react';

/** Inline CSS used in the generated Word document. */
const WORD_CSS = `
body {
  font-family: Calibri, Arial, "Helvetica Neue", sans-serif;
  font-size: 11pt;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
}
a { color: #2563eb; text-decoration: none; }
img { max-width: 100%; height: auto; display: block; }

/* ── Cover ── */
.rpt-cover {
  text-align: center;
  padding: 60pt 30pt 50pt;
  background: #f0f4fa;
  border: 1pt solid #c8d4e8;
  margin-bottom: 24pt;
  page-break-after: always;
}
.rpt-cover__inner { max-width: 480pt; margin: 0 auto; }
.rpt-cover__title { font-size: 24pt; font-weight: bold; margin: 0 0 6pt; letter-spacing: -0.5pt; }
.rpt-cover__client { font-size: 16pt; font-weight: 600; color: #2563eb; margin: 0 0 4pt; }
.rpt-cover__phase { font-size: 11pt; color: #555; margin: 0 0 3pt; }
.rpt-cover__date  { font-size: 10pt; color: #777; margin: 0 0 10pt; }
.rpt-cover__label {
  display: inline-block; font-size: 8pt; font-weight: bold; letter-spacing: 1pt;
  text-transform: uppercase; padding: 4pt 12pt;
  border: 2pt solid #d97706; color: #d97706;
}

/* ── TOC ── */
.rpt-toc {
  background: #f8f9fa;
  border: 1pt solid #e0e4ec;
  padding: 16pt 20pt;
  margin-bottom: 20pt;
  page-break-after: always;
}
.rpt-toc__heading { font-size: 13pt; font-weight: bold; margin: 0 0 8pt; }
.rpt-toc__list { list-style: none; padding: 0; margin: 0; }
.rpt-toc__list li { margin-bottom: 3pt; font-size: 10pt; }
.rpt-toc__link { text-decoration: none; color: #1a1a1a; }
.rpt-toc__num { font-weight: bold; color: #888; margin-right: 4pt; }

/* ── Sections ── */
.rpt-section {
  margin-bottom: 20pt;
  padding-bottom: 12pt;
  border-bottom: 1pt solid #e0e4ec;
  page-break-inside: avoid;
}
.rpt-section__header-row { display: block; }
.rpt-section__heading {
  font-size: 16pt; font-weight: bold;
  border-bottom: 3pt solid #2563eb;
  padding-bottom: 4pt; margin: 0 0 8pt;
}
.rpt-section__num {
  font-size: 9pt; background: #eef2ff; color: #2563eb;
  padding: 2pt 7pt; margin-right: 8pt; border-radius: 3pt;
}
.rpt-sub-heading {
  font-size: 12pt; font-weight: 700;
  border-bottom: 1pt solid #e0e4ec;
  padding-bottom: 3pt; margin: 12pt 0 5pt;
}
.rpt-sub-sub-heading { font-size: 11pt; font-weight: 600; margin: 10pt 0 4pt; color: #555; }
.rpt-section--appendix-heading { border-top: 2pt solid #e0e4ec; padding-top: 12pt; }

/* ── Narrative / description ── */
.rpt-narrative { font-size: 11pt; line-height: 1.6; margin-bottom: 8pt; }
.rpt-narrative--executive-copy { font-size: 12pt; }
.rpt-desc { font-size: 9pt; color: #555; line-height: 1.5; margin-bottom: 6pt; }

/* ── Hero grid ── */
.rpt-hero-grid { display: flex; flex-wrap: wrap; gap: 8pt; margin-bottom: 12pt; }
.rpt-hero-card {
  border: 1pt solid #e0e4ec; padding: 8pt 12pt;
  min-width: 72pt; flex: 1 1 72pt; background: #f8f9fa;
}
.rpt-hero-card__value { display: block; font-size: 18pt; font-weight: bold; }
.rpt-hero-card__label { display: block; font-size: 8pt; color: #777; margin-top: 2pt; }
.rpt-hero-card__meta  { display: block; font-size: 8pt; color: #aaa; }

/* ── Tables ── */
table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; font-size: 9pt; }
th {
  background: #eef2ff; font-weight: bold; text-align: left;
  padding: 5pt 7pt; border: 1pt solid #d0d8ec;
  word-break: normal;
}
  td { padding: 4pt 7pt; border: 1pt solid #d0d8ec; vertical-align: top; word-break: break-word; overflow-wrap: break-word; }
tr:nth-child(even) td { background: #f8f9fa; }
.rpt-mono { font-family: "Courier New", monospace; font-size: 8pt; }
.rpt-row-warn td { background: #fffbe6 !important; }
.rpt-positive { color: #15803d; font-weight: 600; }
.rpt-empty { color: #888; font-style: italic; }

/* ── KV grid ── */
.rpt-kv-grid { display: flex; flex-wrap: wrap; gap: 6pt; margin-bottom: 10pt; }
.rpt-kv {
  border: 1pt solid #e0e4ec; padding: 6pt 10pt;
  flex: 1 1 80pt; background: #f8f9fa;
}
.rpt-kv__label { display: block; font-size: 8pt; color: #888; }
.rpt-kv__value { display: block; font-size: 10pt; font-weight: 600; }

/* ── Cards ── */
.rpt-context-card { background: #f8f9fa; border: 1pt solid #e0e4ec; padding: 10pt; margin-bottom: 8pt; }
.rpt-context-grid { display: block; margin-bottom: 10pt; }
.rpt-stakeholder-card { border: 1pt solid #e0e4ec; padding: 10pt; margin-bottom: 8pt; background: #f8f9fa; }
.rpt-insight-item {
  border: 1pt solid #e0e4ec; border-left: 4pt solid #2563eb;
  padding: 8pt 12pt; margin-bottom: 8pt;
}
.rpt-insight-item--high { border-left-color: #ef4444; }
.rpt-insight-item--medium { border-left-color: #f59e0b; }
.rpt-insight-item--critical { border-left-color: #7c3aed; }

/* ── Callouts ── */
.rpt-callout {
  border: 1pt solid #e0e4ec; border-left: 4pt solid #d97706;
  padding: 8pt 12pt; margin-bottom: 10pt; background: #fffbe6;
}
.rpt-callout--note { border-left-color: #2563eb; background: #eff6ff; }
.rpt-callout--warn { border-left-color: #dc2626; background: #fef2f2; }

/* ── Badges ── */
.rpt-badge {
  display: inline-block; font-size: 8pt; padding: 2pt 6pt;
  border: 1pt solid #aaa; border-radius: 3pt;
}
.rpt-badge--critical { color: #7c3aed; border-color: #7c3aed; }
.rpt-badge--high     { color: #dc2626; border-color: #dc2626; }
.rpt-badge--medium   { color: #d97706; border-color: #d97706; }
.rpt-badge--low      { color: #15803d; border-color: #15803d; }
.sev-badge-critical { color: #7c3aed; font-weight: bold; font-size: 8pt; }
.sev-badge-high     { color: #dc2626; font-weight: bold; font-size: 8pt; }
.sev-badge-medium   { color: #d97706; font-weight: bold; font-size: 8pt; }
.sev-badge-low      { color: #15803d; font-weight: bold; font-size: 8pt; }

/* ── Exec-driver bars ── */
.exec-driver-grid { margin-bottom: 12pt; }
.exec-driver-list { }
.exec-driver-row { margin-bottom: 6pt; }
.exec-driver-meta { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 2pt; }
.exec-driver-track { background: #e0e4ec; height: 7pt; border-radius: 3pt; }
.exec-driver-fill  { background: #2563eb; height: 7pt; border-radius: 3pt; }

/* ── Images embedded by report ── */
.rpt-context-image { max-width: 100%; }
.rpt-context-image-card { margin-bottom: 8pt; }

/* ── Hide elements that should not appear in the Word doc ── */
.section-nav,
nav,
.rpt-section__copy-btn,
.rpt-csv-btn,
.rpt-export-grid,
.rpt-toolbar,
.btn,
button {
  display: none !important;
}

/* ── Print breaks ── */
@media print {
  .rpt-cover { page-break-after: always; }
  .rpt-toc   { page-break-after: always; }
  .rpt-section { page-break-inside: avoid; }
}
`;

export function useWordExport() {
  const [exporting, setExporting] = useState(false);

  const exportToWord = useCallback(
    async (elementId: string, filename: string = 'Cloud Assessment Workbench-Report') => {
      const element = document.getElementById(elementId);
      if (!element) return;

      setExporting(true);
      try {
        const html2canvas = (await import('html2canvas')).default;

        // ── 1. Clone the report DOM ─────────────────────────────────────
        const clone = element.cloneNode(true) as HTMLElement;

        // Attach clone to a hidden off-screen container so we can query it
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;';
        host.appendChild(clone);
        document.body.appendChild(host);

        try {
          // ── 2. Capture chart-cards as images ──────────────────────────
          // live elements: we capture from the real DOM for pixel-perfect render
          const liveChartCards = Array.from(
            element.querySelectorAll<HTMLElement>('.chart-card'),
          );
          const cloneChartCards = Array.from(
            clone.querySelectorAll<HTMLElement>('.chart-card'),
          );

          for (let i = 0; i < liveChartCards.length; i++) {
            try {
              const canvas = await html2canvas(liveChartCards[i], {
                backgroundColor: '#ffffff',
                scale: 1.5,
                useCORS: true,
                logging: false,
              });
              const dataUrl = canvas.toDataURL('image/png');
              const img = document.createElement('img');
              img.src = dataUrl;
              img.alt = liveChartCards[i].querySelector('.chart-card-title')?.textContent ?? 'chart';
              img.style.maxWidth = '100%';
              cloneChartCards[i]?.replaceWith(img);
            } catch {
              // leave chart as-is if canvas capture fails
            }
          }

          // ── 3. Capture roadmap / any SVG-heavy containers ─────────────
          const roadmapSelectors = ['.rpt-roadmap-preview', '.exec-driver-grid'];
          for (const sel of roadmapSelectors) {
            const liveEls = Array.from(element.querySelectorAll<HTMLElement>(sel));
            const cloneEls = Array.from(clone.querySelectorAll<HTMLElement>(sel));
            for (let i = 0; i < liveEls.length; i++) {
              // Only capture if the element contains an SVG or canvas
              if (!liveEls[i].querySelector('svg, canvas')) continue;
              try {
                const canvas = await html2canvas(liveEls[i], {
                  backgroundColor: '#ffffff',
                  scale: 1.5,
                  useCORS: true,
                  logging: false,
                });
                const dataUrl = canvas.toDataURL('image/png');
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = 'chart';
                img.style.maxWidth = '100%';
                cloneEls[i]?.replaceWith(img);
              } catch {
                // leave as-is
              }
            }
          }

          // ── 4. Strip remaining SVGs (e.g. inline PieChart not in ChartCard) ─
          clone.querySelectorAll('svg').forEach((svg) => {
            const wrapper = svg.closest('.recharts-wrapper') as HTMLElement | null;
            if (!wrapper) { svg.remove(); return; }
            // If already replaced by img above, wrapper will be gone
            const img = document.createElement('img');
            img.alt = 'chart';
            img.style.width = `${wrapper.offsetWidth || 300}px`;
            img.style.height = `${wrapper.offsetHeight || 200}px`;
            // Replace wrapper with placeholder text to avoid blank space
            wrapper.replaceWith(img);
          });

          // ── 5. Strip UI-only elements ─────────────────────────────────
          const stripSelectors = [
            '.rpt-section__copy-btn',
            '.rpt-csv-btn',
            '.section-nav',
            'nav[aria-label]',
            '.rpt-toolbar',
            '.rpt-export-grid',
            'button',
          ];
          for (const s of stripSelectors) {
            clone.querySelectorAll(s).forEach((el) => el.remove());
          }

          // ── 6. Build HTML document ────────────────────────────────────
          const htmlDoc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta name=ProgId content=Word.Document>
  <meta name=Generator content="Cloud Assessment Workbench Report">
  <title>${filename}</title>
  <!--[if gte mso 9]>
    <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom>
    <w:DoNotOptimizeForBrowser/></w:WordDocument></xml>
  <![endif]-->
  <style>${WORD_CSS}</style>
</head>
<body lang="EN-AU">
${clone.outerHTML}
</body>
</html>`;

          // ── 7. Download ───────────────────────────────────────────────
          const blob = new Blob(['\ufeff', htmlDoc], {
            type: 'application/msword',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${filename}.doc`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } finally {
          document.body.removeChild(host);
        }
      } finally {
        setExporting(false);
      }
    },
    [],
  );

  return { exportToWord, exporting };
}
