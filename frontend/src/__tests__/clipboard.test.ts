/** @vitest-environment jsdom */
import * as vitest from 'vitest';
import { copyElementAsImage } from '@/utils/clipboard';

const { describe, expect, it } = vitest;
const html2canvasMock = vitest.vi.hoisted(() => vitest.vi.fn());

vitest.vi.mock('html2canvas', () => ({
  default: html2canvasMock,
}));

const fakeCanvas = {
  toBlob: (callback: BlobCallback | null, type?: string) => {
    callback?.(new Blob(['png'], { type: type ?? 'image/png' }));
  },
  toDataURL: () => 'data:image/png;base64,ZmFrZQ==',
} as unknown as HTMLCanvasElement;

class FakeClipboardItem {
  readonly data: Record<string, Blob>;

  constructor(data: Record<string, Blob>) {
    this.data = data;
  }
}

function setClipboardSupport() {
  const writeSpy = vitest.vi.fn().mockResolvedValue(undefined);
  const writeTextSpy = vitest.vi.fn().mockResolvedValue(undefined);
  const clipboard = {
    write: writeSpy,
    writeText: writeTextSpy,
  } as unknown as Pick<Clipboard, 'write' | 'writeText'>;

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });

  Object.defineProperty(window, 'ClipboardItem', {
    configurable: true,
    value: FakeClipboardItem,
  });

  return { writeSpy, writeTextSpy };
}

function resetEnvironment() {
  document.body.innerHTML = '';
  html2canvasMock.mockReset();
  html2canvasMock.mockResolvedValue(fakeCanvas);
}

describe('copyElementAsImage', () => {
  it('copies diagram content as an image when rich clipboard support exists', async () => {
    resetEnvironment();
    const { writeSpy } = setClipboardSupport();

    const target = document.createElement('div');
    target.innerHTML = `
      <div style="width: 280px; height: 160px; background: rgb(255, 255, 255)">
        <button class="chart-copy-btn" type="button">Copy</button>
        <svg width="240" height="120" viewBox="0 0 240 120">
          <rect width="240" height="120" fill="#4f8ff7"></rect>
        </svg>
      </div>
    `;
    document.body.appendChild(target);

    const ok = await copyElementAsImage(target);

    expect(ok).toBe(true);
    expect(html2canvasMock.mock.calls.length).toBe(1);
    expect(writeSpy.mock.calls.length).toBe(1);
    const clipboardCall = writeSpy.mock.calls[0][0];
    expect(clipboardCall[0] instanceof FakeClipboardItem).toBe(true);
  });

  it('falls back to plain text when image clipboard support is unavailable', async () => {
    resetEnvironment();
    const { writeSpy, writeTextSpy } = setClipboardSupport();

    const target = document.createElement('div');
    target.innerHTML = '<div style="width: 160px; height: 90px; background: white">Diagram</div>';
    document.body.appendChild(target);

    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: undefined,
    });

    const ok = await copyElementAsImage(target);

    expect(ok).toBe(true);
    expect(writeSpy.mock.calls.length).toBe(0);
    expect(writeTextSpy.mock.calls[0][0]).toBe('[Image copied to clipboard]');
  });

  it('keeps an HTML image fallback when PNG clipboard writing fails', async () => {
    resetEnvironment();
    const { writeSpy, writeTextSpy } = setClipboardSupport();
    writeSpy
      .mockRejectedValueOnce(new Error('image/png rejected'))
      .mockResolvedValueOnce(undefined);

    const target = document.createElement('div');
    target.innerHTML = '<div style="width: 160px; height: 90px; background: white">Diagram</div>';
    document.body.appendChild(target);

    const ok = await copyElementAsImage(target);

    expect(ok).toBe(true);
    expect(writeSpy.mock.calls.length).toBe(2);
    expect(writeTextSpy.mock.calls.length).toBe(0);

    const fallbackCall = writeSpy.mock.calls[1][0];
    const fallbackItem = fallbackCall[0] as FakeClipboardItem;
    expect(Object.keys(fallbackItem.data).sort()).toEqual(['text/html', 'text/plain']);
  });
});
