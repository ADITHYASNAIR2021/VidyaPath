'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, RefreshCw } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface UsageRecord {
  id: string;
  createdAt: string;
  schoolId?: string;
  role?: string;
  endpoint: string;
  provider?: string;
  model?: string;
  totalTokens: number;
  estimated: boolean;
}

interface UsagePayload {
  events: number;
  totalTokens: number;
  records: UsageRecord[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function DeveloperUsagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [endpointFilter, setEndpointFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');

  async function loadUsage() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '250' });
      if (endpointFilter.trim()) params.set('endpoint', endpointFilter.trim());
      if (schoolFilter.trim()) params.set('schoolId', schoolFilter.trim());
      const [sessionRes, usageRes] = await Promise.all([
        fetch('/api/developer/session/me', { cache: 'no-store' }),
        fetch(`/api/developer/usage/tokens?${params.toString()}`, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/developer/login');
        return;
      }
      const body = await usageRes.json().catch(() => null);
      if (!usageRes.ok) {
        setError(body?.message || 'Failed to load usage.');
        setPayload(null);
        return;
      }
      setPayload(unwrap<UsagePayload>(body));
    } catch {
      setError('Failed to load usage.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsage();
  }, []);

  const endpointRollup = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of payload?.records || []) {
      map.set(record.endpoint, (map.get(record.endpoint) || 0) + record.totalTokens);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [payload?.records]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <BackButton href="/developer" label="Console" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-violet-600" />
            Token Usage
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Monitor endpoint token consumption across schools.</p>
        </div>
        <button
          onClick={() => void loadUsage()}
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

      <div className="mb-5 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            value={endpointFilter}
            onChange={(event) => setEndpointFilter(event.target.value)}
            placeholder="Endpoint filter (optional)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            value={schoolFilter}
            onChange={(event) => setSchoolFilter(event.target.value)}
            placeholder="School ID filter (optional)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void loadUsage()}
            className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Events</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{payload?.events ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Total Tokens</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{(payload?.totalTokens ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Top Endpoints (Token Load)</h2>
        {endpointRollup.length === 0 ? (
          <p className="text-sm text-gray-400">No usage data yet.</p>
        ) : (
          <div className="space-y-2">
            {endpointRollup.map(([endpoint, tokens]) => (
              <div key={endpoint} className="flex items-center justify-between rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs">
                <span className="font-semibold text-violet-800">{endpoint}</span>
                <span className="text-violet-700">{tokens.toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading usage...
        </div>
      ) : (payload?.records?.length || 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No usage records found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="min-w-[980px] w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Endpoint</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Provider/Model</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Tokens</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">School</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.records || []).map((row) => (
                <tr key={row.id} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{row.role || '-'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-900">{row.endpoint}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{row.provider || '-'} / {row.model || '-'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{row.totalTokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{row.schoolId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
