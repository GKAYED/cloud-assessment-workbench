import { API_BASE } from '../config';

const KEY = 'workbench-session-v1';
export const SESSION_CHANGED = 'workbench-session-changed';

export function getLocalSession(): string | null {
  return sessionStorage.getItem(KEY);
}

export function clearLocalSession(): void {
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export async function unlockLocalSession(key: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/session/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!response.ok) throw new Error('Unable to unlock. Check the key and that the backend is running.');
  const data = await response.json() as { token: string };
  sessionStorage.setItem(KEY, data.token);
  window.dispatchEvent(new Event(SESSION_CHANGED));
}

export async function sessionFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getLocalSession();
  const headers = new Headers(init.headers);
  if (token) headers.set('X-Workbench-Session', token);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    // Cloud authentication can also return 401; only lock for a local session error.
    const error = await response.clone().json().catch(() => ({})) as { detail?: string };
    if (error.detail === 'Local session required or expired' && token === getLocalSession()) {
      clearLocalSession();
    }
  }
  return response;
}

export async function lockLocalSession(): Promise<void> {
  const response = await sessionFetch(`${API_BASE}/api/session/lock`, { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error('Unable to lock backend. Stop the backend to revoke access.');
  clearLocalSession();
}
