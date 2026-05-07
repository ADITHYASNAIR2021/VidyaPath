'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';

type AssignmentItem = {
  packId: string;
  title: string;
  subject: string;
  chapterId: string;
  dueDate?: string;
  status?: string;
};

type WeeklyPlanItem = {
  planId: string;
  title: string;
  subject?: string;
  dueDate?: string;
  planWeeks?: Array<{ week: string; focusTopics?: string[] }>;
};

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  source?: string;
};

type TimetableItem = {
  id: string;
  dayOfWeek: string;
  periodNo?: number;
  startTime?: string;
  endTime?: string;
  subject?: string;
  teacherName?: string;
};

type AttendanceSummary = {
  percentage: number;
  present: number;
  absent: number;
  late: number;
  total: number;
};

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)) {
    const maybe = (payload as Record<string, unknown>).message;
    if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
  }
  return fallback;
}

function toDateValue(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function humanDay(dayIndex: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex] || 'Today';
}

export default function StudentTodayPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlanItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [timetable, setTimetable] = useState<TimetableItem[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);

  async function loadToday() {
    setLoading(true);
    setError('');
    try {
      const [
        assignmentsRes,
        plansRes,
        announcementsRes,
        timetableRes,
        attendanceRes,
      ] = await Promise.all([
        fetch('/api/student/assignments', { cache: 'no-store' }),
        fetch('/api/student/weekly-plans?limit=20', { cache: 'no-store' }),
        fetch('/api/student/announcements?limit=20', { cache: 'no-store' }),
        fetch('/api/student/timetable', { cache: 'no-store' }),
        fetch('/api/student/attendance?days=90', { cache: 'no-store' }),
      ]);

      const assignmentsBody = unwrap<{ assignments?: AssignmentItem[] } | null>(await assignmentsRes.json().catch(() => null));
      const plansBody = unwrap<{ weeklyPlans?: WeeklyPlanItem[] } | null>(await plansRes.json().catch(() => null));
      const announcementsBody = unwrap<{ announcements?: AnnouncementItem[] } | null>(await announcementsRes.json().catch(() => null));
      const timetableBody = unwrap<{ slots?: TimetableItem[] } | null>(await timetableRes.json().catch(() => null));
      const attendanceBody = unwrap<AttendanceSummary | null>(await attendanceRes.json().catch(() => null));

      if (
        assignmentsRes.status === 401 ||
        plansRes.status === 401 ||
        announcementsRes.status === 401 ||
        timetableRes.status === 401 ||
        attendanceRes.status === 401
      ) {
        setError('Session expired. Please sign in again.');
        return;
      }
      if (!assignmentsRes.ok) {
        setError(extractApiMessage(assignmentsBody, 'Failed to load assignments.'));
        return;
      }
      if (!plansRes.ok) {
        setError(extractApiMessage(plansBody, 'Failed to load weekly plans.'));
        return;
      }
      if (!announcementsRes.ok) {
        setError(extractApiMessage(announcementsBody, 'Failed to load announcements.'));
        return;
      }
      if (!timetableRes.ok) {
        setError(extractApiMessage(timetableBody, 'Failed to load timetable.'));
        return;
      }
      if (!attendanceRes.ok) {
        setError(extractApiMessage(attendanceBody, 'Failed to load attendance summary.'));
        return;
      }

      setAssignments(Array.isArray(assignmentsBody?.assignments) ? assignmentsBody.assignments : []);
      setWeeklyPlans(Array.isArray(plansBody?.weeklyPlans) ? plansBody.weeklyPlans : []);
      setAnnouncements(Array.isArray(announcementsBody?.announcements) ? announcementsBody.announcements : []);
      setTimetable(Array.isArray(timetableBody?.slots) ? timetableBody.slots : []);
      setAttendance(attendanceBody);
    } catch {
      setError('Failed to load Today view.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadToday();
  }, []);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  const dueToday = useMemo(
    () => assignments
      .filter((item) => {
        const due = toDateValue(item.dueDate);
        return due >= todayStart.getTime() && due < tomorrowStart.getTime();
      })
      .sort((a, b) => toDateValue(a.dueDate) - toDateValue(b.dueDate)),
    [assignments, todayStart, tomorrowStart]
  );

  const dueSoon = useMemo(
    () => assignments
      .filter((item) => {
        const due = toDateValue(item.dueDate);
        return due >= todayStart.getTime();
      })
      .sort((a, b) => toDateValue(a.dueDate) - toDateValue(b.dueDate))
      .slice(0, 6),
    [assignments, todayStart]
  );

  const todayDayName = humanDay(new Date().getDay());
  const todayTimetable = useMemo(
    () => timetable
      .filter((slot) => slot.dayOfWeek?.toLowerCase?.() === todayDayName.toLowerCase())
      .sort((a, b) => (a.periodNo ?? 0) - (b.periodNo ?? 0)),
    [timetable, todayDayName]
  );

  const weeklyFocus = useMemo(() => {
    const topics: string[] = [];
    for (const plan of weeklyPlans.slice(0, 3)) {
      const week = Array.isArray(plan.planWeeks) ? plan.planWeeks[0] : undefined;
      const weekTopics = Array.isArray(week?.focusTopics) ? week?.focusTopics : [];
      for (const topic of weekTopics.slice(0, 3)) topics.push(topic);
    }
    return topics.slice(0, 6);
  }, [weeklyPlans]);

  const nextBestAction = useMemo(() => {
    if (dueToday.length > 0) {
      return `Finish ${dueToday[0].title} (${dueToday[0].subject}) before today ends.`;
    }
    if ((attendance?.percentage ?? 100) < 85) {
      return 'Raise attendance this week by attending all scheduled periods today.';
    }
    if (weeklyFocus.length > 0) {
      return `Revise ${weeklyFocus[0]} first, then complete one practice set.`;
    }
    if (dueSoon.length > 0) {
      return `Start ${dueSoon[0].title} early to avoid deadline pressure.`;
    }
    return 'Use AI tools for one targeted chapter revision session today.';
  }, [dueToday, attendance?.percentage, weeklyFocus, dueSoon]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Today</h1>
          <p className="mt-1 text-sm text-gray-500">Your day plan with due work, classes, and one next best action.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadToday()}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh</span>
        </button>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">One Next Best Action</p>
        <p className="mt-1 text-sm font-semibold text-indigo-900">{nextBestAction}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Due Today</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{dueToday.length}</p>
          <p className="mt-1 text-xs text-gray-500">Assignments with today&apos;s deadline</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Attendance</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{attendance ? `${attendance.percentage}%` : '-'}</p>
          <p className="mt-1 text-xs text-gray-500">Present {attendance?.present ?? 0} / {attendance?.total ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Weekly Focus Topics</p>
          <p className="mt-1 text-2xl font-bold text-[#1C1C2E]">{weeklyFocus.length}</p>
          <p className="mt-1 text-xs text-gray-500">From your active weekly plans</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Due Work</h2>
          <div className="mt-3 space-y-2">
            {dueSoon.map((item) => (
              <div key={item.packId} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-gray-600">{item.subject} | Due {item.dueDate ? new Date(item.dueDate).toLocaleString() : 'No due date'}</p>
              </div>
            ))}
            {dueSoon.length === 0 ? <p className="text-xs text-gray-500">No upcoming assignment deadlines.</p> : null}
          </div>
          <Link href="/student/assignments" className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800">Open assignments</Link>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Today&apos;s Timetable ({todayDayName})</h2>
          <div className="mt-3 space-y-2">
            {todayTimetable.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{slot.subject || 'Class'}{slot.periodNo ? ` - P${slot.periodNo}` : ''}</p>
                  <p className="text-xs text-gray-600">{slot.teacherName || 'Teacher TBD'}</p>
                </div>
                <p className="text-xs text-gray-600">{slot.startTime || '--'} to {slot.endTime || '--'}</p>
              </div>
            ))}
            {todayTimetable.length === 0 ? <p className="text-xs text-gray-500">No classes scheduled for today.</p> : null}
          </div>
          <Link href="/student/timetable" className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800">Open full timetable</Link>
        </section>

        <section className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-800">Teacher Notes and Announcements</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {announcements.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-xl border border-[#E8E4DC] bg-[#FCFBF8] px-3 py-2">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-1 text-xs text-gray-600 line-clamp-3">{item.body}</p>
                <p className="mt-1 text-[11px] text-gray-500">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
            {announcements.length === 0 ? <p className="text-xs text-gray-500">No announcements posted yet.</p> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/student/announcements" className="inline-flex items-center gap-1 rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><CalendarDays className="h-3.5 w-3.5" />All announcements</Link>
            <Link href="/student/ai-tools" className="inline-flex items-center gap-1 rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Clock3 className="h-3.5 w-3.5" />AI study tools</Link>
            <Link href="/notifications" className="inline-flex items-center gap-1 rounded-lg border border-[#E8E4DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><AlertCircle className="h-3.5 w-3.5" />Notification center</Link>
          </div>
        </section>
      </div>

      {loading ? (
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing today view
        </div>
      ) : (
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Today view updated
        </div>
      )}
    </div>
  );
}
