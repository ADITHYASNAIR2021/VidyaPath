'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarRange, RefreshCw, Clock } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TimetableSlot {
  id: string;
  classLevel: 10 | 12;
  section: string;
  dayOfWeek: number;
  periodNo: number;
  subject: string;
  teacherId?: string;
  startTime?: string;
  endTime?: string;
}

interface ManagedTimetable {
  section: { id: string; classLevel: 10 | 12; section: string; batch?: string };
  slots: TimetableSlot[];
}

interface TimetableData {
  personalSlots: TimetableSlot[];
  managedTimetables: ManagedTimetable[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function buildGrid(slots: TimetableSlot[]): Map<string, TimetableSlot> {
  const grid = new Map<string, TimetableSlot>();
  for (const slot of slots) grid.set(`${slot.dayOfWeek}-${slot.periodNo}`, slot);
  return grid;
}

function maxPeriod(slots: TimetableSlot[]): number {
  return Math.max(8, ...slots.map((s) => s.periodNo));
}

const SUBJECT_COLORS: Record<string, string> = {
  Physics: 'bg-blue-50 border-blue-200 text-blue-800',
  Chemistry: 'bg-green-50 border-green-200 text-green-800',
  Mathematics: 'bg-purple-50 border-purple-200 text-purple-800',
  Biology: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  English: 'bg-amber-50 border-amber-200 text-amber-800',
  History: 'bg-orange-50 border-orange-200 text-orange-800',
};

function slotColor(subject: string): string {
  for (const [key, cls] of Object.entries(SUBJECT_COLORS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) return cls;
  }
  return 'bg-indigo-50 border-indigo-200 text-indigo-800';
}

function TimetableGrid({ slots, activeDays, label }: { slots: TimetableSlot[]; activeDays: number[]; label?: string }) {
  const grid = buildGrid(slots);
  const periods = Array.from({ length: maxPeriod(slots) }, (_, i) => i + 1);

  return (
    <div>
      {label && <h3 className="text-sm font-semibold text-gray-600 mb-2">{label}</h3>}
      <div className="overflow-x-auto rounded-2xl border border-[#E8E4DC] bg-white shadow-sm">
        <table className="min-w-[640px] w-full text-xs">
          <thead>
            <tr className="border-b border-[#E8E4DC] bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-16">Period</th>
              {activeDays.map((d) => (
                <th key={d} className="px-3 py-2 text-center text-xs font-semibold text-gray-500">{DAY_LABELS[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period} className="border-b border-[#E8E4DC] last:border-0">
                <td className="px-3 py-2 font-medium text-gray-500 text-center">{period}</td>
                {activeDays.map((day) => {
                  const slot = grid.get(`${day}-${period}`);
                  return (
                    <td key={day} className="px-2 py-1.5 text-center">
                      {slot ? (
                        <div className={clsx('rounded-lg border px-2 py-1.5 text-[11px] font-semibold', slotColor(slot.subject))}>
                          <p className="truncate">{slot.subject}</p>
                          {(slot.classLevel || slot.section) && (
                            <p className="text-[10px] opacity-70 font-normal">
                              Cl {slot.classLevel}{slot.section ? ` ${slot.section}` : ''}
                            </p>
                          )}
                          {slot.startTime && (
                            <p className="text-[10px] opacity-60 font-normal flex items-center justify-center gap-0.5 mt-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {slot.startTime}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 px-2 py-1.5 text-gray-300">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TimetablePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<TimetableData | null>(null);
  const [view, setView] = useState<'personal' | 'class'>('personal');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, timetableRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher/timetable', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { router.replace('/teacher/login'); return; }
      const body = await timetableRes.json().catch(() => null);
      if (!timetableRes.ok) {
        setError(body?.message || 'Failed to load timetable.');
        return;
      }
      setData(unwrap<TimetableData>(body));
    } catch {
      setError('Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const activeDays = [1, 2, 3, 4, 5, 6];
  const personalSlots = data?.personalSlots ?? [];
  const managedTimetables = data?.managedTimetables ?? [];
  const hasPersonal = personalSlots.length > 0;
  const hasManaged = managedTimetables.length > 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-amber-600" />
            My Timetable
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Weekly schedule across all your assigned classes.</p>
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

      {(hasPersonal || hasManaged) && (
        <div className="mb-5 flex gap-2">
          {hasPersonal && (
            <button
              onClick={() => setView('personal')}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                view === 'personal' ? 'bg-amber-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              My Periods
            </button>
          )}
          {hasManaged && (
            <button
              onClick={() => setView('class')}
              className={clsx(
                'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                view === 'class' ? 'bg-amber-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              Class Timetable
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading timetable...
        </div>
      ) : !hasPersonal && !hasManaged ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <CalendarRange className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No timetable found</p>
          <p className="mt-1 text-sm text-gray-400">Ask your school admin to assign you to timetable slots.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {view === 'personal' && hasPersonal && (
            <TimetableGrid slots={personalSlots} activeDays={activeDays} />
          )}
          {view === 'class' && hasManaged && managedTimetables.map((mt) => (
            <TimetableGrid
              key={mt.section.id}
              slots={mt.slots}
              activeDays={activeDays}
              label={`Class ${mt.section.classLevel} – Section ${mt.section.section}${mt.section.batch ? ` (${mt.section.batch})` : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
