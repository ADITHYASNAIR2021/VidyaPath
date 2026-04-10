import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getStudentSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Student session not found.', requestId);
    return dataJson({
      requestId,
      data: {
        ...session,
        sessionExpiry: session.expiresAt,
        availableRoles: ['student'],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read student session.';
    return errorJson({
      requestId,
      errorCode: 'student-session-read-failed',
      message,
      status: 500,
    });
  }
}
