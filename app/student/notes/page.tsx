'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import { PenSquare, Save, CheckCircle2 } from 'lucide-react';

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

export default function StudentNotesPage() {
  const router = useRouter();
  const [chapterId, setChapterId] = useState('');
  const [content, setContent] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group chapters by subject+class for the selector
  const groupedChapters = ALL_CHAPTERS.reduce<Record<string, typeof ALL_CHAPTERS>>((acc, ch) => {
    const key = `Class ${ch.classLevel} · ${ch.subject}`;
    (acc[key] ??= []).push(ch);
    return acc;
  }, {});

  const fetchNote = useCallback(async (cid: string) => {
    setLoadingNote(true);
    setError('');
    setContent('');
    setSavedAt(null);
    try {
      const res = await fetch(`/api/student/notes?chapterId=${encodeURIComponent(cid)}`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (res.status === 401) { router.replace('/student/login'); return; }
      if (!res.ok) { setError('Failed to load note.'); return; }
      const data = unwrap<NoteData | null>(body);
      setContent(data?.content ?? '');
      setSavedAt(data?.updatedAt ?? null);
    } catch {
      setError('Failed to load note.');
    } finally {
      setLoadingNote(false);
    }
  }, [router]);

  useEffect(() => {
    async function checkSession() {
      const res = await fetch('/api/student/session/me', { cache: 'no-store' });
      if (!res.ok) { router.replace('/student/login'); }
    }
    void checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chapterId) return;
    void fetchNote(chapterId);
  }, [chapterId, fetchNote]);

  const saveNote = useCallback(async (text: string, cid: string) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/student/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: cid, content: text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.message ?? 'Failed to save note.'); return; }
      const data = unwrap<NoteData | null>(body);
      setSavedAt(data?.updatedAt ?? new Date().toISOString());
      setDirty(false);
    } catch {
      setError('Failed to save note.');
    } finally {
      setSaving(false);
    }
  }, []);

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
        <div className="flex items-center gap-3 mb-1">
          <PenSquare className="w-6 h-6 text-indigo-600" />
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">My Notes</h1>
        </div>
        <p className="text-sm text-[#6D6A7C] mb-6">Write and save notes per chapter. Auto-saves as you type.</p>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <label className="block text-xs font-medium text-[#6D6A7C] mb-1">Chapter</label>
            <select
              value={chapterId}
              onChange={(e) => setChapterId(e.target.value)}
              className="w-full rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-2 text-sm text-navy-700"
            >
              <option value="">— Select a chapter —</option>
              {Object.entries(groupedChapters).map(([group, chapters]) => (
                <optgroup key={group} label={group}>
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {chapterId && (
            <>
              {loadingNote ? (
                <div className="h-48 flex items-center justify-center text-sm text-[#8A8AAA]">Loading note…</div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder="Write your notes here…"
                    rows={14}
                    className="w-full rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-4 py-3 text-sm text-navy-700 placeholder:text-[#8A8AAA] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[#8A8AAA]">
                      {saving && <span className="text-indigo-500">Saving…</span>}
                      {!saving && savedAt && !dirty && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          Saved {new Date(savedAt).toLocaleTimeString()}
                        </span>
                      )}
                      {!saving && dirty && <span className="text-amber-500">Unsaved changes</span>}
                    </div>
                    <button
                      type="button"
                      onClick={handleManualSave}
                      disabled={saving || !chapterId}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Now
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!chapterId && (
            <div className="h-32 flex items-center justify-center rounded-xl border border-dashed border-[#E8E4DC] text-sm text-[#8A8AAA]">
              Select a chapter to start taking notes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
