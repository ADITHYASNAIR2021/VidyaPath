'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import { Megaphone, ShieldAlert, Sparkles, Trophy } from 'lucide-react';

interface TeacherConfigResponse {
  updatedAt: string;
  importantTopics: Record<string, string[]>;
  quizLinks: Record<string, string>;
  announcements: Array<{ id: string; title: string; body: string; createdAt: string }>;
  analytics?: {
    updatedAt: string;
    topAiChapters: Array<{ chapterId: string; chapterTitle: string; count: number }>;
    topChapterViews: Array<{ chapterId: string; chapterTitle: string; count: number }>;
    topSearchNoResults: Array<{ query: string; count: number }>;
  };
}

const TEACHER_CHAPTERS = ALL_CHAPTERS.filter((chapter) => chapter.classLevel !== 11);

export default function TeacherPortalPage() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key')?.trim() ?? '';

  const [chapterId, setChapterId] = useState(TEACHER_CHAPTERS[0]?.id ?? '');
  const [importantTopicsInput, setImportantTopicsInput] = useState('');
  const [quizLink, setQuizLink] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<TeacherConfigResponse | null>(null);

  const chapterLabel = useMemo(() => {
    const chapter = TEACHER_CHAPTERS.find((item) => item.id === chapterId);
    return chapter ? `${chapter.subject} - Class ${chapter.classLevel} - ${chapter.title}` : chapterId;
  }, [chapterId]);

  async function loadConfig() {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/teacher?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Unauthorized teacher key.');
        return;
      }
      setConfig(data as TeacherConfigResponse);
      setImportantTopicsInput((data as TeacherConfigResponse).importantTopics?.[chapterId]?.join(', ') ?? '');
      setQuizLink((data as TeacherConfigResponse).quizLinks?.[chapterId] ?? '');
    } catch {
      setError('Failed to load teacher config.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!config) return;
    setImportantTopicsInput(config.importantTopics?.[chapterId]?.join(', ') ?? '');
    setQuizLink(config.quizLinks?.[chapterId] ?? '');
  }, [chapterId, config]);

  async function submitAction(payload: Record<string, unknown>) {
    if (!key) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/teacher?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.error || 'Update failed.');
        return;
      }
      setConfig((prev) => ({
        ...(prev ?? ({} as TeacherConfigResponse)),
        ...(data.config as TeacherConfigResponse),
        analytics: prev?.analytics,
      }));
    } catch {
      setError('Network error while updating.');
    } finally {
      setLoading(false);
    }
  }

  if (!key) {
    return (
      <div className="min-h-screen bg-[#FDFAF6] px-4 py-16">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-[#E8E4DC] p-6 shadow-sm">
          <h1 className="font-fraunces text-2xl font-bold text-navy-700 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Teacher Portal Access
          </h1>
          <p className="text-sm text-[#5F5A73] mt-3">
            Open this page with your teacher key:
          </p>
          <code className="block mt-2 text-xs bg-[#F4F1EA] border border-[#E8E4DC] rounded-xl px-3 py-2">
            /teacher?key=YOUR_SECRET_KEY
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-amber-600 to-orange-600 text-white px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold">Teacher Portal</h1>
          <p className="text-amber-100 mt-2 text-sm">
            Publish important topics, chapter quiz links, and announcements. Track AI hot chapters.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
            <h2 className="font-fraunces text-lg font-bold text-navy-700">Chapter Controls</h2>
            <p className="text-xs text-[#6A6A84] mt-1">Selected: {chapterLabel}</p>

            <select
              value={chapterId}
              onChange={(event) => setChapterId(event.target.value)}
              className="w-full mt-3 text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {TEACHER_CHAPTERS.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  Class {chapter.classLevel} - {chapter.subject} - {chapter.title}
                </option>
              ))}
            </select>

            <div className="mt-3 grid gap-3">
              <textarea
                value={importantTopicsInput}
                onChange={(event) => setImportantTopicsInput(event.target.value)}
                rows={3}
                placeholder="Important topics this year (comma separated)"
                className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                disabled={loading}
                onClick={() =>
                  submitAction({
                    action: 'set-important-topics',
                    chapterId,
                    topics: importantTopicsInput
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                className="justify-self-start text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl disabled:opacity-50"
              >
                Save Important Topics
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                value={quizLink}
                onChange={(event) => setQuizLink(event.target.value)}
                placeholder="Google Form quiz URL for this chapter"
                className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                disabled={loading}
                onClick={() => submitAction({ action: 'set-quiz-link', chapterId, url: quizLink })}
                className="justify-self-start text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl disabled:opacity-50"
              >
                Save Quiz Link
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
            <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-saffron-500" />
              Announcements
            </h2>
            <div className="mt-3 grid gap-3">
              <input
                value={announcementTitle}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
                placeholder="Announcement title"
                className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-saffron-400"
              />
              <textarea
                value={announcementBody}
                onChange={(event) => setAnnouncementBody(event.target.value)}
                rows={3}
                placeholder="Announcement body"
                className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-saffron-400"
              />
              <button
                disabled={loading}
                onClick={() => {
                  submitAction({
                    action: 'add-announcement',
                    title: announcementTitle,
                    body: announcementBody,
                  });
                  setAnnouncementTitle('');
                  setAnnouncementBody('');
                }}
                className="justify-self-start text-sm font-semibold bg-saffron-500 hover:bg-saffron-600 text-white px-4 py-2 rounded-xl disabled:opacity-50"
              >
                Publish Announcement
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(config?.announcements ?? []).map((announcement) => (
                <div key={announcement.id} className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 flex justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">{announcement.title}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{announcement.body}</p>
                  </div>
                  <button
                    onClick={() => submitAction({ action: 'remove-announcement', id: announcement.id })}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
            <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-indigo-500" />
              AI Hot Chapters
            </h2>
            <p className="text-xs text-[#6A6A84] mt-1">Most asked in VidyaAI chats</p>
            <div className="mt-3 space-y-2">
              {(config?.analytics?.topAiChapters ?? []).slice(0, 8).map((item) => (
                <div key={item.chapterId} className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
                  <p className="text-xs font-semibold text-indigo-900">{item.chapterTitle}</p>
                  <p className="text-[11px] text-indigo-700 mt-0.5">{item.count} AI questions</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
            <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              Search Misses
            </h2>
            <p className="text-xs text-[#6A6A84] mt-1">Queries students searched but didn&apos;t find</p>
            <div className="mt-3 space-y-2">
              {(config?.analytics?.topSearchNoResults ?? []).slice(0, 8).map((item) => (
                <div key={item.query} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-900">{item.query}</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">{item.count} misses</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        </div>
      )}
    </div>
  );
}

