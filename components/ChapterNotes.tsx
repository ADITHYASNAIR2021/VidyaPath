'use client';

import { useState, useEffect } from 'react';
import { PenLine, Save, Check } from 'lucide-react';
import { useDebounce } from 'use-debounce';

export default function ChapterNotes({ chapterId }: { chapterId: string }) {
  const [notes, setNotes] = useState('');
  const [debouncedNotes] = useDebounce(notes, 1000);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load from local storage
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(`notes-${chapterId}`);
    if (stored) setNotes(stored);
  }, [chapterId]);

  // Save to local storage automatically
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(`notes-${chapterId}`, debouncedNotes);
    setSaved(true);
    const timeout = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timeout);
  }, [debouncedNotes, chapterId, mounted]);

  if (!mounted) return null; // Hydration fix

  return (
    <div className="bg-[#FFFDF3] rounded-2xl border border-amber-200 shadow-sm overflow-hidden mb-5 flex flex-col h-full min-h-[250px]">
      <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between bg-amber-50/50">
        <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-amber-600" />
          My Private Notes
        </h2>
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
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Jot down important points, formulas, or reminders for this chapter here. Your notes are saved automatically to your device..."
        className="flex-1 w-full p-5 bg-transparent resize-none focus:outline-none text-[#4A4A6A] leading-relaxed"
      />
    </div>
  );
}
