'use client';

import { useState, useEffect } from 'react';
import { PenLine, Save, Check } from 'lucide-react';
import { useDebounce } from 'use-debounce';

export default function ChapterNotes({ chapterId }: { chapterId: string }) {
  const [notes, setNotes] = useState('');
  const [debouncedNotes] = useDebounce(notes, 1000);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [canCloudSync, setCanCloudSync] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);

  // Load local notes first, then hydrate from server if student session is active.
  useEffect(() => {
    let active = true;
    async function load() {
      setMounted(true);
      const localKey = `notes-${chapterId}`;
      const localStored = localStorage.getItem(localKey);
      if (localStored) setNotes(localStored);

      try {
        const sessionRes = await fetch('/api/student/session/me', { cache: 'no-store' });
        if (!sessionRes.ok) {
          if (active) {
            setCanCloudSync(false);
            setCloudReady(true);
          }
          return;
        }
        if (!active) return;
        setCanCloudSync(true);
        const noteRes = await fetch(`/api/student/notes?chapterId=${encodeURIComponent(chapterId)}`, { cache: 'no-store' });
        const notePayload = await noteRes.json().catch(() => null);
        const noteData =
          notePayload && typeof notePayload === 'object' && 'data' in (notePayload as Record<string, unknown>)
            ? ((notePayload as { data?: { content?: string } }).data ?? null)
            : (notePayload as { content?: string } | null);
        if (noteRes.ok && noteData && typeof noteData.content === 'string') {
          const remoteContent = noteData.content;
          if (remoteContent.trim().length > 0 && remoteContent !== localStored) {
            setNotes(remoteContent);
            localStorage.setItem(localKey, remoteContent);
          }
        }
      } catch {
        if (active) setCanCloudSync(false);
      } finally {
        if (active) setCloudReady(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [chapterId]);

  // Save local notes always; sync to cloud if authenticated student session is present.
  useEffect(() => {
    if (!mounted || !cloudReady) return;
    localStorage.setItem(`notes-${chapterId}`, debouncedNotes);
    if (canCloudSync) {
      fetch('/api/student/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, content: debouncedNotes }),
      }).catch(() => undefined);
    }
    setSaved(true);
    const timeout = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timeout);
  }, [debouncedNotes, chapterId, mounted, canCloudSync, cloudReady]);

  if (!mounted) return null; // Hydration fix

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
        placeholder="Jot down important points, formulas, or reminders for this chapter here. Your notes are saved automatically to your device..."
        rows={expanded ? 10 : 3}
        className="w-full p-4 bg-transparent resize-none focus:outline-none text-[#4A4A6A] leading-relaxed"
      />
    </div>
  );
}
