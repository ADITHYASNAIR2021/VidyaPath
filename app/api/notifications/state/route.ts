import { cookies } from 'next/headers';
import { getRequestAuthContext, unauthorizedJson } from '@/lib/auth/guards';
import { parseParentSession, PARENT_SESSION_COOKIE } from '@/lib/auth/parent-session';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { patchNotificationCenterState, getNotificationCenterState, type NotificationActor } from '@/lib/notifications/center-state';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

interface StatePatchBody {
  markReadIds?: unknown;
  markUnreadIds?: unknown;
  setAllReadIds?: unknown;
  channelPreferences?: {
    dashboard?: unknown;
    webPush?: unknown;
    email?: unknown;
  };
}

function sanitizeIds(value: unknown, max = 150): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim().slice(0, max))
    .filter((item) => item.length > 0)
    .slice(0, 400);
}

async function resolveActor(): Promise<NotificationActor | null> {
  const context = await getRequestAuthContext();
  if (context?.role === 'student' && context.profileId) {
    return { role: 'student', scopeId: context.profileId, schoolId: context.schoolId };
  }
  if (context?.role === 'teacher' && context.profileId) {
    return { role: 'teacher', scopeId: context.profileId, schoolId: context.schoolId };
  }
  if (context?.role === 'admin') {
    return { role: 'admin', scopeId: context.authUserId || context.schoolId || 'admin', schoolId: context.schoolId };
  }
  if (context?.role === 'developer') {
    return { role: 'developer', scopeId: context.authUserId || 'developer', schoolId: context.schoolId };
  }

  const parentToken = (await cookies()).get(PARENT_SESSION_COOKIE)?.value;
  const parent = parseParentSession(parentToken);
  if (parent) {
    return {
      role: 'parent',
      scopeId: `${parent.studentId}:${parent.phone}`,
      schoolId: parent.schoolId,
    };
  }
  return null;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const actor = await resolveActor();
  if (!actor) return unauthorizedJson('Authenticated session required.', requestId);

  try {
    const state = await getNotificationCenterState(actor);
    return dataJson({ requestId, data: { actorRole: actor.role, state } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'notification-state-read-failed',
      message: error instanceof Error ? error.message : 'Failed to load notification state.',
      status: 500,
    });
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  const actor = await resolveActor();
  if (!actor) return unauthorizedJson('Authenticated session required.', requestId);
  const ip = getClientIp(req);

  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('notifications:state-patch', [actor.role, actor.scopeId, ip]),
    windowSeconds: 60,
    maxRequests: 120,
    blockSeconds: 120,
    metadata: { endpoint: '/api/notifications/state', role: actor.role },
  });
  if (!rateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many notification state updates. Please retry shortly.',
      status: 429,
      hint: `Retry after ${rateLimit.retryAfterSeconds}s`,
    });
  }

  let body: StatePatchBody | null = null;
  try {
    body = (await req.json()) as StatePatchBody;
  } catch {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'Invalid JSON body.', status: 400 });
  }

  const dashboardPref = body?.channelPreferences && typeof body.channelPreferences.dashboard === 'boolean'
    ? body.channelPreferences.dashboard
    : undefined;
  const webPushPref = body?.channelPreferences && typeof body.channelPreferences.webPush === 'boolean'
    ? body.channelPreferences.webPush
    : undefined;
  const emailPref = body?.channelPreferences && typeof body.channelPreferences.email === 'boolean'
    ? body.channelPreferences.email
    : undefined;

  try {
    const state = await patchNotificationCenterState(actor, {
      markReadIds: sanitizeIds(body?.markReadIds),
      markUnreadIds: sanitizeIds(body?.markUnreadIds),
      setAllReadIds: sanitizeIds(body?.setAllReadIds),
      channelPreferences: {
        dashboard: dashboardPref,
        webPush: webPushPref,
        email: emailPref,
      },
    });

    await recordAuditEvent({
      requestId,
      endpoint: '/api/notifications/state',
      action: 'notification-state-updated',
      statusCode: 200,
      actorRole: actor.role === 'parent' ? 'system' : actor.role,
      schoolId: actor.schoolId,
      metadata: {
        role: actor.role,
        readCount: state.readIds.length,
        channelPreferences: state.channelPreferences,
      },
    });

    return dataJson({ requestId, data: { actorRole: actor.role, state } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'notification-state-update-failed',
      message: error instanceof Error ? error.message : 'Failed to update notification state.',
      status: 500,
    });
  }
}
