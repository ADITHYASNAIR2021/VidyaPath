import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { createSchool, getDeveloperOverview, listSchools } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/schools';
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const schools = await listSchools(
      status === 'active' || status === 'inactive' || status === 'archived' ? status : undefined
    );
    const overview = await getDeveloperOverview();
    const allowedSchoolIds = new Set(schools.map((school) => school.id));
    const data = {
      schools,
      schoolDirectory: overview.schoolDirectory.filter((item) => allowedSchoolIds.has(item.schoolId)),
      counts: overview.counts,
    };
    logServerEvent({
      event: 'developer-schools-read',
      requestId,
      endpoint,
      role: 'developer',
      statusCode: 200,
      details: { schools: schools.length },
    });
    return dataJson({ requestId, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load schools.';
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-schools-read-failed',
      statusCode: 500,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      metadata: { message: message.slice(0, 300), ip: getClientIp(req) },
    });
    return errorJson({
      requestId,
      errorCode: 'developer-schools-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/schools';
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
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
    const school = await createSchool({
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : '',
      schoolCode: typeof body.schoolCode === 'string' ? body.schoolCode : '',
      board: typeof body.board === 'string' ? body.board : 'CBSE',
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : undefined,
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-created',
      statusCode: 200,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId: school.id,
      metadata: {
        schoolCode: school.schoolCode,
        committedAt,
      },
    });
    logServerEvent({
      event: 'developer-school-created',
      requestId,
      endpoint,
      role: 'developer',
      schoolId: school.id,
      statusCode: 200,
      details: { schoolCode: school.schoolCode },
    });
    return dataJson({
      requestId,
      data: { school },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create school.';
    const status = /required|valid/i.test(message) ? 400 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-school-create-failed',
      statusCode: status,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      metadata: { message: message.slice(0, 300), ip: getClientIp(req) },
    });
    return errorJson({
      requestId,
      errorCode: 'developer-school-create-failed',
      message,
      status,
    });
  }
}
