/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLocalSession, sessionFetch } from '../api/localSession';
import { readModuleCache, writeModuleCache } from '../cache/moduleCache';

afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('local session evidence boundary', () => {
  it('uses session-only evidence and clears both new and legacy caches on lock', () => {
    sessionStorage.setItem('workbench-session-v1', 'synthetic-session');
    localStorage.setItem('azaudit_module_cache_legacy:real:1', 'synthetic evidence');
    writeModuleCache('real:1', 'inventory.summary', { total_resources: 1 });
    expect(readModuleCache('real:1','inventory.summary')).toEqual({ total_resources: 1 });
    expect(Object.keys(localStorage)).toEqual(['azaudit_module_cache_legacy:real:1']);
    clearLocalSession();
    expect(readModuleCache('real:1','inventory.summary')).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });
  it('discards an in-flight response after the operator locks', async () => {
    sessionStorage.setItem('workbench-session-v1', 'synthetic-session');
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const pending = sessionFetch('http://localhost:8000/api/profiles');
    clearLocalSession();
    finish(new Response('{}'));
    await expect(pending).rejects.toThrow('Local session changed');
  });
  it('does not lock the workbench when only cloud authentication expires', async () => {
    sessionStorage.setItem('workbench-session-v1', 'synthetic-session');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({detail:'Cloud authentication expired'}), {status:401})));
    await sessionFetch('http://localhost:8000/api/inventory/summary');
    expect(sessionStorage.getItem('workbench-session-v1')).toBe('synthetic-session');
  });
});
