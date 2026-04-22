'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  Sun,
  Users,
  Calendar,
  ChevronDown,
} from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  type: 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';
  eventDate: string;
  classLevel: number;
  section: string;
  createdBy: string;
  createdAt: string;
}

interface CalendarData {
  events: CalendarEvent[];
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const TYPE_BADGE: Record<CalendarEvent['type'], string> = {
  exam: 'bg-rose-50 text-rose-700 border-rose-200',
  assignment_due: 'bg-amber-50 text-amber-700 border-amber-200',
  holiday: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  meeting: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-gray-50 text-gray-600 border-gray-200',
};

const TYPE_DATE_BOX: Record<CalendarEvent['type'], string> = {
  exam: 'bg-rose-100 text-rose-800',
  assignment_due: 'bg-amber-100 text-amber-800',
  holiday: 'bg-emerald-100 text-emerald-800',
  meeting: 'bg-indigo-100 text-indigo-800',
  other: 'bg-gray-100 text-gray-700',
};

const TYPE_LABEL: Record<CalendarEvent['type'], string> = {
  exam: 'Exam',
  assignment_due: 'Assignment',
  holiday: 'Holiday',
  meeting: 'Meeting',
  other: 'Other',
};

function EventIcon({ type }: { type: CalendarEvent['type'] }) {
  const cls = 'h-5 w-5';
  if (type === 'exam') return <BookOpen className={cls} />;
  if (type === 'assignment_due') return <ClipboardList className={cls} />;
  if (type === 'holiday') return <Sun className={cls} />;
  if (type === 'meeting') return <Users className={cls} />;
  return <Calendar className={cls} />;
}

type FilterType = 'all' | 'exam' | 'assignment_due' | 'holiday';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'exam', label: 'Exams' },
  { value: 'assignment_due', label: 'Assignments' },
  { value: 'holiday', label: 'Holidays' },
];

function daysAway(eventDate: string, todayIso: string): string {
  const today = new Date(todayIso);
  const event = new Date(eventDate);
  // strip time
  today.setHours(0, 0, 0, 0);
  event.setHours(0, 0, 0, 0);
  const diff = Math.round((event.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

function formatEventDate(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr);
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

function EventCard({
  event,
  isUpcoming,
  todayIso,
}: {
  event: CalendarEvent;
  isUpcoming: boolean;
  todayIso: string;
}) {
  const { day, month } = formatEventDate(event.eventDate);
  const isToday = event.eventDate === todayIso;

  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm p-4 flex gap-4 items-start ${
        isToday ? 'border-amber-300 ring-1 ring-amber-200' : 'border-[#E8E4DC]'
      }`}
    >
      {/* Date box */}
      <div
        className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl w-14 h-14 font-bold ${TYPE_DATE_BOX[event.type]}`}
      >
        <span className="text-xl leading-none">{day}</span>
        <span className="text-xs uppercase tracking-wide mt-0.5">{month}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[#3D3A4E]">
            <EventIcon type={event.type} />
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE[event.type]}`}
          >
            {TYPE_LABEL[event.type]}
          </span>
          {isToday && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Today
            </span>
          )}
        </div>

        <p className="mt-1.5 font-semibold text-[#1E1B2E] leading-snug">{event.title}</p>
        {event.description && (
          <p className="mt-0.5 text-sm text-[#6D6A7C] line-clamp-2">{event.description}</p>
        )}

        {isUpcoming && (
          <p className="mt-1.5 text-xs font-medium text-[#8A8AAA]">
            {daysAway(event.eventDate, todayIso)}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionToggle({
  title,
  count,
  children,
  defaultOpen,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-fraunces text-lg font-bold text-navy-700">{title}</span>
          <span className="rounded-full bg-[#F0EDE6] px-2.5 py-0.5 text-xs font-semibold text-[#6D6A7C]">
            {count}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-[#8A8AAA] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

export default function StudentCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const todayIso = new Date().toISOString().slice(0, 10);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/calendar', { cache: 'no-store' });
      if (res.status === 401) {
        setError('Session expired. Please sign in again.');
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load calendar.';
        setError(msg);
        return;
      }
      const data = unwrap<CalendarData>(body);
      setEvents(data?.events ?? []);
    } catch {
      setError('Failed to load calendar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = events.filter((e) => {
    if (activeFilter === 'all') return true;
    return e.type === activeFilter;
  });

  const upcoming = filtered
    .filter((e) => e.eventDate >= todayIso)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const past = filtered
    .filter((e) => e.eventDate < todayIso)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Academic Calendar</h1>
          <p className="mt-1 text-sm text-[#6D6A7C]">
            Upcoming exams, assignments, and school events.
          </p>
        </div>

        {/* Today's date highlight */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-sm text-amber-800 font-medium">
          <Calendar className="h-4 w-4" />
          Today is{' '}
          {new Date(todayIso).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>

        {/* Filter buttons */}
        <div className="mt-5 flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeFilter === f.value
                  ? 'bg-navy-700 border-navy-700 text-white'
                  : 'bg-white border-[#E8E4DC] text-[#3D3A4E] hover:bg-[#F9F7F2]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-6 flex flex-col gap-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-20 animate-pulse rounded-2xl border border-[#E8E4DC] bg-white"
              />
            ))}
          </div>
        )}

        {/* Events */}
        {!loading && !error && (
          <>
            <SectionToggle title="Upcoming" count={upcoming.length} defaultOpen={true}>
              {upcoming.length === 0 ? (
                <p className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-6 text-sm text-[#8A8AAA] text-center">
                  No upcoming events.
                </p>
              ) : (
                upcoming.map((e) => (
                  <EventCard key={e.id} event={e} isUpcoming={true} todayIso={todayIso} />
                ))
              )}
            </SectionToggle>

            <SectionToggle title="Past" count={past.length} defaultOpen={false}>
              {past.length === 0 ? (
                <p className="rounded-2xl border border-[#E8E4DC] bg-white px-5 py-6 text-sm text-[#8A8AAA] text-center">
                  No past events.
                </p>
              ) : (
                past.map((e) => (
                  <EventCard key={e.id} event={e} isUpcoming={false} todayIso={todayIso} />
                ))
              )}
            </SectionToggle>
          </>
        )}
      </div>
    </div>
  );
}
