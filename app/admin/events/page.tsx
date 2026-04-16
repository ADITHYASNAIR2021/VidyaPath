'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

type EventType = 'exam' | 'assignment_due' | 'holiday' | 'meeting' | 'other';

interface EventItem {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  eventDate: string;
  classLevel?: 10 | 12;
  section?: string;
  createdBy: string;
  createdAt: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const TYPE_COLORS: Record<EventType, string> = {
  exam: 'bg-rose-50 text-rose-700 border-rose-200',
  assignment_due: 'bg-amber-50 text-amber-700 border-amber-200',
  holiday: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  meeting: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>('');
  const [activeMonth, setActiveMonth] = useState(toMonthKey(new Date()));
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'other' as EventType,
    eventDate: todayIso(),
    classLevel: '' as '' | '10' | '12',
    section: '',
  });

  async function loadEvents() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, eventsRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/events?limit=500', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const body = await eventsRes.json().catch(() => null);
      if (!eventsRes.ok) {
        setError(body?.message || 'Failed to load events.');
        setEvents([]);
        return;
      }
      const data = unwrap<{ events?: EventItem[] }>(body);
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError('Failed to load events.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  const monthDate = useMemo(() => {
    const [year, month] = activeMonth.split('-').map((part) => Number(part));
    return new Date(year, (month || 1) - 1, 1);
  }, [activeMonth]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const event of events) {
      const list = map.get(event.eventDate) ?? [];
      list.push(event);
      map.set(event.eventDate, list);
    }
    return map;
  }, [events]);

  const monthCells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ iso?: string; day?: number }> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push({});
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ iso, day });
    }
    while (cells.length % 7 !== 0) cells.push({});
    return cells;
  }, [monthDate]);

  async function addEvent() {
    if (!form.title.trim() || !form.eventDate) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          type: form.type,
          eventDate: form.eventDate,
          classLevel: form.classLevel ? Number(form.classLevel) : undefined,
          section: form.section.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to create event.');
        return;
      }
      setForm({
        title: '',
        description: '',
        type: form.type,
        eventDate: todayIso(),
        classLevel: '',
        section: '',
      });
      await loadEvents();
    } catch {
      setError('Failed to create event.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/admin/events?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to delete event.');
        return;
      }
      setEvents((prev) => prev.filter((event) => event.id !== id));
      setDeleteConfirmId('');
    } catch {
      setError('Failed to delete event.');
    }
  }

  function shiftMonth(offset: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    setActiveMonth(toMonthKey(next));
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-600" />
            Events
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage school-wide and class-targeted events with a monthly calendar view.</p>
        </div>
        <button
          onClick={() => void loadEvents()}
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

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Add Event</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Event title"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as EventType }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="other">Other</option>
            <option value="exam">Exam</option>
            <option value="assignment_due">Assignment Due</option>
            <option value="holiday">Holiday</option>
            <option value="meeting">Meeting</option>
          </select>
          <input
            type="date"
            value={form.eventDate}
            onChange={(event) => setForm((prev) => ({ ...prev, eventDate: event.target.value }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.classLevel}
            onChange={(event) => setForm((prev) => ({ ...prev, classLevel: event.target.value as '' | '10' | '12' }))}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Class (optional)</option>
            <option value="10">Class 10</option>
            <option value="12">Class 12</option>
          </select>
          <input
            value={form.section}
            onChange={(event) => setForm((prev) => ({ ...prev, section: event.target.value }))}
            placeholder="Section (optional)"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description (optional)"
            className="sm:col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          />
        </div>
        <div className="mt-4">
          <button
            onClick={() => void addEvent()}
            disabled={saving || !form.title.trim() || !form.eventDate}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Saving...' : 'Add Event'}
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-gray-800">
            {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </h3>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500 mb-2">
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
          <div>Sun</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthCells.map((cell, index) => {
            const dayEvents = cell.iso ? (eventsByDate.get(cell.iso) ?? []) : [];
            return (
              <div
                key={`${cell.iso || 'empty'}-${index}`}
                className={clsx(
                  'min-h-[72px] rounded-lg border p-1.5 text-xs',
                  cell.iso ? 'border-[#E8E4DC] bg-white' : 'border-transparent bg-transparent'
                )}
              >
                {cell.day ? (
                  <>
                    <p className="font-semibold text-gray-600">{cell.day}</p>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <p key={event.id} className="truncate rounded bg-indigo-50 px-1 py-0.5 text-[10px] text-indigo-700">
                          {event.title}
                        </p>
                      ))}
                      {dayEvents.length > 2 && <p className="text-[10px] text-gray-400">+{dayEvents.length - 2} more</p>}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading events...
        </div>
      ) : sortedEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">No events found.</div>
      ) : (
        <div className="space-y-3">
          {sortedEvents.map((event) => (
            <div key={event.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{event.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(event.eventDate).toLocaleDateString('en-IN')}
                    {event.classLevel ? ` | Class ${event.classLevel}` : ''}
                    {event.section ? ` | Section ${event.section}` : ''}
                  </p>
                  {event.description && <p className="mt-2 text-sm text-[#4A4A6A]">{event.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx('rounded-full border px-2 py-1 text-[11px] font-semibold capitalize', TYPE_COLORS[event.type])}>
                    {event.type.replace('_', ' ')}
                  </span>
                  {deleteConfirmId === event.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void removeEvent(event.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId('')}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(event.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
