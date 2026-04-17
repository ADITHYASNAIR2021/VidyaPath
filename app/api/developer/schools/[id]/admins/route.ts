import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createSchoolAdminSchema } from '@/lib/schemas/developer-ops';
import { listSchoolAdminsForDeveloper, provisionSchoolAdminByDeveloper } from '@/lib/onboarding-db';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/schools/[id]/admins';
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
  try {
    const admins = await listSchoolAdminsForDeveloper(schoolId);
    logServerEvent({
      event: 'developer-school-admins-read',
      requestId,
      endpoint,
      role: 'developer',
      schoolId,
      statusCode: 200,
      details: { count: admins.length },
    });
    return dataJson({
      requestId,
      data: { admins },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load school admins.';
    return errorJson({
      requestId,
      errorCode: 'developer-school-admins-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/schools/[id]/admins';
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
  const bodyResult = await parseAndValidateJsonBody(req, 48 * 1024, createSchoolAdminSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const body = bodyResult.value;
  try {
    const created = await provisionSchoolAdminByDeveloper({
      schoolId,
      name: typeof body.name === 'string' ? body.name : '',
      adminIdentifier: typeof body.adminIdentifier === 'string' ? body.adminIdentifier : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      authEmail: typeof body.authEmail === 'string' ? body.authEmail : undefined,
      password: typeof body.password === 'string' ? body.password : undefined,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-admin-provisioned',
      statusCode: 201,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId,
      metadata: {
        adminProfileId: created.admin.id,
        adminIdentifier: created.admin.adminIdentifier,
        committedAt,
      },
    });
    logServerEvent({
      event: 'developer-school-admin-provisioned',
      requestId,
      endpoint,
      role: 'developer',
      schoolId,
      statusCode: 201,
      details: {
        adminProfileId: created.admin.id,
      },
    });
    return dataJson({
      requestId,
      status: 201,
      data: created,
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to provision school admin.';
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-admin-provision-failed',
      statusCode: /required|valid|not found|exists|password|phone/i.test(message) ? 400 : 500,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId,
      metadata: {
        message: message.slice(0, 300),
        ip: getClientIp(req),
      },
    });
    return errorJson({
      requestId,
      errorCode: 'developer-school-admin-provision-failed',
      message,
      status: /required|valid|password|phone/i.test(message) ? 400 : (/not found/i.test(message) ? 404 : 500),
    });
  }
}
