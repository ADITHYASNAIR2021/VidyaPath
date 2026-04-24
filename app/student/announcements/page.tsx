'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone, RefreshCw } from 'lucide-react';

interface StudentAnnouncement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  source: 'school' | 'teacher';
  subject?: string;
  classLevel?: 10 | 12;
  section?: string;
  chapterId?: string;
}

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function formatDate(value: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function AnnouncementCard({ item }: { item: StudentAnnouncement }) {
  const isTeacher = item.source === 'teacher';
  return (
    <article
      className={`rounded-2xl border px-4 py-4 shadow-sm ${
        isTeacher ? 'border-amber-200 bg-amber-50/60' : 'border-[#E8E4DC] bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isTeacher ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          {isTeacher ? 'Teacher' : 'School'}
        </span>
        {item.subject && (
          <span className="rounded-full bg-[#F0EDE6] px-2.5 py-0.5 text-xs font-semibold text-[#5A5570]">
            {item.subject}
          </span>
        )}
        {item.chapterId && (
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-mono text-[#5A5570]">
            {item.chapterId}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-sm font-semibold text-[#1E1B2E]">{item.title}</h2>
      <p className="mt-1 text-sm text-[#534F66] whitespace-pre-wrap">{item.body}</p>
      <p className="mt-2 text-xs text-[#8A8AAA]">{formatDate(item.createdAt)}</p>
    </article>
  );
}

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<StudentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/student/announcements', { cache: 'no-store' });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
            ? String((body as Record<string, unknown>).message)
            : 'Failed to load announcements.';
        setError(message);
        return;
      }
      const data = unwrap<{ announcements?: StudentAnnouncement[] } | null>(body);
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const schoolAnnouncements = useMemo(
    () => announcements.filter((item) => item.source === 'school'),
    [announcements]
  );
  const teacherAnnouncements = useMemo(
    () => announcements.filter((item) => item.source === 'teacher'),
    [announcements]
  );

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">Announcements</h1>
            <p className="mt-1 text-sm text-[#6D6A7C]">School and teacher updates in one place.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-[#E8E4DC] bg-white px-3 py-2 text-sm text-[#6D6A7C] hover:bg-[#F7F3EE] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-[#E8E4DC] bg-white p-6 text-sm text-[#8A8AAA]">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading announcements...
          </div>
        )}

        {!loading && !error && announcements.length === 0 && (
          <div className="mt-8 rounded-2xl border border-[#E8E4DC] bg-white p-8 text-center text-sm text-[#8A8AAA]">
            No announcements yet.
          </div>
        )}

        {!loading && announcements.length > 0 && (
          <div className="mt-6 space-y-6">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-[#303045]">School-wide ({schoolAnnouncements.length})</h2>
              </div>
              {schoolAnnouncements.length === 0 ? (
                <p className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-3 text-sm text-[#8A8AAA]">
                  No school-wide announcements.
                </p>
              ) : (
                <div className="space-y-3">
                  {schoolAnnouncements.map((item) => (
                    <AnnouncementCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-amber-700" />
                <h2 className="text-sm font-semibold text-[#303045]">Teacher updates ({teacherAnnouncements.length})</h2>
              </div>
              {teacherAnnouncements.length === 0 ? (
                <p className="rounded-xl border border-[#E8E4DC] bg-white px-4 py-3 text-sm text-[#8A8AAA]">
                  No teacher announcements for your enrolled subjects.
                </p>
              ) : (
                <div className="space-y-3">
                  {teacherAnnouncements.map((item) => (
                    <AnnouncementCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

