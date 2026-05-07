import { NextResponse } from 'next/server';
import { getRequestAuthContext } from '@/lib/auth/guards';
import { getRequestId } from '@/lib/http/api-response';
import { recordAuditEvent } from '@/lib/security/audit';

function resolvePathname(req: Request): string {
  try {
    return new URL(req.url).pathname || '/unknown';
  } catch {
    return '/unknown';
  }
}

export async function requireInteractiveAuth(req?: Request) {
  const context = await getRequestAuthContext();
  const requestId = req ? getRequestId(req) : undefined;
  const endpoint = req ? resolvePathname(req) : undefined;
  const method = req?.method?.toUpperCase() || 'UNKNOWN';

  if (!context) {
    if (requestId && endpoint) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'interactive-auth-denied',
        statusCode: 401,
        actorRole: 'system',
        metadata: { method },
      });
    }
    return {
      context: null,
      response: NextResponse.json(
        {
          error: 'Login required to use AI features.',
          errorCode: 'auth-required',
          message: 'Please login to use VidyaAI features.',
        },
        { status: 401 }
      ),
    };
  }

  if (requestId && endpoint) {
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'interactive-auth-granted',
      statusCode: 200,
      actorRole: context.role,
      actorAuthUserId: context.authUserId,
      schoolId: context.schoolId,
      metadata: { method },
    });
  }

  return { context, response: null };
}
