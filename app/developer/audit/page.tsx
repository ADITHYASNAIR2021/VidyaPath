'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface AuditEvent {
  id: string;
  type: string;
  createdAt: string;
  actor: string;
  action: string;
  metadata: Record<string, unknown>;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function DeveloperAuditPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<AuditEvent[]>([]);

  async function loadAudit() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, auditRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch('/api/developer/audit?limit=300', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }
      const body = await auditRes.json().catch(() => null);
      if (!auditRes.ok) {
        setError(body?.message || 'Failed to load audit feed.');
        setEvents([]);
        return;
      }
      const data = unwrap<{ events?: AuditEvent[] }>(body);
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError('Failed to load audit feed.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit();
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/developer" label="Console" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-violet-600" />
            Audit Log
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Platform audit history across admin and developer actions.</p>
        </div>
        <button
          onClick={() => void loadAudit()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading audit feed...
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No audit events available.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</p>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">{event.type}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-gray-900">{event.actor}</p>
              <p className="text-sm text-[#4A4A6A]">{event.action}</p>
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-indigo-700">View metadata</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-[#E8E4DC] bg-[#FCFAF6] p-3 text-[11px] text-[#4A4A6A]">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
