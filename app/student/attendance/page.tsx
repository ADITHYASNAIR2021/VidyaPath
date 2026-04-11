'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

interface AttendanceRecord {
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  subject?: string;
  periodNo?: number;
  notes?: string;
}

interface AttendanceData {
  percentage: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  recent: AttendanceRecord[];
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function statusBadge(status: AttendanceRecord['status']): { label: string; cls: string } {
  switch (status) {
    case 'present': return { label: 'Present', cls: 'bg-green-100 text-green-800' };
    case 'absent':  return { label: 'Absent',  cls: 'bg-rose-100 text-rose-700' };
    case 'late':    return { label: 'Late',    cls: 'bg-amber-100 text-amber-800' };
    case 'excused': return { label: 'Excused', cls: 'bg-gray-100 text-gray-600' };
  }
}

function percentageColor(pct: number): string {
  if (pct >= 75) return 'text-green-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-rose-600';
}

function percentageRingColor(pct: number): string {
  if (pct >= 75) return 'stroke-green-500';
  if (pct >= 60) return 'stroke-amber-500';
  return 'stroke-rose-500';
}

const DAY_OPTIONS = [30, 60, 120] as const;
type DayOption = (typeof DAY_OPTIONS)[number];

export default function StudentAttendancePage() {
  const router   = useRouter();
  const [days, setDays]       = useState<DayOption>(120);
  const [data, setData]       = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchAttendance = useCallback(async (d: DayOption) => {
    setLoading(true);
    setError('');
    try {
      const sessionRes = await fetch('/api/student/session/me', { cache: 'no-store' });
      if (!sessionRes.ok) {
        router.replace('/student/login');
        return;
      }

      const res  = await fetch(`/api/student/attendance?days=${d}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body && typeof body === 'object' && 'message' in body
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load attendance.'
        );
        return;
      }
      const unwrapped = unwrap<AttendanceData | null>(body);
      setData(unwrapped);
    } catch {
      setError('Failed to load attendance.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchAttendance(days);
  }, [days, fetchAttendance]);

  const pct          = data?.percentage ?? 0;
  // SVG circle params
  const radius       = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset   = circumference - (pct / 100) * circumference;

  const sortedRecent = data
    ? [...data.recent].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">Attendance</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">Track your attendance record and recent entries.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchAttendance(days)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#6D6A7C] hover:bg-[#F7F3EE] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Loading attendance…
          </div>
        )}

        {!loading && data && (
          <>
            {/* Days toggle */}
            <div className="mt-5 flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[#8A8AAA]">Period</span>
              <div className="flex rounded-xl border border-[#E8E4DC] bg-white overflow-hidden">
                {DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      days === d
                        ? 'bg-navy-700 text-white'
                        : 'text-[#6D6A7C] hover:bg-[#F7F3EE]'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Stat cards + circle */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
              {/* Circle — spans 1 col on md */}
              <div className="rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5 flex flex-col items-center justify-center md:col-span-2">
                <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
                  <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    stroke="#E8E4DC"
                    strokeWidth="10"
                  />
                  <circle
                    cx="60" cy="60" r={radius}
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className={`transition-all duration-700 ${percentageRingColor(pct)}`}
                  />
                </svg>
                <p className={`-mt-2 text-3xl font-bold ${percentageColor(pct)}`}>{pct}%</p>
                <p className="text-xs text-[#8A8AAA] mt-0.5">Attendance</p>
              </div>

              {/* 4 stat cards */}
              <div className="rounded-2xl border border-green-200 bg-green-50 shadow-sm p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Present</p>
                <p className="mt-2 text-3xl font-bold text-green-700">{data.present}</p>
                <p className="text-xs text-green-600 mt-0.5">of {data.total} days</p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50 shadow-sm p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Absent</p>
                <p className="mt-2 text-3xl font-bold text-rose-600">{data.absent}</p>
                <p className="text-xs text-rose-500 mt-0.5">of {data.total} days</p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-5">
                <p className="text-xs uppercase tracking-wide text-[#8A8AAA]">Late</p>
                <p className="mt-2 text-3xl font-bold text-amber-600">{data.late}</p>
                <p className="text-xs text-amber-500 mt-0.5">
                  {data.excused > 0 ? `${data.excused} excused` : 'entries'}
                </p>
              </div>
            </div>

            {/* Recent records */}
            <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white shadow-sm p-5">
              <h2 className="font-semibold text-navy-700">Recent Records</h2>
              <p className="text-xs text-[#8A8AAA] mt-0.5">Last {days} days · newest first</p>

              {sortedRecent.length === 0 ? (
                <p className="mt-4 text-sm text-[#8A8AAA]">No attendance records found for this period.</p>
              ) : (
                <div className="mt-4 flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                  {sortedRecent.map((rec, idx) => {
                    const badge = statusBadge(rec.status);
                    return (
                      <div
                        key={`${rec.date}-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#F0EDE6] px-4 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-24 shrink-0 text-sm font-medium text-navy-700">
                            {new Date(rec.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                          {rec.subject && (
                            <span className="text-sm text-[#6D6A7C]">
                              {rec.subject}
                              {rec.periodNo !== undefined ? ` · P${rec.periodNo}` : ''}
                            </span>
                          )}
                          {rec.notes && (
                            <span className="hidden text-xs text-[#8A8AAA] sm:inline">{rec.notes}</span>
                          )}
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty state when no data at all */}
        {!loading && !data && !error && (
          <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center text-sm text-[#8A8AAA]">
            No attendance data available.
          </div>
        )}
      </div>
    </div>
  );
}
