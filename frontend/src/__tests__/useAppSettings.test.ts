/** @vitest-environment jsdom */
import { createElement, useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

localStorage.clear();
document.documentElement.removeAttribute('data-theme');

const appSettingsModule = await import('@/hooks/useAppSettings');
const { useAppSettings, getTheme } = appSettingsModule;

type AppSettingsState = {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
};

describe('useAppSettings / theme', () => {
  it('defaults to dark when no stored theme exists', () => {
    expect(getTheme()).toBe('dark');
  });

  it('updates and persists theme changes through the hook', async () => {
    let latest: AppSettingsState | null = null;

    function Probe() {
      const state = useAppSettings() as AppSettingsState;
      useEffect(() => { latest = state; }, [state]);
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    try {
      await act(async () => {
        root.render(createElement(Probe));
      });

      expect(latest!.theme).toBe('dark');
      expect(getTheme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      await act(async () => {
        latest?.setTheme('light');
      });

      expect(latest!.theme).toBe('light');
      expect(getTheme()).toBe('light');
      expect(localStorage.getItem('azaudit_theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      await act(async () => {
        latest?.toggleTheme();
      });

      expect(latest!.theme).toBe('dark');
      expect(getTheme()).toBe('dark');
      expect(localStorage.getItem('azaudit_theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
