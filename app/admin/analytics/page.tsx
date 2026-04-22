'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart2, RefreshCw, TrendingUp, Users } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface AnalyticsPayload {
  generatedAt: string;
  schoolId: string;
  overview: {
    totalTeachers: number;
    activeTeachers: number;
    assignmentCompletionsThisWeek: number;
    topWeakTopics: Array<{ topic: string; count: number }>;
    scopesBySubject: Array<{ subject: string; count: number }>;
  };
  dailyActiveStudents7d: Array<{ date: string; activeStudents: number }>;
  assignmentCompletionFunnel: {
    assigned: number;
    submitted: number;
    reviewed: number;
    released: number;
  };
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function AdminAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, analyticsRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/analytics', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = await analyticsRes.json().catch(() => null);
      if (!analyticsRes.ok) {
        setError(body?.message || 'Failed to load analytics.');
        setData(null);
        return;
      }
      setData(unwrap<AnalyticsPayload>(body));
    } catch {
      setError('Failed to load analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const maxDailyActive = useMemo(() => {
    const values = data?.dailyActiveStudents7d.map((item) => item.activeStudents) || [];
    return Math.max(1, ...values);
  }, [data?.dailyActiveStudents7d]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-indigo-600" />
            Analytics
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">School performance, activity, and completion trends.</p>
        </div>
        <button
          onClick={() => void loadAnalytics()}
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

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Total Teachers</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.overview.totalTeachers ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Active Teachers</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.overview.activeTeachers ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Completions (Week)</p>
          <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{data?.overview.assignmentCompletionsThisWeek ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-[#7A7490]">Snapshot Time</p>
          <p className="mt-1 text-xs font-semibold text-[#1C1C2E]">{data ? new Date(data.generatedAt).toLocaleString() : '-'}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading analytics...
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No analytics data available.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Daily Active Students (7 days)
            </h2>
            <div className="mt-4 space-y-2">
              {data.dailyActiveStudents7d.map((row) => (
                <div key={row.date}>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                    <span>{new Date(row.date).toLocaleDateString()}</span>
                    <span>{row.activeStudents}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{ width: `${Math.max(4, Math.round((row.activeStudents / maxDailyActive) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Assignment Funnel
            </h2>
            <div className="mt-4 space-y-3">
              {[
                { key: 'assigned', label: 'Assigned', value: data.assignmentCompletionFunnel.assigned, tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                { key: 'submitted', label: 'Submitted', value: data.assignmentCompletionFunnel.submitted, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
                { key: 'reviewed', label: 'Reviewed', value: data.assignmentCompletionFunnel.reviewed, tone: 'bg-amber-50 text-amber-700 border-amber-200' },
                { key: 'released', label: 'Released', value: data.assignmentCompletionFunnel.released, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              ].map((row) => (
                <div key={row.key} className={clsx('rounded-xl border px-3 py-2', row.tone)}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3">Top Weak Topics</h2>
            {data.overview.topWeakTopics.length === 0 ? (
              <p className="text-sm text-gray-400">No weak-topic data yet.</p>
            ) : (
              <div className="space-y-2">
                {data.overview.topWeakTopics.slice(0, 10).map((topic) => (
                  <div key={topic.topic} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-rose-800">{topic.topic}</span>
                    <span className="text-rose-700">{topic.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-700 mb-3">Subject Coverage</h2>
            {data.overview.scopesBySubject.length === 0 ? (
              <p className="text-sm text-gray-400">No scope data yet.</p>
            ) : (
              <div className="space-y-2">
                {data.overview.scopesBySubject.map((subject) => (
                  <div key={subject.subject} className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs">
                    <span className="font-semibold text-emerald-800">{subject.subject}</span>
                    <span className="text-emerald-700">{subject.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
