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

interface TimetableResponse {
  classLevel: 10 | 12;
  section: string;
  slots: TimetableSlot[];
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

function toKey(day: number, period: number) {
  return `${day}-${period}`;
}

export default function TimetablePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [classLevel, setClassLevel] = useState<10 | 12>(12);
  const [section, setSection] = useState('A');
  const [slotMap, setSlotMap] = useState<Record<string, TimetableSlot>>({});

  async function loadTimetable(nextClassLevel: 10 | 12, nextSection: string) {
    if (!nextSection.trim()) return;
    setLoading(true);
    setError('');
    try {
      const [sessionRes, timetableRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch(`/api/admin/timetable?classLevel=${nextClassLevel}&section=${encodeURIComponent(nextSection.trim().toUpperCase())}`, { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const body = await timetableRes.json().catch(() => null);
      if (!timetableRes.ok) {
        setError(body?.message || 'Failed to load timetable.');
        setSlotMap({});
        return;
      }
      const data = unwrap<TimetableResponse>(body);
      const next: Record<string, TimetableSlot> = {};
      for (const slot of data.slots || []) {
        next[toKey(slot.dayOfWeek, slot.periodNo)] = slot;
      }
      setSlotMap(next);
      setClassLevel(data.classLevel);
      setSection(data.section);
    } catch {
      setError('Failed to load timetable.');
      setSlotMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTimetable(classLevel, section);
  }, []);

  const totalFilled = useMemo(() => Object.values(slotMap).filter((slot) => slot.subject.trim()).length, [slotMap]);

  function updateCell(dayOfWeek: number, periodNo: number, subject: string) {
    const key = toKey(dayOfWeek, periodNo);
    setSlotMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        dayOfWeek,
        periodNo,
        subject,
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
    try {
      const response = await fetch('/api/admin/timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classLevel,
          section: sectionValue,
          slots,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to save timetable.');
        return;
      }
      await loadTimetable(classLevel, sectionValue);
    } catch {
      setError('Failed to save timetable.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-indigo-600" />
            Timetable Builder
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Create and publish weekly timetable slots for each section.</p>
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
            {totalFilled} slot{totalFilled !== 1 ? 's' : ''} filled
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
          <table className="min-w-[980px] w-full">
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
                    const key = toKey(day.id, periodNo);
                    const slot = slotMap[key];
                    return (
                      <td key={key} className="px-3 py-3">
                        <input
                          value={slot?.subject || ''}
                          onChange={(event) => updateCell(day.id, periodNo, event.target.value)}
                          placeholder="Subject"
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm"
                        />
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
