/**
 * API client — fetch wrapper with profile-based auth header injection.
 *
 * Sends ``X-Profile-Id`` so requests stay aligned with the selected local
 * profile context while the backend resolves credentials and saved data.
 *
 * KEY DESIGN DECISIONS:
 * 1. Sequential request queue — processes one request at a time to avoid
 *    overwhelming the backend with concurrent profile-scoped auth refresh and
 *    downstream collector work.
 * 2. Context-aware cancellation — when active profile changes,
 *    all pending requests are aborted and the queue is flushed.
 * 3. Every request tagged with a context key (profileId) to prevent
 *    stale responses from a different context leaking into the UI.
 */

import { API_BASE } from '../config';
import { sessionFetch } from './localSession';

// ── Active profile tracking ─────────────────────────────────────────
const ACTIVE_PROFILE_LS_KEY = 'azaudit_active_profile_id';

function loadPersistedProfileId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_LS_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

let activeProfileId: number | null = loadPersistedProfileId();

export function setActiveProfileId(id: number | null) {
  activeProfileId = id;
  try {
    if (id == null) {
      localStorage.removeItem(ACTIVE_PROFILE_LS_KEY);
    } else {
      localStorage.setItem(ACTIVE_PROFILE_LS_KEY, String(id));
    }
  } catch {
    // Ignore persistence failures.
  }
}

export function getActiveProfileId(): number | null {
  return activeProfileId;
}

// ── Context key — uniquely identifies the active profile ────────────
function getContextKey(): string {
  return `real:${activeProfileId ?? 'none'}`;
}

// ── Sequential request queue ────────────────────────────────────────
interface QueueItem {
  contextKey: string;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const requestQueue: QueueItem[] = [];
let processing = false;
let currentAbort: AbortController | null = null;

function getRequestTimeoutMs(path: string): number {
  // Pull-data heavy endpoints may legitimately take longer on large tenants.
  if (
    path.startsWith('/api/costs/')
    || path === '/api/security/cspm-insights'
    || path === '/api/insights'
    || path === '/api/insights/recommendations'
    || path === '/api/framework-insights'
  ) {
    return 480_000;
  }
  return 60_000;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!;

    // If the context has changed since this item was queued, skip it
    if (item.contextKey !== getContextKey()) {
      item.reject(new Error('Context changed — request cancelled'));
      continue;
    }

    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  processing = false;
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const contextKey = getContextKey();
  return new Promise<T>((resolve, reject) => {
    requestQueue.push({
      contextKey,
      execute: fn as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    processQueue();
  });
}

/**
 * Flush the queue and abort any in-flight request.
 * Called when active profile changes so that stale
 * requests from the previous context never land.
 */
export function flushRequestQueue(): void {
  // Abort the currently in-flight request
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }

  // Reject everything still in the queue
  const pending = requestQueue.splice(0);
  for (const item of pending) {
    item.reject(new Error('Context changed — request cancelled'));
  }

  processing = false;
}

// ── Core fetch (one request at a time via the queue) ────────────────

async function rawFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Attach profile id so backend can resolve credentials
  if (activeProfileId != null) {
    headers['X-Profile-Id'] = String(activeProfileId);
  }

  // Per-request abort — used by the queue to cancel in-flight requests
  const controller = new AbortController();
  currentAbort = controller;

  // Abort after endpoint-specific timeout to avoid indefinite loading.
  let didTimeout = false;
  const timeoutMs = getRequestTimeoutMs(path);
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await sessionFetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.detail || error.message || `API error: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (didTimeout) {
        throw new Error(`Request to ${path} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
      }
      throw new Error(`Request to ${path} was cancelled`);
    }
    if (err instanceof TypeError && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(`Cannot reach backend API at ${API_BASE}. Ensure the backend is running on port 8000.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (currentAbort === controller) {
      currentAbort = null;
    }
  }
}

/**
 * Make an API call, queued sequentially.
 * Each request waits for the previous one to finish before starting.
 */
function apiCall<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  return enqueue(() => rawFetch<T>(path, options));
}

/** GET request */
export function get<T = unknown>(path: string): Promise<T> {
  return apiCall<T>(path, { method: 'GET' });
}

/** POST request */
export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/** PUT request */
export function put<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiCall<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

/** DELETE request */
export function del<T = unknown>(path: string): Promise<T> {
  return apiCall<T>(path, { method: 'DELETE' });
}

/**
 * Direct fetch that BYPASSES the queue.
 * Use only for auth/profiles/health endpoints that should never be blocked
 * behind data-loading requests.
 */
export function directGet<T = unknown>(path: string): Promise<T> {
  return rawFetch<T>(path, { method: 'GET' });
}

export function directPost<T = unknown>(path: string, body: unknown): Promise<T> {
  return rawFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function directPut<T = unknown>(path: string, body: unknown): Promise<T> {
  return rawFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function directDel<T = unknown>(path: string): Promise<T> {
  return rawFetch<T>(path, { method: 'DELETE' });
}
