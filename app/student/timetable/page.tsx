'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

interface TimetableSlot {
  id: string;
  classLevel: number;
  section: string;
  dayOfWeek: number;
  periodNo: number;
  subject: string;
  teacherId: string;
  startTime: string;
  endTime: string;
}

interface TimetableData {
  classLevel: number;
  section: string;
  slots: TimetableSlot[];
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function subjectCellClass(subject: string): string {
  switch (subject.toLowerCase()) {
    case 'physics':     return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'chemistry':   return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'biology':     return 'bg-green-100 text-green-800 border-green-200';
    case 'math':
    case 'mathematics': return 'bg-purple-100 text-purple-800 border-purple-200';
    default:            return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  }
}

const DAYS: { label: string; dow: number }[] = [
  { label: 'Mon', dow: 1 },
  { label: 'Tue', dow: 2 },
  { label: 'Wed', dow: 3 },
  { label: 'Thu', dow: 4 },
  { label: 'Fri', dow: 5 },
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const TODAY_DOW = new Date().getDay(); // 0=Sun, 1=Mon…5=Fri, 6=Sat

export default function StudentTimetablePage() {
  const router    = useRouter();
  const [data, setData]       = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchTimetable = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const sessionRes = await fetch('/api/student/session/me', { cache: 'no-store' });
      if (!sessionRes.ok) {
        router.replace('/student/login');
        return;
      }

      const res  = await fetch('/api/student/timetable', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body && typeof body === 'object' && 'message' in body
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load timetable.'
        );
        return;
      }
      const unwrapped = unwrap<TimetableData | null>(body);
      setData(unwrapped);
    } catch {
      setError('Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchTimetable();
  }, [fetchTimetable]);

  // Build slot map: "dow-period" → slot
  const slotMap = useMemo<Record<string, TimetableSlot>>(() => {
    if (!data?.slots) return {};
    const map: Record<string, TimetableSlot> = {};
    for (const slot of data.slots) {
      map[`${slot.dayOfWeek}-${slot.periodNo}`] = slot;
    }
    return map;
  }, [data]);

  // Only render periods that have at least one slot (or always show 1–8)
  const activePeriods = PERIODS;

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">
              Timetable
              {data && (
                <span className="ml-2 text-base font-normal text-[#6D6A7C]">
                  — Class {data.classLevel} · Section {data.section}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">Your weekly class schedule.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchTimetable()}
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
            Loading timetable…
          </div>
        )}

        {!loading && data && (
          <>
            {/* ── Desktop grid (md+) ── */}
            <div className="mt-6 hidden md:block overflow-x-auto">
              <div
                className="grid gap-px bg-[#E8E4DC] rounded-2xl overflow-hidden border border-[#E8E4DC]"
                style={{ gridTemplateColumns: `56px repeat(${DAYS.length}, 1fr)` }}
              >
                {/* Header row */}
                <div className="bg-[#F7F3EE] px-2 py-3" />
                {DAYS.map((day) => {
                  const isToday = day.dow === TODAY_DOW;
                  return (
                    <div
                      key={day.dow}
                      className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                        isToday
                          ? 'bg-navy-700 text-white'
                          : 'bg-[#F7F3EE] text-[#8A8AAA]'
                      }`}
                    >
                      {day.label}
                      {isToday && <span className="ml-1 text-[10px] opacity-70">today</span>}
                    </div>
                  );
                })}

                {/* Period rows */}
                {activePeriods.map((period) => (
                  <div key={`row-${period}`} className="contents">
                    {/* Period label */}
                    <div
                      className="bg-[#F7F3EE] px-2 py-3 flex items-center justify-center"
                    >
                      <span className="text-xs text-[#8A8AAA] font-medium">P{period}</span>
                    </div>

                    {/* Cells for each day */}
                    {DAYS.map((day) => {
                      const isToday = day.dow === TODAY_DOW;
                      const slot    = slotMap[`${day.dow}-${period}`];
                      return (
                        <div
                          key={`${day.dow}-${period}`}
                          className={`bg-white min-h-[64px] p-2 flex items-center justify-center ${
                            isToday ? 'ring-inset ring-1 ring-navy-200' : ''
                          }`}
                        >
                          {slot ? (
                            <div className={`w-full rounded-lg border px-2 py-1.5 text-center ${subjectCellClass(slot.subject)}`}>
                              <p className="text-xs font-semibold leading-tight">{slot.subject}</p>
                              {slot.startTime && (
                                <p className="mt-0.5 text-[10px] opacity-70">
                                  {slot.startTime}–{slot.endTime}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#D0CCDE] text-sm select-none">–</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Mobile: stacked day cards ── */}
            <div className="mt-6 flex flex-col gap-4 md:hidden">
              {DAYS.map((day) => {
                const isToday = day.dow === TODAY_DOW;
                const daySlots = activePeriods
                  .map((p) => ({ period: p, slot: slotMap[`${day.dow}-${p}`] ?? null }))
                  .filter((e) => e.slot !== null);

                return (
                  <div
                    key={day.dow}
                    className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${
                      isToday ? 'border-navy-300 ring-2 ring-navy-200' : 'border-[#E8E4DC]'
                    }`}
                  >
                    <div
                      className={`px-4 py-2.5 text-sm font-semibold ${
                        isToday ? 'bg-navy-700 text-white' : 'bg-[#F7F3EE] text-[#6D6A7C]'
                      }`}
                    >
                      {day.label}{isToday ? ' · Today' : ''}
                    </div>

                    {daySlots.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-[#8A8AAA]">No classes scheduled.</p>
                    ) : (
                      <div className="divide-y divide-[#F0EDE6]">
                        {daySlots.map(({ period, slot }) => {
                          if (!slot) return null;
                          return (
                            <div key={period} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="w-6 shrink-0 text-xs font-medium text-[#8A8AAA]">P{period}</span>
                              <span
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${subjectCellClass(slot.subject)}`}
                              >
                                {slot.subject}
                              </span>
                              {slot.startTime && (
                                <span className="text-xs text-[#8A8AAA]">
                                  {slot.startTime}–{slot.endTime}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && !data && !error && (
          <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center text-sm text-[#8A8AAA]">
            No timetable data available.
          </div>
        )}
      </div>
    </div>
  );
}
