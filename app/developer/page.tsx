'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import DeveloperLogin from '@/components/developer/DeveloperLogin';
import DeveloperDashboard from '@/components/developer/DeveloperDashboard';

type SessionState = { loading: true } | { loading: false; enabled: boolean; keyStatus: string; authenticated: boolean };

export default function DeveloperPage() {
  const [session, setSession] = useState<SessionState>({ loading: true });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/developer/session', { cache: 'no-store' });
      const payload = await response.json();
      setSession({ loading: false, enabled: !!payload.enabled, keyStatus: String(payload.keyStatus), authenticated: !!payload.authenticated });
    } catch {
      setSession({ loading: false, enabled: false, keyStatus: 'error', authenticated: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-7xl">
        {session.loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : !session.enabled ? (
          <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text)]">
            <h1 className="font-fraunces text-xl font-bold">Developer console is disabled</h1>
            <p className="mt-2 text-[var(--color-text-secondary)]">
              {session.keyStatus === 'too-short'
                ? 'DEVELOPER_DASHBOARD_KEY is set but shorter than 24 characters.'
                : 'Set DEVELOPER_DASHBOARD_KEY (24+ random characters) in the server environment and restart to enable it.'}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--color-surface-soft)] p-3 text-xs">
              node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(24).toString(&apos;base64url&apos;))&quot;
            </pre>
          </div>
        ) : session.authenticated ? (
          <DeveloperDashboard onLogout={() => void refresh()} />
        ) : (
          <DeveloperLogin onSuccess={() => void refresh()} />
        )}
      </div>
    </div>
  );
}
