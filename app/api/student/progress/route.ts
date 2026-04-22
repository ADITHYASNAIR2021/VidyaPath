import type { NextRequest } from 'next/server';
import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getServiceClient } from '@/lib/supabase-rest';

const PROGRESS_TABLE = 'student_chapter_progress';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const client = getServiceClient();
  if (!client) return dataJson({ requestId, data: { studiedChapterIds: [] } });

  try {
    const { data, error } = await client
      .from(PROGRESS_TABLE)
      .select('studied_chapter_ids')
      .eq('student_id', studentSession.studentId)
      .limit(1);

    if (error || !data || data.length === 0) {
      return dataJson({ requestId, data: { studiedChapterIds: [] } });
    }

    const ids = Array.isArray(data[0]?.studied_chapter_ids) ? data[0].studied_chapter_ids as string[] : [];
    return dataJson({ requestId, data: { studiedChapterIds: ids } });
  } catch {
    return dataJson({ requestId, data: { studiedChapterIds: [] } });
  }
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  let body: { studiedChapterIds?: unknown };
  try {
    body = await req.json() as { studiedChapterIds?: unknown };
  } catch {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'Invalid JSON body.', status: 400 });
  }

  const studiedChapterIds = Array.isArray(body.studiedChapterIds)
    ? body.studiedChapterIds.filter((id): id is string => typeof id === 'string')
    : [];

  const client = getServiceClient();
  if (!client) return dataJson({ requestId, data: { saved: false } });

  try {
    const { error } = await client.from(PROGRESS_TABLE).upsert(
      {
        student_id: studentSession.studentId,
        school_id: studentSession.schoolId ?? null,
        studied_chapter_ids: studiedChapterIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id' }
    );

    if (error) {
      return errorJson({ requestId, errorCode: 'progress-save-failed', message: error.message, status: 500 });
    }

    return dataJson({ requestId, data: { saved: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save progress.';
    return errorJson({ requestId, errorCode: 'progress-save-failed', message, status: 500 });
  }
}
