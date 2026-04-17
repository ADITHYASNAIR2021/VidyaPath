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
 * Subscribe to INSERT/UPDATE events on teacher_assignment_packs for a student's class level.
 * Calls onPackChange whenever a new assignment pack is published or status changes.
 *
 * Usage:
 *   useStudentPacksRealtime({ classLevel: 12, onPackChange: () => mutate() });
 */
export function useStudentPacksRealtime({
  classLevel,
  onPackChange,
  enabled = true,
}: {
  classLevel: 10 | 12 | null | undefined;
  onPackChange: () => void;
  enabled?: boolean;
}) {
  const callbackRef = useRef(onPackChange);
  callbackRef.current = onPackChange;

  useEffect(() => {
    if (!enabled || !classLevel) return;
    const supabase = getSupabaseAnonClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`student-packs-class-${classLevel}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_assignment_packs',
          filter: `class_level=eq.${classLevel}`,
        },
        (payload) => {
          // Only trigger on published packs becoming visible to students
          const newRow = payload.new as Record<string, unknown> | null;
          if (!newRow || newRow.status === 'draft') return;
          callbackRef.current();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classLevel, enabled]);
}
