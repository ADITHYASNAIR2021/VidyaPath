'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Subscribe to INSERT/UPDATE events on teacher_submissions for a given packId.
 * Calls onNewSubmission whenever a row arrives or changes status.
 *
 * Usage:
 *   useTeacherSubmissionsRealtime({ packId, onNewSubmission: () => mutate() });
 */
export function useTeacherSubmissionsRealtime({
  packId,
  onNewSubmission,
  enabled = true,
}: {
  packId: string | null | undefined;
  onNewSubmission: () => void;
  enabled?: boolean;
}) {
  const callbackRef = useRef(onNewSubmission);
  callbackRef.current = onNewSubmission;

  useEffect(() => {
    if (!enabled || !packId) return;
    const supabase = getSupabaseAnonClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`teacher-submissions-${packId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_submissions',
          filter: `pack_id=eq.${packId}`,
        },
        () => callbackRef.current(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [packId, enabled]);
}
