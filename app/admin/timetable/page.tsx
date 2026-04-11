'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, RefreshCw, Save } from 'lucide-react';
import clsx from 'clsx';

interface TimetableSlot {
  id?: string;
  dayOfWeek: number;
  periodNo: number;
  subject: string;
  teacherId?: string;
  startTime?: string;
  endTime?: string;
}

interface TimetableTeacher {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

interface TimetableResponse {
  classLevel: 10 | 12;
  section: string;
  slots: TimetableSlot[];
  teachers?: TimetableTeacher[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const DAYS = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function slotKey(day: number, period: number): string {
  return `${day}-${period}`;
}

export default function TimetablePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [classLevel, setClassLevel] = useState<10 | 12>(12);
  const [section, setSection] = useState('A');
  const [slotMap, setSlotMap] = useState<Record<string, TimetableSlot>>({});
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);

  async function loadTimetable(nextClassLevel: 10 | 12, nextSection: string) {
    const sectionValue = nextSection.trim().toUpperCase();
    if (!sectionValue) return;
    setLoading(true);
    setError('');
    try {
      const [sessionRes, timetableRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch(`/api/admin/timetable?classLevel=${nextClassLevel}&section=${encodeURIComponent(sectionValue)}`, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const body = await timetableRes.json().catch(() => null);
      if (!timetableRes.ok) {
        setError(body?.message || 'Failed to load timetable.');
        setSlotMap({});
        setTeachers([]);
        return;
      }
      const data = unwrap<TimetableResponse>(body);
      const nextMap: Record<string, TimetableSlot> = {};
      for (const slot of data.slots || []) {
        nextMap[slotKey(slot.dayOfWeek, slot.periodNo)] = slot;
      }
      setSlotMap(nextMap);
      setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
      setClassLevel(data.classLevel);
      setSection(data.section);
    } catch {
      setError('Failed to load timetable.');
      setSlotMap({});
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTimetable(classLevel, section);
  }, []);

  const totalFilled = useMemo(
    () => Object.values(slotMap).filter((slot) => slot.subject.trim()).length,
    [slotMap]
  );

  const teacherById = useMemo(() => {
    const map = new Map<string, string>();
    for (const teacher of teachers) {
      map.set(teacher.id, teacher.name);
    }
    return map;
  }, [teachers]);

  function updateCell(dayOfWeek: number, periodNo: number, patch: Partial<TimetableSlot>) {
    const key = slotKey(dayOfWeek, periodNo);
    setSlotMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        dayOfWeek,
        periodNo,
        subject: prev[key]?.subject ?? '',
        ...patch,
      },
    }));
  }

  async function saveTimetable() {
    const sectionValue = section.trim().toUpperCase();
    if (!sectionValue) {
      setError('Section is required.');
      return;
    }
    const slots = Object.values(slotMap)
      .map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        periodNo: slot.periodNo,
        subject: slot.subject.trim(),
        teacherId: slot.teacherId?.trim() || undefined,
        startTime: slot.startTime?.trim() || undefined,
        endTime: slot.endTime?.trim() || undefined,
      }))
      .filter((slot) => slot.subject.length > 0);
    if (slots.length === 0) {
      setError('Add at least one subject slot before saving.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classLevel, section: sectionValue, slots }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to save timetable.');
        return;
      }
      setSuccess('Timetable saved.');
      setTimeout(() => setSuccess(''), 1800);
      await loadTimetable(classLevel, sectionValue);
    } catch {
      setError('Failed to save timetable.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-indigo-600" />
            Timetable Builder
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Build weekly timetable with subject and teacher mapping for each period.</p>
        </div>
        <button
          onClick={() => void loadTimetable(classLevel, section)}
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

      <div className="mb-5 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Class</label>
            <select
              value={classLevel}
              onChange={(event) => setClassLevel(Number(event.target.value) as 10 | 12)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value={10}>Class 10</option>
              <option value={12}>Class 12</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Section</label>
            <input
              value={section}
              onChange={(event) => setSection(event.target.value.toUpperCase())}
              placeholder="A"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => void loadTimetable(classLevel, section)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Load Section
            </button>
          </div>
          <div className="flex items-end text-xs text-gray-500">
            {totalFilled} slots filled
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading timetable...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
          <table className="min-w-[1200px] w-full">
            <thead>
              <tr className="border-b border-[#E8E4DC] bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Period</th>
                {DAYS.map((day) => (
                  <th key={day.id} className="px-3 py-3 text-left text-xs font-semibold text-gray-500">{day.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((periodNo) => (
                <tr key={periodNo} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-700">P{periodNo}</td>
                  {DAYS.map((day) => {
                    const key = slotKey(day.id, periodNo);
                    const slot = slotMap[key];
                    const teacherName = slot?.teacherId ? teacherById.get(slot.teacherId) : '';
                    return (
                      <td key={key} className="px-3 py-3 align-top">
                        <div className="space-y-1.5">
                          <input
                            value={slot?.subject || ''}
                            onChange={(event) => updateCell(day.id, periodNo, { subject: event.target.value })}
                            placeholder="Subject"
                            className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                          />
                          <select
                            value={slot?.teacherId || ''}
                            onChange={(event) => updateCell(day.id, periodNo, { teacherId: event.target.value || undefined })}
                            className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-700"
                          >
                            <option value="">Teacher (optional)</option>
                            {teachers
                              .filter((teacher) => teacher.status === 'active')
                              .map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                  {teacher.name}
                                </option>
                              ))}
                          </select>
                          {teacherName && (
                            <p className="text-[11px] text-gray-500">Assigned: {teacherName}</p>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          onClick={() => void saveTimetable()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Timetable'}
        </button>
      </div>
    </div>
  );
}
