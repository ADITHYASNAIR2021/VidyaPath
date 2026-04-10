import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { updateSchool } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/schools/[id]';
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  const schoolId = params.id?.trim();
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-id',
      message: 'School id is required.',
      status: 400,
    });
  }
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 32 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  try {
    const school = await updateSchool(schoolId, {
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : undefined,
      schoolCode: typeof body.schoolCode === 'string' ? body.schoolCode : undefined,
      board: typeof body.board === 'string' ? body.board : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : undefined,
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
      status: body.status === 'active' || body.status === 'inactive' || body.status === 'archived'
        ? body.status
        : undefined,
    });
    if (!school) {
      return errorJson({
        requestId,
        errorCode: 'school-not-found',
        message: 'School not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-updated',
      statusCode: 200,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId: school.id,
      metadata: { committedAt, status: school.status },
    });
    logServerEvent({
      event: 'developer-school-updated',
      requestId,
      endpoint,
      role: 'developer',
      schoolId: school.id,
      statusCode: 200,
      details: { status: school.status },
    });
    return dataJson({
      requestId,
      data: { school },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update school.';
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-update-failed',
      statusCode: 500,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId,
      metadata: { message: message.slice(0, 300), ip: getClientIp(req) },
    });
    return errorJson({
      requestId,
      errorCode: 'developer-school-update-failed',
      message,
      status: 500,
    });
  }
}
