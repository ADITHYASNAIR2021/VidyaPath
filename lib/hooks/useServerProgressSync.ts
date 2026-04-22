import { useEffect, useRef } from 'react';
import { useProgressStore } from '@/lib/store';

export function useServerProgressSync() {
  const { studiedChapterIds, hydrate } = useProgressStore();
  const initialized = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: fetch server state, merge with local, hydrate store
  useEffect(() => {
    let active = true;
    fetch('/api/student/progress', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok || !active) return;
        const body = await res.json().catch(() => null) as { data?: { studiedChapterIds?: unknown } } | null;
        const serverIds = Array.isArray(body?.data?.studiedChapterIds)
          ? (body!.data!.studiedChapterIds as unknown[]).filter((id): id is string => typeof id === 'string')
          : [];
        const local = useProgressStore.getState().studiedChapterIds;
        const merged = Array.from(new Set([...local, ...serverIds]));
        hydrate(merged);
        initialized.current = true;
      })
      .catch(() => {});
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On local state changes (after init): debounce-save to server
  useEffect(() => {
    if (!initialized.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/student/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studiedChapterIds }),
      }).catch(() => {});
    }, 2500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [studiedChapterIds]);
}
