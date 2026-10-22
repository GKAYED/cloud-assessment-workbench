import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { getLocalSession, lockLocalSession, SESSION_CHANGED, unlockLocalSession } from '../api/localSession';

export function LocalSessionBoundary({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(getLocalSession);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const update = () => setSession(getLocalSession());
    window.addEventListener(SESSION_CHANGED, update);
    return () => window.removeEventListener(SESSION_CHANGED, update);
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlockLocalSession(key.trim());
      setKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock');
    } finally {
      setBusy(false);
    }
  }

  if (session) return <div key={session}>
    <div style={{ padding: '8px 16px', textAlign: 'right' }}>
      <button type="button" className="btn" onClick={() => {
        void lockLocalSession().catch(() => setError('Unable to lock. Stop the backend to revoke access.'));
      }}>Lock workbench</button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
    {children}
  </div>;

  return <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24 }}>
    <h1>Unlock your workbench</h1>
    <p>Open <code>workbench-unlock.key</code> in the backend folder and paste its contents below.
      The key changes whenever the backend restarts.</p>
    <form onSubmit={(event) => { void unlock(event); }}>
      <label htmlFor="local-key">Local unlock key</label>
      <input id="local-key" type="password" autoComplete="off" value={key}
        onChange={(event) => setKey(event.target.value)} required
        style={{ display: 'block', width: '100%', margin: '12px 0', padding: 10 }} />
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
    <p>This local session lasts eight hours and grants access to all profiles on this workstation.
      Microsoft sign-in is separate and is required only to collect cloud data.</p>
  </main>;
}
