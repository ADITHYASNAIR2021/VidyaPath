'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, PenSquare } from 'lucide-react';
import { BOARD_CHAPTERS } from '@/lib/data';
import { useChapterNotesStore, useStudentProfileStore, useStudyActivityStore } from '@/lib/store';

/** All chapter notes in one place. Stored only in this browser — no account needed. */
export default function NotesPage() {
  const notes = useChapterNotesStore((state) => state.notes);
  const saveNote = useChapterNotesStore((state) => state.saveNote);
  const classLevel = useStudentProfileStore((state) => state.classLevel);
  const recordActivity = useStudyActivityStore((state) => state.recordActivity);
  const [mounted, setMounted] = useState(false);
  const [chapterId, setChapterId] = useState('');
  const [draft, setDraft] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const chapters = useMemo(
    () => BOARD_CHAPTERS.filter((chapter) => !classLevel || chapter.classLevel === classLevel),
    [classLevel]
  );

  const groupedChapters = useMemo(() => {
    const groups: Record<string, typeof chapters> = {};
    for (const chapter of chapters) {
      const key = `Class ${chapter.classLevel} · ${chapter.subject}`;
      (groups[key] ??= []).push(chapter);
    }
    return groups;
  }, [chapters]);

  const chapterById = useMemo(() => new Map(BOARD_CHAPTERS.map((chapter) => [chapter.id, chapter])), []);

  const notedChapters = useMemo(
    () =>
      Object.entries(mounted ? notes : {})
        .map(([id, note]) => ({ id, note, chapter: chapterById.get(id) }))
        .filter((item) => item.chapter)
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    [chapterById, mounted, notes]
  );

  useEffect(() => {
    setDraft(chapterId ? notes[chapterId]?.content ?? '' : '');
    setSavedAt(chapterId ? notes[chapterId]?.updatedAt ?? null : null);
    // Only reload the editor when the selected chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    const timeout = setTimeout(() => {
      const current = useChapterNotesStore.getState().notes[chapterId]?.content ?? '';
      if (current === draft) return;
      saveNote(chapterId, draft);
      recordActivity();
      setSavedAt(new Date().toISOString());
    }, 700);
    return () => clearTimeout(timeout);
  }, [chapterId, draft, recordActivity, saveNote]);

  function downloadNotes() {
    const text = notedChapters
      .map(({ chapter, note }) => `# Class ${chapter!.classLevel} ${chapter!.subject} — ${chapter!.title}\n\n${note.content}\n`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vidyapath-notes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PenSquare className="h-6 w-6 text-saffron-500" />
            <h1 className="font-fraunces text-2xl font-bold text-navy-700">My Notes</h1>
          </div>
          {notedChapters.length > 0 && (
            <button
              type="button"
              onClick={downloadNotes}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download all
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-[#6D6A7C]">
          Private notes per chapter. Saved automatically on this device — download them to keep a copy.
        </p>

        <div className="mt-5 rounded-2xl border border-[#E8E4DC] bg-white p-5 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-[#6D6A7C]" htmlFor="notes-chapter">
            Chapter
          </label>
          <select
            id="notes-chapter"
            value={chapterId}
            onChange={(event) => setChapterId(event.target.value)}
            className="w-full rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-3 py-2 text-sm text-navy-700"
          >
            <option value="">— Select a chapter —</option>
            {Object.entries(groupedChapters).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {chapterId && (
            <div className="mt-3 space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write your notes here..."
                rows={12}
                aria-label="Chapter notes"
                className="w-full resize-y rounded-xl border border-[#E8E4DC] bg-[#FDFAF6] px-4 py-3 text-sm text-navy-700 placeholder:text-[#8A8AAA] focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex items-center justify-between text-xs text-[#8A8AAA]">
                <span>
                  {savedAt && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> Saved {new Date(savedAt).toLocaleTimeString()}
                    </span>
                  )}
                </span>
                <Link href={`/chapters/${chapterId}`} className="font-semibold text-indigo-600 hover:text-indigo-700">
                  Open chapter →
                </Link>
              </div>
            </div>
          )}
        </div>

        {notedChapters.length > 0 && (
          <div className="mt-6">
            <h2 className="font-fraunces text-lg font-bold text-navy-700">Chapters with notes</h2>
            <ul className="mt-3 space-y-2">
              {notedChapters.map(({ id, note, chapter }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setChapterId(id)}
                    className="w-full rounded-xl border border-[#E8E4DC] bg-white px-4 py-3 text-left hover:border-saffron-200"
                  >
                    <span className="block text-sm font-semibold text-navy-700">{chapter!.title}</span>
                    <span className="block text-xs text-[#8A8AAA]">
                      Class {chapter!.classLevel} · {chapter!.subject} · {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#4A4A6A]">{note.content}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
