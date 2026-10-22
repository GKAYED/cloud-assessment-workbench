/**
 * Clipboard utilities — copy tables as HTML and charts as images.
 *
 * Tables are copied as formatted HTML so they paste correctly into Word/Google Docs.
 * Charts are rendered to PNG via html2canvas and copied to the clipboard.
 */

type CopyTarget = HTMLElement | SVGElement;

const COPY_IGNORE_SELECTORS = [
  '.chart-copy-btn',
  '.table-export-button',
  '.rpt-section__copy-btn',
  '[data-copy-ignore="true"]',
  '[data-copy-ignore]',
];

function removeCopyControls(root: ParentNode) {
  COPY_IGNORE_SELECTORS.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => node.remove());
  });
}

function getClipboardItemCtor(): typeof ClipboardItem | null {
  if (typeof window === 'undefined') return null;
  return typeof window.ClipboardItem === 'function' ? window.ClipboardItem : null;
}

async function tryWriteRichClipboard(
  imageBlob: Blob,
  html: string,
  plainText: string,
): Promise<boolean> {
  const clipboardItemCtor = getClipboardItemCtor();
  if (!clipboardItemCtor || !navigator.clipboard?.write) return false;

  await navigator.clipboard.write([
    new clipboardItemCtor({
      'image/png': imageBlob,
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    }),
  ]);
  return true;
}

async function tryWriteHtmlClipboard(
  html: string,
  plainText: string,
): Promise<boolean> {
  const clipboardItemCtor = getClipboardItemCtor();
  if (!clipboardItemCtor || !navigator.clipboard?.write) return false;

  await navigator.clipboard.write([
    new clipboardItemCtor({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    }),
  ]);
  return true;
}

/**
 * Copy an HTML table element to the clipboard as both HTML and plain text.
 * The HTML version pastes into Word with formatting; plain text works in editors.
 */
