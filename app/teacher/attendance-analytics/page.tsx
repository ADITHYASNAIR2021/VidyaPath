'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

interface StudentAnalytics {
  id: string;
  name: string;
  rollNo: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  totalMarked: number;
  percentage: number | null;
  isAtRisk: boolean;
}

interface AnalyticsData {
  section: { id: string; classLevel: 10 | 12; section: string; batch?: string } | null;
  fromDate: string | null;
  toDate: string | null;
  totalDays: number;
  students: StudentAnalytics[];
  summary: { total: number; atRisk: number; avgPercentage: number | null } | null;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function PercentBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-rose-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={clsx(
          'text-xs font-semibold',
          pct >= 90 ? 'text-emerald-700' : pct >= 75 ? 'text-amber-700' : 'text-rose-700'
        )}
      >
        {value}%
      </span>
    </div>
  );
}

export default function AttendanceAnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [filter, setFilter] = useState<'all' | 'at-risk'>('all');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, analyticsRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher/attendance-analytics', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/teacher/login'); return; }
      const body = await analyticsRes.json().catch(() => null);
      if (!analyticsRes.ok) {
        setError(body?.message || 'Failed to load attendance analytics.');
        return;
      }
      setData(unwrap<AnalyticsData>(body));
    } catch {
      setError('Failed to load attendance analytics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const students = data?.students ?? [];
  const visible = filter === 'at-risk' ? students.filter((s) => s.isAtRisk) : students;

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';

  return (
    <div className="mx-auto max-w-5xl p-6">
      <BackButton href="/teacher/attendance" label="Attendance" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-amber-600" />
            Attendance Analytics
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            30-day attendance summary for your class section.
            {data?.section && (
              <span className="ml-1 font-medium text-gray-700">
                Class {data.section.classLevel} – {data.section.section}
                {data.section.batch ? ` (${data.section.batch})` : ''}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
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

      {data && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Date Range</p>
            <p className="mt-1 text-sm font-semibold text-gray-800">
              {formatDate(data.fromDate)} – {formatDate(data.toDate)}
            </p>
            <p className="text-[11px] text-gray-400">{data.totalDays} school days marked</p>
          </div>
          <div className="rounded-xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total Students</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">{data.summary?.total ?? 0}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
            <p className="text-xs text-rose-700">At Risk (&lt;75%)</p>
            <p className="mt-1 text-2xl font-bold text-rose-700">{data.summary?.atRisk ?? 0}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
            <p className="text-xs text-emerald-700">Class Avg</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {data.summary?.avgPercentage !== null && data.summary?.avgPercentage !== undefined
                ? `${data.summary.avgPercentage}%`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {data?.summary && data.summary.atRisk > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            <strong>{data.summary.atRisk} student{data.summary.atRisk !== 1 ? 's' : ''}</strong> below 75% attendance — consider reaching out to parents.
          </span>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={clsx('rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors', filter === 'all' ? 'bg-amber-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
        >
          All Students ({students.length})
        </button>
        <button
          onClick={() => setFilter('at-risk')}
          className={clsx('rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors', filter === 'at-risk' ? 'bg-rose-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}
        >
          At Risk ({students.filter((s) => s.isAtRisk).length})
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading analytics...
        </div>
      ) : !data?.section ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <BarChart3 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No managed section found</p>
          <p className="mt-1 text-sm text-gray-400">Only class teachers with an assigned section see analytics here.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No students match the selected filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Student</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Present</span>
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3 text-rose-600" />Absent</span>
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-amber-600" />Late</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Attendance</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => (
                <tr key={student.id} className={clsx('border-b border-[#E8E4DC] last:border-0', student.isAtRisk && 'bg-rose-50/30')}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                    <p className="text-[11px] text-gray-400">{student.rollNo}</p>
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-emerald-700">{student.present}</td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-rose-700">{student.absent}</td>
                  <td className="px-3 py-3 text-center text-sm font-semibold text-amber-700">{student.late}</td>
                  <td className="px-4 py-3">
                    <PercentBar value={student.percentage} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {student.percentage === null ? (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500">No data</span>
                    ) : student.isAtRisk ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700">
                        <AlertTriangle className="h-3 w-3" />At Risk
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />Good
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
