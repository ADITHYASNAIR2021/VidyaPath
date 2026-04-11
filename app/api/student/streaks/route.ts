import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { listStudentBadges, getStudentStreakData, recordStudentActivity } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  try {
    const [streak, badges] = await Promise.all([
      getStudentStreakData(studentSession.studentId),
      listStudentBadges(studentSession.studentId),
    ]);
    return dataJson({ requestId, data: { streak, badges } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load streaks.';
    return errorJson({ requestId, errorCode: 'streak-read-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const at = typeof bodyResult.value.at === 'string' ? bodyResult.value.at : undefined;
  try {
    const result = await recordStudentActivity(studentSession.studentId, at);
    return dataJson({
      requestId,
      data: result,
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update streak.';
    return errorJson({ requestId, errorCode: 'streak-write-failed', message, status: 500 });
  }
}

