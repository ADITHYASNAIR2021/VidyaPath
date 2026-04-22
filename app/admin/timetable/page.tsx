'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, RefreshCw, Save, X } from 'lucide-react';
import BackButton from '@/components/BackButton';
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
  { id: 6, label: 'Sat' },
  { id: 7, label: 'Sun' },
];

function slotKey(day: number, period: number): string {
  return `${day}-${period}`;
}

export default function TimetablePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [classLevel, setClassLevel] = useState<10 | 12>(12);
  const [section, setSection] = useState('A');
  const [slotMap, setSlotMap] = useState<Record<string, TimetableSlot>>({});
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [periodCount, setPeriodCount] = useState(8);
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  const [loadedScope, setLoadedScope] = useState<{ classLevel: 10 | 12; section: string } | null>(null);

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
        setError('Session expired. Please sign in again.');
        return;
      }
      const body = await timetableRes.json().catch(() => null);
      if (!timetableRes.ok) {
        setError(body?.message || 'Failed to load timetable.');
        setSlotMap({});
        setTeachers([]);
        setLoadedScope(null);
        return;
      }
      const data = unwrap<TimetableResponse>(body);
      const nextMap: Record<string, TimetableSlot> = {};
      for (const slot of data.slots || []) {
        nextMap[slotKey(slot.dayOfWeek, slot.periodNo)] = slot;
      }
      setSlotMap(nextMap);
      const usedDays = [...new Set((data.slots || []).map((slot) => Number(slot.dayOfWeek)).filter((day) => day >= 1 && day <= 7))]
        .sort((a, b) => a - b);
      setSelectedDays(usedDays.length > 0 ? usedDays : [1, 2, 3, 4, 5]);
      const maxPeriod = (data.slots || []).reduce((max, slot) => Math.max(max, Number(slot.periodNo) || 0), 0);
      setPeriodCount(maxPeriod > 0 ? Math.min(20, maxPeriod) : 8);
      setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
      setClassLevel(data.classLevel);
      setSection(data.section);
      setLoadedScope({ classLevel: data.classLevel, section: data.section });
    } catch {
      setError('Failed to load timetable.');
      setSlotMap({});
      setTeachers([]);
      setLoadedScope(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTimetable(classLevel, section);
  }, []);

  const totalFilled = useMemo(
    () =>
      Object.values(slotMap).filter((slot) =>
        slot.subject.trim() &&
        selectedDays.includes(slot.dayOfWeek) &&
        slot.periodNo <= periodCount
      ).length,
    [slotMap, selectedDays, periodCount]
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

  function addPeriodRow() {
    setPeriodCount((prev) => Math.min(20, prev + 1));
  }

  function removePeriodRow() {
    setPeriodCount((prev) => {
      if (prev <= 1) return prev;
      const next = prev - 1;
      setSlotMap((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, slot]) => slot.periodNo <= next)
        )
      );
      return next;
    });
  }

  function addDayColumn() {
    const next = DAYS.find((day) => !selectedDays.includes(day.id));
    if (!next) return;
    setSelectedDays((prev) => [...prev, next.id].sort((a, b) => a - b));
  }

  function removeDayColumn(dayId: number) {
    if (selectedDays.length <= 1) return;
    setSelectedDays((prev) => prev.filter((id) => id !== dayId));
    setSlotMap((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, slot]) => slot.dayOfWeek !== dayId)
      )
    );
  }

  async function saveTimetable() {
    const sectionValue = section.trim().toUpperCase();
    if (!sectionValue) {
      setError('Section is required.');
      return;
    }
    if (scopeDirty) {
      setError('Load the selected class/section before saving to keep 10A and 10B timetables separate.');
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
      .filter((slot) =>
        slot.subject.length > 0 &&
        selectedDays.includes(slot.dayOfWeek) &&
        slot.periodNo <= periodCount
      );
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

  const dayColumns = useMemo(
    () => DAYS.filter((day) => selectedDays.includes(day.id)),
    [selectedDays]
  );

  const periodRows = useMemo(
    () => Array.from({ length: periodCount }, (_, index) => index + 1),
    [periodCount]
  );

  const remainingDayCount = DAYS.length - dayColumns.length;
  const normalizedSection = useMemo(() => section.trim().toUpperCase(), [section]);
  const scopeDirty = useMemo(() => {
    if (!loadedScope) return false;
    return loadedScope.classLevel !== classLevel || loadedScope.section !== normalizedSection;
  }, [classLevel, loadedScope, normalizedSection]);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <BackButton href="/admin" label="Dashboard" />
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
              onChange={(event) => {
                setClassLevel(Number(event.target.value) as 10 | 12);
                setSuccess('');
              }}
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
              onChange={(event) => {
                setSection(event.target.value.toUpperCase());
                setSuccess('');
              }}
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
            Loaded: {loadedScope ? `Class ${loadedScope.classLevel} - ${loadedScope.section}` : 'Not loaded yet'}
          </span>
          {scopeDirty && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
              Scope changed. Click Load Section before saving.
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#F0ECE3] pt-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <span className="font-semibold text-gray-700">Periods</span>
            <button
              onClick={removePeriodRow}
              disabled={periodCount <= 1}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              -1
            </button>
            <span className="font-bold text-gray-900">{periodCount}</span>
            <button
              onClick={addPeriodRow}
              disabled={periodCount >= 20}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              +1
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <span className="font-semibold text-gray-700">Days</span>
            <span className="font-bold text-gray-900">{dayColumns.length}/7</span>
            <button
              onClick={addDayColumn}
              disabled={remainingDayCount <= 0}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Day
            </button>
          </div>
          <p className="text-xs text-gray-500">Tip: Use Add Day for Saturday/Sunday, and remove any day from table header.</p>
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
                {dayColumns.map((day) => (
                  <th key={day.id} className="px-3 py-3 text-left text-xs font-semibold text-gray-500">
                    <div className="flex items-center justify-between gap-2">
                      <span>{day.label}</span>
                      <button
                        onClick={() => removeDayColumn(day.id)}
                        disabled={dayColumns.length <= 1}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        title={`Remove ${day.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodRows.map((periodNo) => (
                <tr key={periodNo} className="border-b border-[#E8E4DC] last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-700">P{periodNo}</td>
                  {dayColumns.map((day) => {
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
          disabled={saving || loading || scopeDirty}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Timetable'}
        </button>
      </div>
    </div>
  );
}
