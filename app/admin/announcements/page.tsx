'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, RefreshCw, Send } from 'lucide-react';
import BackButton from '@/components/BackButton';
import clsx from 'clsx';

type Audience = 'all' | 'teachers' | 'students' | 'class10' | 'class12';

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  createdByRole: 'admin' | 'developer';
  createdAt: string;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Everyone',
  teachers: 'Teachers',
  students: 'Students',
  class10: 'Class 10',
  class12: 'Class 12',
};

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'all' as Audience,
  });

  async function loadAnnouncements() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, listRes] = await Promise.all([
        fetch('/api/admin/session/me', { cache: 'no-store' }),
        fetch('/api/admin/announcements?limit=200', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) {
        router.replace('/admin/login');
        return;
      }
      const body = await listRes.json().catch(() => null);
      if (!listRes.ok) {
        setError(body?.message || 'Failed to load announcements.');
        setAnnouncements([]);
        return;
      }
      const data = unwrap<{ announcements?: Announcement[] }>(body);
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    } catch {
      setError('Failed to load announcements.');
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncements();
  }, []);

  const groupedCounts = useMemo(() => {
    const counts: Record<Audience, number> = { all: 0, teachers: 0, students: 0, class10: 0, class12: 0 };
    for (const item of announcements) counts[item.audience] += 1;
    return counts;
  }, [announcements]);

  async function sendAnnouncement() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim(),
          audience: form.audience,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Failed to send announcement.');
        return;
      }
      setForm({ title: '', body: '', audience: form.audience });
      await loadAnnouncements();
    } catch {
      setError('Failed to send announcement.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <BackButton href="/admin" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Bell className="h-6 w-6 text-indigo-600" />
            Announcements
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Broadcast school-wide notices to teachers and students.</p>
        </div>
        <button
          onClick={() => void loadAnnouncements()}
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

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((audience) => (
          <div key={audience} className="rounded-xl border border-[#E8E4DC] bg-white p-3 shadow-sm">
            <p className="text-xs text-[#7A7490]">{AUDIENCE_LABELS[audience]}</p>
            <p className="mt-1 text-xl font-semibold text-[#1C1C2E]">{groupedCounts[audience]}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-700">Create Announcement</h2>
        <div className="grid gap-3">
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <textarea
            rows={4}
            value={form.body}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            placeholder="Announcement message"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((audience) => (
              <button
                key={audience}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, audience }))}
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  form.audience === audience
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                )}
              >
                {AUDIENCE_LABELS[audience]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => void sendAnnouncement()}
            disabled={sending || !form.title.trim() || !form.body.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send Announcement'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading announcements...
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">
          No announcements posted yet.
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{announcement.title}</p>
                  <p className="mt-1 text-sm text-[#4A4A6A] whitespace-pre-line">{announcement.body}</p>
                  <p className="mt-2 text-[11px] text-gray-500">
                    {new Date(announcement.createdAt).toLocaleString()} | by {announcement.createdByRole}
                  </p>
                </div>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                  {AUDIENCE_LABELS[announcement.audience]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