export async function copyTableToClipboard(
  tableElement: HTMLTableElement,
): Promise<boolean> {
  try {
    const wrapper = document.createElement('div');
    const clone = tableElement.cloneNode(true) as HTMLTableElement;

    // Read current theme colors from CSS custom properties
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const textColor = cs.getPropertyValue('--color-text').trim() || '#1a1d27';
    const surfaceColor = cs.getPropertyValue('--color-surface').trim() || '#ffffff';
    const surface2Color = cs.getPropertyValue('--color-surface-2').trim() || '#f0f4f8';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#d4d8e3';

    // Apply inline styles for Word compatibility using current theme
    clone.style.borderCollapse = 'collapse';
    clone.style.fontFamily = 'Segoe UI, Arial, sans-serif';
    clone.style.fontSize = '10pt';
    clone.style.color = textColor;
    clone.style.backgroundColor = surfaceColor;
    clone.style.width = '100%';

    clone.querySelectorAll('th').forEach((th) => {
      th.style.backgroundColor = surface2Color;
      th.style.border = `1px solid ${borderColor}`;
      th.style.padding = '6px 10px';
      th.style.fontWeight = '600';
      th.style.textAlign = 'left';
      th.style.fontSize = '9pt';
      th.style.color = textColor;
    });

    clone.querySelectorAll('td').forEach((td) => {
      td.style.border = `1px solid ${borderColor}`;
      td.style.padding = '5px 10px';
      td.style.fontSize = '9pt';
      td.style.color = textColor;
    });

    // Remove sort icons from header cells
    clone.querySelectorAll('th svg, th .lucide').forEach((el) => el.remove());

    wrapper.appendChild(clone);
    const html = wrapper.innerHTML;

    // Build plain-text version from rows
    const rows = Array.from(clone.rows);
    const plain = rows
      .map((row) =>
        Array.from(row.cells)
          .map((cell) => cell.textContent?.trim() ?? '')
          .join('\t'),
      )
      .join('\n');

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Render a DOM element to a PNG image and copy it to the clipboard.
 * Temporarily forces a light background so the image looks correct on white paper.
 */
export async function copyElementAsImage(
  element: CopyTarget,
): Promise<boolean> {
  let wrapper: HTMLDivElement | null = null;
  try {
    const html2canvas = (await import('html2canvas')).default;

    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    const computedBg = getComputedStyle(element).backgroundColor;

    wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-100000px';
    wrapper.style.top = '0';
    wrapper.style.margin = '0';
    wrapper.style.padding = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.overflow = 'hidden';
    wrapper.style.backgroundColor = computedBg || 'transparent';
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;

    const clone = element.cloneNode(true) as CopyTarget;
    removeCopyControls(clone);

    if (clone instanceof HTMLElement) {
      clone.style.boxSizing = 'border-box';
      clone.style.width = `${width}px`;
      clone.style.minWidth = `${width}px`;
      clone.style.minHeight = `${height}px`;
      clone.style.margin = '0';
      clone.style.backgroundColor = 'transparent';
    } else {
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    const canvas = await html2canvas(wrapper, {
      backgroundColor: computedBg || null,
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;

    const dataUrl = canvas.toDataURL('image/png');
    const html = `<img src="${dataUrl}" alt="Copied image" />`;
    const plainText = '[Image copied to clipboard]';

    try {
      const ok = await tryWriteRichClipboard(blob, html, plainText);
      if (ok) return true;
    } catch {
      // Fall through to HTML/text fallback for browsers that reject image clipboard writes.
    }

    try {
      const ok = await tryWriteHtmlClipboard(html, plainText);
      if (ok) return true;
    } catch {
      // Fall through to a final text fallback.
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plainText);
      return true;
    }

    return false;
  } catch {
    return false;
  } finally {
    wrapper?.remove();
  }
}

/**
 * Copy a report section element to the clipboard as styled HTML + plain text.
 * Applies current-theme styles so the content matches what the user sees.
 */
export async function copySectionToClipboard(
  element: HTMLElement,
): Promise<boolean> {
  try {
    const clone = element.cloneNode(true) as HTMLElement;

    // Read current theme colors from CSS custom properties
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const textColor = cs.getPropertyValue('--color-text').trim() || '#1a1d27';
    const textSecondary = cs.getPropertyValue('--color-text-secondary').trim() || '#6b7280';
    const surfaceColor = cs.getPropertyValue('--color-surface').trim() || '#ffffff';
    const surface2Color = cs.getPropertyValue('--color-surface-2').trim() || '#f0f4f8';
    const borderColor = cs.getPropertyValue('--color-border').trim() || '#d4d8e3';
    const primaryColor = cs.getPropertyValue('--color-primary').trim() || '#4f8ff7';

    // Remove any copy buttons from the clone so they don't appear in the paste
    clone.querySelectorAll('.rpt-section__copy-btn').forEach((el) => el.remove());

    // Base font styles on the section wrapper
    clone.style.fontFamily = 'Segoe UI, Arial, sans-serif';
    clone.style.color = textColor;
    clone.style.backgroundColor = surfaceColor;

    // Style headings
    clone.querySelectorAll('h2').forEach((h) => {
      h.style.fontSize = '16pt';
      h.style.fontWeight = '700';
      h.style.margin = '0 0 8px';
      h.style.color = textColor;
      h.style.borderBottom = `3px solid ${primaryColor}`;
      h.style.paddingBottom = '4px';
    });
    clone.querySelectorAll('h3').forEach((h) => {
      h.style.fontSize = '12pt';
      h.style.fontWeight = '600';
      h.style.margin = '14px 0 6px';
      h.style.color = textColor;
    });
    clone.querySelectorAll('h4').forEach((h) => {
      h.style.fontSize = '11pt';
      h.style.fontWeight = '600';
      h.style.color = textColor;
    });

    // Style paragraphs
    clone.querySelectorAll('p').forEach((p) => {
      p.style.fontSize = '10pt';
      p.style.color = textColor;
      p.style.lineHeight = '1.6';
    });

    // Style tables
    clone.querySelectorAll('table').forEach((tbl) => {
      tbl.style.borderCollapse = 'collapse';
      tbl.style.width = '100%';
      tbl.style.fontSize = '9pt';
      tbl.style.margin = '8px 0';
    });
    clone.querySelectorAll('th').forEach((th) => {
      th.style.backgroundColor = surface2Color;
      th.style.border = `1px solid ${borderColor}`;
      th.style.padding = '5px 8px';
      th.style.fontWeight = '600';
      th.style.textAlign = 'left';
      th.style.color = textColor;
    });
    clone.querySelectorAll('td').forEach((td) => {
      td.style.border = `1px solid ${borderColor}`;
      td.style.padding = '4px 8px';
      td.style.color = textColor;
    });

    // Style badges
    clone.querySelectorAll('.rpt-badge').forEach((b) => {
      const el = b as HTMLElement;
      el.style.display = 'inline-block';
      el.style.padding = '2px 8px';
      el.style.borderRadius = '4px';
      el.style.fontSize = '9pt';
      el.style.fontWeight = '600';
    });

    // Style KV grids
    clone.querySelectorAll('.rpt-kv-grid').forEach((g) => {
      const el = g as HTMLElement;
      el.style.display = 'flex';
      el.style.flexWrap = 'wrap';
      el.style.gap = '12px';
      el.style.margin = '8px 0';
    });
    clone.querySelectorAll('.rpt-kv__label').forEach((l) => {
      const el = l as HTMLElement;
      el.style.fontSize = '8pt';
      el.style.color = textSecondary;
      el.style.display = 'block';
    });
    clone.querySelectorAll('.rpt-kv__value').forEach((v) => {
      const el = v as HTMLElement;
      el.style.fontSize = '14pt';
      el.style.fontWeight = '700';
      el.style.color = textColor;
      el.style.display = 'block';
    });

    const html = clone.innerHTML;
    const plain = clone.innerText;

    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
