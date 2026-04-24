import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface TeacherPackIdRow {
  id: string;
}

function normalizeSubject(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getScopedPairs(scopes: TeacherScope[]): Array<{ classLevel: 10 | 12; subject: string }> {
  const dedup = new Map<string, { classLevel: 10 | 12; subject: string }>();
  for (const scope of scopes) {
    if (!scope?.isActive) continue;
    const subject = (scope.subject || '').trim();
    if (!subject) continue;
    const key = `${scope.classLevel}:${normalizeSubject(subject)}`;
    if (!dedup.has(key)) dedup.set(key, { classLevel: scope.classLevel, subject });
  }
  return [...dedup.values()];
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);
  const schoolId = teacherSession.teacher.schoolId;
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'teacher-school-missing',
      message: 'Teacher school context is required.',
      status: 403,
    });
  }

  try {
    const resolvedClient = resolveRequestSupabaseClient(req, 'user-first');
    if (!resolvedClient) {
      return dataJson({
        requestId,
        data: { pendingQuestions: 0, ungradedSubmissions: 0 },
      });
    }

    const scopedPairs = getScopedPairs(teacherSession.effectiveScopes ?? []);
    const pendingQuestionCounts = await Promise.all(
      scopedPairs.map(async (pair) => {
        const { count, error } = await resolvedClient.client
          .from('student_questions')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId)
          .eq('status', 'pending')
          .eq('class_level', pair.classLevel)
          .eq('subject', pair.subject);
        if (error) throw new Error(error.message || 'Failed to count pending questions.');
        return count ?? 0;
      })
    );
    const pendingQuestions = pendingQuestionCounts.reduce((sum, count) => sum + count, 0);

    const { data: packRows, error: packError } = await resolvedClient.client
      .from('teacher_assignment_packs')
      .select('id')
      .eq('teacher_id', teacherSession.teacher.id)
      .eq('school_id', schoolId)
      .limit(5000);
    if (packError) throw new Error(packError.message || 'Failed to load teacher pack ids.');
    const packIds = ((packRows || []) as TeacherPackIdRow[])
      .map((row) => row.id)
      .filter((id) => typeof id === 'string' && id.length > 0);

    let ungradedSubmissions = 0;
    if (packIds.length > 0) {
      const packIdChunks = chunk(packIds, 250);
      const chunkCounts = await Promise.all(
        packIdChunks.map(async (packIdChunk) => {
          const { count, error } = await resolvedClient.client
            .from('teacher_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_review')
            .in('pack_id', packIdChunk);
          if (error) throw new Error(error.message || 'Failed to count ungraded submissions.');
          return count ?? 0;
        })
      );
      ungradedSubmissions = chunkCounts.reduce((sum, count) => sum + count, 0);
    }

    return dataJson({
      requestId,
      data: { pendingQuestions, ungradedSubmissions },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load teacher notification summary.';
    return errorJson({
      requestId,
      errorCode: 'teacher-notification-summary-failed',
      message,
      status: 500,
    });
  }
}
