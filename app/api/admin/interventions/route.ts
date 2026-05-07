import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { bodyReasonToStatus, parseAndValidateJsonBody } from '@/lib/http/request-body';
import { recordAuditEvent } from '@/lib/security/audit';
import { z } from 'zod';
import { listAdminInterventions, syncAdminQueueInterventions } from '@/lib/admin/interventions';

export const dynamic = 'force-dynamic';

const syncSchema = z.object({
  queue: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    priority: z.enum(['high', 'medium']),
    title: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(320),
    href: z.string().trim().min(1).max(240),
    riskReason: z.string().trim().max(400).optional(),
  })).max(40),
});

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (session.role === 'admin' && !session.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 403,
    });
  }
  try {
    const schoolId = session.schoolId || '';
    const interventions = await listAdminInterventions(schoolId);
    return dataJson({ requestId, data: { interventions } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'interventions-read-failed',
      message: error instanceof Error ? error.message : 'Failed to load interventions.',
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (session.role === 'admin' && !session.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 403,
    });
  }
  const parsed = await parseAndValidateJsonBody(req, 24 * 1024, syncSchema);
  if (!parsed.ok) {
    return errorJson({
      requestId,
      errorCode: parsed.reason,
      message: parsed.message,
      status: bodyReasonToStatus(parsed.reason),
      issues: parsed.issues,
    });
  }
  try {
    const schoolId = session.schoolId || '';
    const interventions = await syncAdminQueueInterventions(schoolId, parsed.value.queue);
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/interventions',
      action: 'admin-sync-interventions',
      statusCode: 200,
      actorRole: session.role,
      actorAuthUserId: session.authUserId,
      schoolId,
      metadata: { queueCount: parsed.value.queue.length },
    });
    return dataJson({ requestId, data: { interventions } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'interventions-sync-failed',
      message: error instanceof Error ? error.message : 'Failed to sync interventions.',
      status: 500,
    });
  }
}
