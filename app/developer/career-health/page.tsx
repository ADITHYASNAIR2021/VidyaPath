'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface CareerIssue {
  id: string;
  status: 'open' | 'acknowledged' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_path?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

interface VerifyRun {
  checkedAt: string;
  total: number;
  passed: number;
  failed: number;
  checks: Array<{
    id: string;
    title: string;
    url: string;
    ok: boolean;
    statusCode: number;
    checkedAt: string;
    error?: string;
  }>;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function DeveloperCareerHealthPage() {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<CareerIssue[]>([]);
  const [latestRun, setLatestRun] = useState<VerifyRun | null>(null);

  async function loadIssues() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, issuesRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch('/api/developer/data-quality/verify-career-sources', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }
      const body = await issuesRes.json().catch(() => null);
      if (!issuesRes.ok) {
        setError(body?.message || 'Failed to load career health issues.');
        setIssues([]);
        return;
      }
      const data = unwrap<{ issues?: CareerIssue[] }>(body);
      setIssues(Array.isArray(data.issues) ? data.issues : []);
    } catch {
      setError('Failed to load career health issues.');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIssues();
  }, []);

  async function runVerification() {
    setVerifying(true);
    setError('');
    try {
      const response = await fetch('/api/developer/data-quality/verify-career-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistIssues: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to run verification.');
        return;
      }
      setLatestRun(unwrap<VerifyRun>(body));
      await loadIssues();
    } catch {
      setError('Failed to run verification.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/developer" label="Console" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-violet-600" />
            Career Health
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Official-source verification state for career/exam links.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadIssues()}
            disabled={loading}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </span>
          </button>
          <button
            onClick={() => void runVerification()}
            disabled={verifying}
            className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {verifying ? 'Running...' : 'Run Verification'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {latestRun && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Checked</p>
            <p className="mt-1 text-lg font-semibold">{latestRun.total}</p>
          </div>
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Passed</p>
            <p className="mt-1 text-lg font-semibold text-emerald-700">{latestRun.passed}</p>
          </div>
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Failed</p>
            <p className="mt-1 text-lg font-semibold text-rose-700">{latestRun.failed}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading career health...
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No source issues recorded.
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const details = issue.details || {};
            return (
              <div key={issue.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {String(details.title || issue.source_path || 'Career source issue')}
                  </p>
                  <span className={clsx(
                    'rounded-full px-2 py-1 text-[11px] font-semibold uppercase',
                    issue.severity === 'critical'
                      ? 'bg-rose-50 text-rose-700'
                      : issue.severity === 'high'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-100 text-gray-700'
                  )}>
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(issue.created_at).toLocaleString()} | status: {issue.status} | http: {String(details.statusCode || 'n/a')}
                </p>
                {issue.source_path && (
                  <a
                    href={issue.source_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                  >
                    {issue.source_path}
                  </a>
                )}
                {!!details.error && <p className="mt-2 text-xs text-rose-700">{String(details.error)}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
