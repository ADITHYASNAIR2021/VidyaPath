import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';
import type { TeacherStorageStatus } from '@/lib/teacher-types';

const HEALTH_CACHE_TTL_MS = 15_000;
let cachedStatus: TeacherStorageStatus | null = null;
let cachedAt = 0;

const REQUIRED_TABLES = [
  'teacher_profiles',
  'teacher_scopes',
  'teacher_activity',
  'teacher_announcements',
  'teacher_quiz_links',
  'teacher_topic_priority',
  'teacher_assignment_packs',
  'teacher_submissions',
  'teacher_weekly_plans',
  'student_profiles',
  'teacher_question_bank',
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function buildStatus(
  mode: TeacherStorageStatus['mode'],
  canWrite: boolean,
  message: string
): TeacherStorageStatus {
  return {
    mode,
    canWrite,
    message,
    checkedAt: nowIso(),
  };
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

export async function getTeacherStorageStatus(force = false): Promise<TeacherStorageStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - cachedAt < HEALTH_CACHE_TTL_MS) {
    return cachedStatus;
  }

  if (!isSupabaseServiceConfigured()) {
    const status = buildStatus(
      'degraded',
      false,
      'Supabase env is missing. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run scripts/sql/supabase_init.sql.'
    );
    cachedStatus = status;
    cachedAt = now;
    return status;
  }

  try {
    for (const table of REQUIRED_TABLES) {
      await supabaseSelect<Record<string, unknown>>(table, { select: '*', limit: 1 });
    }
    const status = buildStatus('connected', true, 'Supabase teacher storage is healthy.');
    cachedStatus = status;
    cachedAt = now;
    return status;
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Supabase teacher tables are not ready. Run scripts/sql/supabase_init.sql.';
    const status = buildStatus('degraded', false, msg);
    cachedStatus = status;
    cachedAt = now;
    return status;
  }
}

export async function assertTeacherStorageWritable(): Promise<TeacherStorageStatus> {
  const status = await getTeacherStorageStatus(true);
  if (!status.canWrite && isProductionRuntime()) {
    throw new Error(status.message);
  }
  return status;
}
