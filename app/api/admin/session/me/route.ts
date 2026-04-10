import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getAdminSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Admin session required.', requestId);
    return dataJson({
      requestId,
      data: {
        role: session.role,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        sessionExpiry: session.expiresAt,
        schoolId: session.schoolId,
        schoolCode: session.schoolCode,
        schoolName: session.schoolName,
        authUserId: session.authUserId,
        displayName: session.displayName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read admin session.';
    return errorJson({
      requestId,
      errorCode: 'admin-session-read-failed',
      message,
      status: 500,
    });
  }
}
