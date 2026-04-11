import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getDeveloperSessionFromRequestCookies();
    if (!session) return unauthorizedJson('Developer session not found.', requestId);
    return dataJson({
      requestId,
      data: {
        role: 'developer',
        authUserId: session.authUserId,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read developer session.';
    return errorJson({
      requestId,
      errorCode: 'developer-session-read-failed',
      message,
      status: 500,
    });
  }
}
