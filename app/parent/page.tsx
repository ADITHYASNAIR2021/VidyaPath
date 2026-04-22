'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ParentDashboardData {
  parentName?: string;
  phone: string;
  student: {
    id: string;
    name: string;
    classLevel: 10 | 12;
    section?: string;
    rollCode: string;
    batch?: string;
  };
  attendance: {
    percentage: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  grades: Array<{ subject: string; chapterId: string; score: number; createdAt: string; status: string }>;
  upcomingEvents: Array<{ id: string; title: string; eventDate: string; type: string }>;
  resources: Array<{ id: string; title: string; type: string; url: string; createdAt: string }>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/parent/dashboard', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        const data = unwrap<ParentDashboardData | null>(body);
        if (!res.ok || !data) {
          if (res.status === 401) {
            if (active) setError('Session expired. Please sign in again.');
            return;
          }
          if (active) setError(body?.message || 'Failed to load parent dashboard.');
          return;
        }
        if (active) setDashboard(data);
      } catch {
        if (active) setError('Failed to load parent dashboard.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function logout() {
    await fetch('/api/parent/session/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/parent/login');
  }

  if (loading) return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8">Loading parent dashboard...</div>;
  if (!dashboard) return <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 text-rose-700">{error || 'Parent dashboard unavailable.'}</div>;

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-fraunces text-2xl font-bold text-navy-700">Parent Dashboard</h1>
              <p className="mt-1 text-sm text-[#6D6A7C]">
                {dashboard.parentName ? `${dashboard.parentName} • ` : ''}
                Student: {dashboard.student.name} (Class {dashboard.student.classLevel}{dashboard.student.section ? ` ${dashboard.student.section}` : ''})
              </p>
            </div>
            <button type="button" onClick={logout} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Logout</button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs text-emerald-700">Attendance</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{dashboard.attendance.percentage}%</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs text-sky-700">Grades Recorded</p>
              <p className="mt-1 text-2xl font-bold text-sky-900">{dashboard.grades.length}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">Upcoming Events</p>
              <p className="mt-1 text-2xl font-bold text-amber-900">{dashboard.upcomingEvents.length}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-navy-700">Recent Grades</h2>
              <div className="mt-3 space-y-2 text-sm">
                {dashboard.grades.slice(0, 8).map((grade) => (
                  <div key={`${grade.chapterId}-${grade.createdAt}`} className="rounded-lg bg-[#F9F7F2] px-3 py-2">
                    <p className="font-medium text-navy-700">{grade.subject}</p>
                    <p className="text-xs text-[#6D6A7C]">{grade.chapterId} • {grade.score}%</p>
                  </div>
                ))}
                {dashboard.grades.length === 0 && <p className="text-xs text-[#8A8AAA]">No grades published yet.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-navy-700">Upcoming Events</h2>
              <div className="mt-3 space-y-2 text-sm">
                {dashboard.upcomingEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg bg-[#F9F7F2] px-3 py-2">
                    <p className="font-medium text-navy-700">{event.title}</p>
                    <p className="text-xs text-[#6D6A7C]">{new Date(event.eventDate).toLocaleDateString()} • {event.type.replace(/_/g, ' ')}</p>
                  </div>
                ))}
                {dashboard.upcomingEvents.length === 0 && <p className="text-xs text-[#8A8AAA]">No upcoming events.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 lg:col-span-2">
              <h2 className="text-sm font-semibold text-navy-700">School Announcements</h2>
              <div className="mt-3 space-y-2 text-sm">
                {dashboard.announcements.slice(0, 6).map((announcement) => (
                  <div key={announcement.id} className="rounded-lg bg-[#F9F7F2] px-3 py-2">
                    <p className="font-medium text-navy-700">{announcement.title}</p>
                    <p className="text-xs text-[#6D6A7C]">{announcement.body}</p>
                  </div>
                ))}
                {dashboard.announcements.length === 0 && <p className="text-xs text-[#8A8AAA]">No announcements yet.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

