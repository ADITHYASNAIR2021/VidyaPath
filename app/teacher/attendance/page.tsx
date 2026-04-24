'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked';

interface ClassSection {
  id: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
}

interface RosterStudent {
  id: string;
  name: string;
  rollNo?: string;
  rollCode: string;
  attendanceStatus: AttendanceStatus;
}

interface AttendancePayload {
  classSection: ClassSection;
  readonly?: boolean;
  date: string;
  roster: RosterStudent[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [date, setDate] = useState(todayIso());
  const [payload, setPayload] = useState<AttendancePayload | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});

  async function loadAttendance(targetDate: string) {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const [sessionRes, attendanceRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch(`/api/teacher/attendance?date=${encodeURIComponent(targetDate)}`, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = await attendanceRes.json().catch(() => null);
      if (!attendanceRes.ok) {
        setError(body?.message || 'Failed to load attendance.');
        setPayload(null);
        setStatusMap({});
        return;
      }
      const data = unwrap<AttendancePayload>(body);
      setPayload(data);
      setDate(data.date || targetDate);
      const next: Record<string, AttendanceStatus> = {};
      for (const student of data.roster || []) {
        next[student.id] = student.attendanceStatus || 'unmarked';
      }
      setStatusMap(next);
    } catch {
      setError('Failed to load attendance.');
      setPayload(null);
      setStatusMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAttendance(todayIso());
  }, []);

  const counts = useMemo(() => {
    const values = Object.values(statusMap);
    return {
      present: values.filter((value) => value === 'present').length,
      absent: values.filter((value) => value === 'absent').length,
      late: values.filter((value) => value === 'late').length,
      excused: values.filter((value) => value === 'excused').length,
      unmarked: values.filter((value) => value === 'unmarked').length,
    };
  }, [statusMap]);

  async function saveAttendance() {
    if (!payload) return;
    if (payload.readonly) {
      setError('Only the class teacher can mark attendance for this section.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const records = payload.roster
        .map((student) => ({
          studentId: student.id,
          status: statusMap[student.id] || 'unmarked',
        }))
        .filter((row): row is { studentId: string; status: Exclude<AttendanceStatus, 'unmarked'> } => row.status !== 'unmarked');

      if (records.length === 0) {
        setError('Mark at least one student before saving attendance.');
        return;
      }

      const response = await fetch('/api/teacher/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel: payload.classSection.classLevel,
          section: payload.classSection.section,
          date,
          records,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to save attendance.');
        return;
      }
      setSuccess('Attendance saved successfully.');
      await loadAttendance(date);
    } catch {
      setError('Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  function markAll(status: Exclude<AttendanceStatus, 'unmarked'>) {
    if (!payload || payload.readonly) return;
    const next = { ...statusMap };
    for (const student of payload.roster) next[student.id] = status;
    setStatusMap(next);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-amber-600" />
            Attendance
            {payload?.readonly && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                View only
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {payload?.readonly
              ? 'Read-only attendance view for your scoped section.'
              : 'Mark and publish daily attendance for your managed section.'}
          </p>
        </div>
        <button
          onClick={() => void loadAttendance(date)}
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
      {success && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
      {payload?.readonly && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only the class teacher can mark attendance. You have read-only access for this section.
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                const nextDate = event.target.value || todayIso();
                setDate(nextDate);
                void loadAttendance(nextDate);
              }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="text-sm text-[#4A4A6A]">
            <p className="text-xs font-medium text-gray-600">Section</p>
            <p className="mt-1 font-semibold">
              {payload?.classSection ? `Class ${payload.classSection.classLevel} - ${payload.classSection.section}` : '-'}
            </p>
            {payload?.classSection?.batch && <p className="text-xs text-gray-500">Batch: {payload.classSection.batch}</p>}
          </div>
          {payload && !payload.readonly && (
            <div className="flex items-end gap-2">
              <button onClick={() => markAll('present')} type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Mark All Present</button>
              <button onClick={() => markAll('absent')} type="button" className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700">Mark All Absent</button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">{counts.present}</p>
          <p className="text-[11px] text-emerald-700">Present</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
          <p className="text-lg font-bold text-rose-700">{counts.absent}</p>
          <p className="text-[11px] text-rose-700">Absent</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-lg font-bold text-amber-700">{counts.late}</p>
          <p className="text-[11px] text-amber-700">Late</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
          <p className="text-lg font-bold text-blue-700">{counts.excused}</p>
          <p className="text-[11px] text-blue-700">Excused</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
          <p className="text-lg font-bold text-gray-700">{counts.unmarked}</p>
          <p className="text-[11px] text-gray-700">Unmarked</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading attendance...
        </div>
      ) : !payload || payload.roster.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No roster found for this managed section yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Student</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Roll</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {payload.roster.map((student) => (
                <tr key={student.id} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{student.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{student.rollNo || student.rollCode}</td>
                  <td className="px-4 py-3">
                    {payload?.readonly ? (
                      <span
                        className={clsx(
                          'rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize',
                          statusMap[student.id] === 'present' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                          statusMap[student.id] === 'absent' && 'border-rose-200 bg-rose-50 text-rose-700',
                          statusMap[student.id] === 'late' && 'border-amber-200 bg-amber-50 text-amber-700',
                          statusMap[student.id] === 'excused' && 'border-blue-200 bg-blue-50 text-blue-700',
                          statusMap[student.id] === 'unmarked' && 'border-gray-200 bg-gray-50 text-gray-600'
                        )}
                      >
                        {statusMap[student.id]}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(['present', 'absent', 'late', 'excused'] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setStatusMap((prev) => ({ ...prev, [student.id]: status }))}
                            className={clsx(
                              'rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors',
                              statusMap[student.id] === status
                                ? status === 'present'
                                  ? 'border-emerald-600 bg-emerald-600 text-white'
                                  : status === 'absent'
                                    ? 'border-rose-600 bg-rose-600 text-white'
                                    : status === 'late'
                                      ? 'border-amber-600 bg-amber-600 text-white'
                                      : 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                            )}
                          >
                            {status}
                          </button>
                        ))}
                        {statusMap[student.id] === 'present' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {statusMap[student.id] === 'absent' && <XCircle className="h-4 w-4 text-rose-600" />}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payload && !payload.readonly && (
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => void saveAttendance()}
            disabled={saving || loading || !payload || payload.roster.length === 0}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      )}
    </div>
  );
}
