import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { recordStreakSchema } from '@/lib/schemas/student-streaks';
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

  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, recordStreakSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const { at } = bodyResult.value;
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

