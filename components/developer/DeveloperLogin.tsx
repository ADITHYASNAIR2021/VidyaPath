'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

export default function DeveloperLogin({ onSuccess }: { onSuccess: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/developer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message || 'Login failed.');
        return;
      }
      setKey('');
      onSuccess();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto mt-16 max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-saffron-500" />
        <h1 className="font-fraunces text-xl font-bold text-[var(--color-text)]">Developer console</h1>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Enter the value of <code>DEVELOPER_DASHBOARD_KEY</code>. Students never need this.
      </p>
      <label className="mt-4 block text-xs font-semibold text-[var(--color-text-secondary)]" htmlFor="dev-key">
        Developer key
      </label>
      <input
        id="dev-key"
        type="password"
        autoComplete="current-password"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm text-[var(--color-text)]"
      />
      {error && (
        <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !key.trim()}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-saffron-500 px-4 py-2 text-sm font-semibold text-white hover:bg-saffron-600 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Unlock
      </button>
    </form>
  );
}
