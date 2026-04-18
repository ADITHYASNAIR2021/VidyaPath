'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type { Subject } from '@/lib/data';
import { PenSquare, Save, CheckCircle2 } from 'lucide-react';
import { fetchClientStudentSession } from '@/lib/client-student-session';

function unwrap<T>(payload: unknown): T | null {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

interface NoteData {
  content: string;
  updatedAt?: string;
}

const AUTOSAVE_DELAY_MS = 1500;
const CLASS10_PUBLIC_SUBJECTS = new Set<Subject>(['Physics', 'Chemistry', 'Biology', 'Math', 'English Core']);

export default function StudentNotesPage() {
  const router = useRouter();
  const [chapterId, setChapterId] = useState('');
  const [content, setContent] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{
    classLevel: 10 | 12;
    enrolledSubjects: Subject[];
  } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scopedChapters = useMemo(() => {
    if (!sessionInfo) return [] as typeof ALL_CHAPTERS;
    if (sessionInfo.classLevel === 10) {
      return ALL_CHAPTERS.filter(
        (chapter) => chapter.classLevel === 10 && CLASS10_PUBLIC_SUBJECTS.has(chapter.subject)
      );
    }
    const enrolledSet = new Set(sessionInfo.enrolledSubjects);
    return ALL_CHAPTERS.filter((chapter) => {
      if (chapter.classLevel !== 12) return false;
      if (enrolledSet.size > 0 && !enrolledSet.has(chapter.subject)) return false;
      return true;
    });
  }, [sessionInfo]);

  const groupedChapters = useMemo(
    () =>
      scopedChapters.reduce<Record<string, typeof ALL_CHAPTERS>>((acc, chapter) => {
        const key = `Class ${chapter.classLevel} - ${chapter.subject}`;
        (acc[key] ??= []).push(chapter);
        return acc;
      }, {}),
    [scopedChapters]
  );

  const allowedChapterIds = useMemo(() => new Set(scopedChapters.map((chapter) => chapter.id)), [scopedChapters]);

  const fetchNote = useCallback(
    async (cid: string) => {
      if (!allowedChapterIds.has(cid)) {
        setError('This chapter is not available for your class scope.');
        return;
      }
      setLoadingNote(true);
      setError('');
      setContent('');
      setSavedAt(null);
      try {
        const res = await fetch(`/api/student/notes?chapterId=${encodeURIComponent(cid)}`, { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (res.status === 401) {
          router.replace('/student/login');
          return;
        }
        if (!res.ok) {
          setError(body?.message || 'Failed to load note.');
          return;
        }
        const data = unwrap<NoteData | null>(body);
        setContent(data?.content ?? '');
        setSavedAt(data?.updatedAt ?? null);
      } catch {
        setError('Failed to load note.');
      } finally {
        setLoadingNote(false);
      }
    },
    [allowedChapterIds, router]
  );

  useEffect(() => {
    async function checkSession() {
      const session = await fetchClientStudentSession().catch(() => null);
      if (!session?.studentId || (session.classLevel !== 10 && session.classLevel !== 12)) {
        router.replace('/student/login');
        return;
      }
      setSessionInfo({
        classLevel: session.classLevel,
        enrolledSubjects: session.enrolledSubjects,
      });
    }
    void checkSession();
  }, [router]);

  useEffect(() => {
    if (!chapterId) return;
    if (!allowedChapterIds.has(chapterId)) {
      setChapterId('');
      setContent('');
      setSavedAt(null);
    }
  }, [allowedChapterIds, chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    void fetchNote(chapterId);
  }, [chapterId, fetchNote]);

  const saveNote = useCallback(
    async (text: string, cid: string) => {
      if (!cid) return;
      if (!allowedChapterIds.has(cid)) {
        setError('This chapter is not available for your class scope.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const res = await fetch('/api/student/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId: cid, content: text }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setError(body?.message ?? 'Failed to save note.');
          return;
        }
        const data = unwrap<NoteData | null>(body);
        setSavedAt(data?.updatedAt ?? new Date().toISOString());
        setDirty(false);
      } catch {
        setError('Failed to save note.');
      } finally {
        setSaving(false);
      }
    },
    [allowedChapterIds]
  );

  function handleContentChange(text: string) {
    setContent(text);
    setDirty(true);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveNote(text, chapterId);
    }, AUTOSAVE_DELAY_MS);
  }

  function handleManualSave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    void saveNote(content, chapterId);
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex items-center gap-3">
          <PenSquare className="h-6 w-6 text-indigo-600" />
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">My Notes</h1>
        </div>
        <p className="mb-6 text-sm text-[#6D6A7C]">Write and save notes per chapter. Auto-saves as you type.</p>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-[#6D6A7C]">Chapter</label>
            {sessionInfo && (
              <p className="mb-1 text-[11px] font-semibold text-indigo-700">
                {sessionInfo.classLevel === 10
                  ? 'Class 10 notes scope: Physics, Chemistry, Biology, Math, English Core.'
                  : 'Class 12 notes scope based on your class and enrolled subjects.'}
              </p>
            )}
            <select
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              className="w-full rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-2 text-sm text-navy-700"
              disabled={!sessionInfo}
            >
              <option value="">- Select a chapter -</option>
              {Object.entries(groupedChapters).map(([group, chapters]) => (
                <optgroup key={group} label={group}>
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {chapterId && (
            <>
              {loadingNote ? (
                <div className="flex h-48 items-center justify-center text-sm text-[#8A8AAA]">Loading note...</div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Write your notes here..."
                    rows={14}
                    className="w-full resize-y rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-4 py-3 text-sm text-navy-700 placeholder:text-[#8A8AAA] focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[#8A8AAA]">
                      {saving && <span className="text-indigo-500">Saving...</span>}
                      {!saving && savedAt && !dirty && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Saved {new Date(savedAt).toLocaleTimeString()}
                        </span>
                      )}
                      {!saving && dirty && <span className="text-amber-500">Unsaved changes</span>}
                    </div>
                    <button
                      type="button"
                      onClick={handleManualSave}
                      disabled={saving || !chapterId}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Now
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!chapterId && (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#E8E4DC] text-sm text-[#8A8AAA]">
              Select a chapter to start taking notes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
