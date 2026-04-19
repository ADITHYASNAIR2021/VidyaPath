'use client';

import { useEffect, useState } from 'react';
import { Activity, RefreshCw, Send } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface AlertItem {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'ok' | 'warn' | 'critical';
  message: string;
  metric: number;
  threshold: number;
}

interface ObservabilitySummary {
  generatedAt: string;
  windowHours: number;
  counters: {
    authFailures: number;
    fiveXxEvents: number;
    blockedThrottleBuckets: number;
    totalTokens: number;
    auditEvents: number;
    authEvents: number;
    activeThrottleBuckets: number;
    tokenEvents: number;
  };
  alerts: AlertItem[];
}

interface DispatchPayload {
  delivered: boolean;
  skippedReason?: string;
  destination?: string;
  responseStatus?: number;
  triggeredAlerts: AlertItem[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function DeveloperObservabilityPage() {
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchPayload | null>(null);

  async function loadSummary() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, summaryRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch('/api/developer/observability/summary?hours=24', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }
      const body = await summaryRes.json().catch(() => null);
      if (!summaryRes.ok) {
        setError(body?.message || 'Failed to load observability summary.');
        setSummary(null);
        return;
      }
      setSummary(unwrap<ObservabilitySummary>(body));
    } catch {
      setError('Failed to load observability summary.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  async function dispatchAlerts() {
    setDispatching(true);
    setError('');
    try {
      const response = await fetch('/api/developer/observability/dispatch?hours=24', { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to dispatch alerts.');
        return;
      }
      const data = unwrap<{ summary?: ObservabilitySummary; dispatch?: DispatchPayload }>(body);
      if (data.summary) setSummary(data.summary);
      setDispatchResult(data.dispatch || null);
    } catch {
      setError('Failed to dispatch alerts.');
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/developer" label="Console" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Activity className="h-6 w-6 text-violet-600" />
            Observability
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Auth anomaly, 5xx, throttle, and token pressure health view.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadSummary()}
            disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </span>
          </button>
          <button
            onClick={() => void dispatchAlerts()}
            disabled={dispatching || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {dispatching ? 'Dispatching...' : 'Dispatch Alerts'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {dispatchResult && (
        <div className="mb-4 rounded-xl border border-[#E8E4DC] bg-white px-4 py-3 text-sm text-[#4A4A6A]">
          <p className="font-semibold text-[#1C1C2E]">
            {dispatchResult.delivered
              ? `Alert dispatch delivered (${dispatchResult.triggeredAlerts.length} alert(s)).`
              : `Dispatch skipped (${dispatchResult.skippedReason || 'unknown'}).`}
          </p>
          {dispatchResult.destination && <p className="text-xs mt-1">Destination: {dispatchResult.destination}</p>}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading summary...
        </div>
      ) : !summary ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No observability summary available.
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Auth Failures</p><p className="text-xl font-semibold">{summary.counters.authFailures}</p></div>
            <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">5xx Events</p><p className="text-xl font-semibold">{summary.counters.fiveXxEvents}</p></div>
            <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Throttle Blocks</p><p className="text-xl font-semibold">{summary.counters.blockedThrottleBuckets}</p></div>
            <div className="rounded-xl border border-[#E8E4DC] bg-white p-3"><p className="text-xs text-gray-500">Tokens (24h)</p><p className="text-xl font-semibold">{summary.counters.totalTokens.toLocaleString()}</p></div>
          </div>

          <div className="space-y-3">
            {summary.alerts.map((alert) => (
              <div
                key={alert.code}
                className={clsx(
                  'rounded-xl border px-4 py-3',
                  alert.status === 'critical'
                    ? 'border-rose-200 bg-rose-50'
                    : alert.status === 'warn'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#1C1C2E]">{alert.code}</p>
                  <span className="text-[11px] font-semibold uppercase text-[#4A4A6A]">{alert.severity}</span>
                </div>
                <p className="mt-1 text-sm text-[#4A4A6A]">{alert.message}</p>
                <p className="mt-1 text-xs text-[#6F6883]">Metric: {alert.metric} | Threshold: {alert.threshold}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
