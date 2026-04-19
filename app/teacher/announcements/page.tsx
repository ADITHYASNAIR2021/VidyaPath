'use client';

import { useEffect, useState } from 'react';
import { ALL_CHAPTERS } from '@/lib/data';
import type { TeacherScope } from '@/lib/teacher-types';
import { Megaphone, Plus, RefreshCw, Users, BookOpen, School, Layers, Trash2 } from 'lucide-react';
import BackButton from '@/components/BackButton';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  deliveryScope?: string;
  batch?: string;
  chapterId?: string;
}

interface SchoolAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'teachers' | 'students' | 'class10' | 'class12';
  createdAt: string;
}

const SCOPE_OPTIONS = [
  { value: 'class',   label: 'Entire Class',   icon: School },
  { value: 'section', label: 'My Section',      icon: Layers },
  { value: 'batch',   label: 'Specific Batch',  icon: Users },
  { value: 'chapter', label: 'Chapter Focused', icon: BookOpen },
];

export default function TeacherAnnouncementsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [schoolAnnouncements, setSchoolAnnouncements] = useState<SchoolAnnouncement[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [scopes, setScopes] = useState<TeacherScope[]>([]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<'class' | 'section' | 'batch' | 'chapter'>('chapter');
  const [batch, setBatch] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Chapters filtered to teacher's active scopes
  const chapters = scopes.length === 0
    ? ALL_CHAPTERS
    : ALL_CHAPTERS.filter((ch) =>
        scopes.some((s) => s.isActive && s.classLevel === ch.classLevel && s.subject === ch.subject)
      );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, configRes, schoolRes] = await Promise.all([
        fetch('/api/teacher/session/me', { cache: 'no-store' }),
        fetch('/api/teacher', { cache: 'no-store' }),
        fetch('/api/teacher/school-announcements?limit=6', { cache: 'no-store' }),
      ]);
      if (!sessionRes.ok) { setError('Session expired. Please sign in again.'); return; }
      const sessionData = unwrap<{ effectiveScopes?: TeacherScope[] } | null>(await sessionRes.json().catch(() => null));
      setScopes(Array.isArray(sessionData?.effectiveScopes) ? sessionData.effectiveScopes : []);

      const cfgBody = await configRes.json().catch(() => null);
      const cfg = unwrap<{ announcements?: Announcement[] } | null>(cfgBody);
      if (!configRes.ok || !cfg) { setError('Failed to load.'); return; }
      const list = cfg.announcements ?? [];
      setAnnouncements(list);

      const schoolBody = await schoolRes.json().catch(() => null);
      const schoolData = unwrap<{ announcements?: SchoolAnnouncement[] } | null>(schoolBody);
      setSchoolAnnouncements(Array.isArray(schoolData?.announcements) ? schoolData.announcements.slice(0, 4) : []);

      const ids = list.map((a) => a.id).filter(Boolean);
      if (ids.length > 0) {
        const rc = await fetch(`/api/teacher/announcement-reads?announcementIds=${ids.join(',')}`, { cache: 'no-store' });
        const rcBody = await rc.json().catch(() => null);
        const rcData = unwrap<{ readCounts?: Record<string, number> } | null>(rcBody);
        if (rc.ok && rcData?.readCounts) setReadCounts(rcData.readCounts);
      }
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function removeAnnouncement(id: string) {
    if (!confirm('Delete this announcement? This cannot be undone.')) return;
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch('/api/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-announcement', announcementId: id }),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok) { setError(resBody?.message ?? 'Failed to delete announcement.'); return; }
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('Failed to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  }

  async function send() {
    if (!title.trim() || !body.trim()) return;
    if (scope === 'chapter' && !chapterId) { setError('Select a chapter for chapter-focused announcements.'); return; }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-announcement',
          title: title.trim(),
          body: body.trim(),
          deliveryScope: scope,
          batch: batch.trim() || undefined,
          chapterId: scope === 'chapter' ? chapterId : undefined,
        }),
      });
      const resBody = await res.json().catch(() => null);
      if (!res.ok) { setError(resBody?.message ?? 'Failed to send announcement.'); return; }
      setTitle(''); setBody(''); setBatch(''); setChapterId('');
      setShowForm(false);
      await load();
    } catch {
      setError('Failed to send announcement.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <BackButton href="/teacher" label="Dashboard" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-600" /> Announcements
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Send notices to your class, section, batch, or specific chapter.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showForm && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
          <h2 className="font-semibold text-amber-800">New Announcement</h2>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief subject…" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Message</label>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your announcement…" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Audience</label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value as typeof scope)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${scope === value ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter selector — shown only when scope === 'chapter' */}
          {scope === 'chapter' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Select Chapter</label>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Choose a chapter —</option>
                {chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    Class {ch.classLevel} · {ch.subject} · {ch.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'batch' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Batch / Section Name</label>
              <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. Batch A" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={send} disabled={!title.trim() || !body.trim() || sending} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors">
              {sending ? 'Sending…' : 'Send Announcement'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {loading && announcements.length === 0 && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {!loading && announcements.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No announcements yet</p>
          <p className="text-sm mt-1">Send your first announcement to your class.</p>
        </div>
      )}

      {schoolAnnouncements.length > 0 && (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-semibold text-indigo-900 mb-2">School Broadcasts (Admin)</p>
          <div className="space-y-2">
            {schoolAnnouncements.map((announcement) => (
              <div key={announcement.id} className="rounded-xl border border-indigo-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-indigo-900">{announcement.title}</p>
                <p className="text-[11px] text-indigo-700 truncate">{announcement.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {announcements.map((ann) => {
          const chapter = ann.chapterId ? ALL_CHAPTERS.find((c) => c.id === ann.chapterId) : null;
          return (
            <div key={ann.id} className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{ann.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{ann.body}</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {readCounts[ann.id] != null && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                      <Users className="w-3 h-3" /> {readCounts[ann.id]} read
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAnnouncement(ann.id)}
                    disabled={deletingId === ann.id}
                    title="Delete announcement"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center flex-wrap gap-2 text-xs text-gray-400">
                {ann.deliveryScope && <span className="px-2 py-0.5 bg-gray-100 rounded-full capitalize">{ann.deliveryScope}</span>}
                {chapter && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {chapter.title}
                  </span>
                )}
                {ann.batch && <span className="px-2 py-0.5 bg-gray-100 rounded-full">{ann.batch}</span>}
                <span>{new Date(ann.createdAt).toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
