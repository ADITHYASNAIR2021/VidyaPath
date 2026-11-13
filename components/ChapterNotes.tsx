'use client';

import { useState, useEffect } from 'react';
import { PenLine, Save, Check } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { useChapterNotesStore } from '@/lib/store';

/** Private per-chapter notes, saved only in this browser (no account needed). */
export default function ChapterNotes({ chapterId }: { chapterId: string }) {
  const saveNote = useChapterNotesStore((state) => state.saveNote);
  const [notes, setNotes] = useState('');
  const [debouncedNotes] = useDebounce(notes, 800);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const stored = useChapterNotesStore.getState().notes[chapterId]?.content;
    if (typeof stored === 'string') {
      setNotes(stored);
    } else {
      // Migrate notes written by older versions (plain localStorage key per chapter).
      try {
        const legacy = localStorage.getItem(`notes-${chapterId}`);
        if (legacy) {
          setNotes(legacy);
          saveNote(chapterId, legacy);
          localStorage.removeItem(`notes-${chapterId}`);
        }
      } catch {
        // Storage can be unavailable in private mode.
      }
    }
    setMounted(true);
  }, [chapterId, saveNote]);

  useEffect(() => {
    if (!mounted) return;
    const current = useChapterNotesStore.getState().notes[chapterId]?.content ?? '';
    if (current === debouncedNotes) return;
    saveNote(chapterId, debouncedNotes);
    setSaved(true);
    const timeout = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timeout);
  }, [debouncedNotes, chapterId, mounted, saveNote]);

  if (!mounted) return null;

  return (
    <div className="bg-[#FFFDF3] rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between bg-amber-50/50">
        <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-amber-600" />
          My Private Notes
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-[11px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-md transition-colors"
          >
            {expanded ? 'Compact' : 'Expand'}
          </button>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-md">
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" /> Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 opacity-50" /> Auto-saving
              </>
            )}
          </div>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Note down important points, formulas, or reminders for this chapter. Notes are saved automatically on this device — no account needed."
        rows={expanded ? 10 : 3}
        aria-label="My notes for this chapter"
        className="w-full p-4 bg-transparent resize-none focus:outline-none text-[#4A4A6A] leading-relaxed"
      />
    </div>
  );
}
