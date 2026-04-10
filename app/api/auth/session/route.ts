import { getRequestAuthContext } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const context = await getRequestAuthContext();
    if (!context) {
      return dataJson({
        requestId,
        data: {
          role: 'anonymous',
          authenticated: false,
        },
      });
    }
    return dataJson({
      requestId,
      data: {
        role: context.role,
        authenticated: true,
        schoolId: context.schoolId,
        schoolCode: context.schoolCode,
        schoolName: context.schoolName,
        profileId: context.profileId,
        displayName: context.displayName,
        authUserId: context.authUserId,
        availableRoles: context.availableRoles ?? [context.role],
        sessionExpiry: context.expiresAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve auth session.';
    return errorJson({
      requestId,
      errorCode: 'auth-session-read-failed',
      message,
      status: 500,
    });
  }
}
