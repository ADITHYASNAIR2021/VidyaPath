import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { bodyReasonToStatus, parseAndValidateJsonBody } from '@/lib/http/request-body';
import { recordAuditEvent } from '@/lib/security/audit';
import { z } from 'zod';
import { updateAdminIntervention } from '@/lib/admin/interventions';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  owner: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  status: z.enum(['open', 'resolved', 'snoozed']).optional(),
  snoozeUntil: z.string().trim().max(40).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
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
  const parsed = await parseAndValidateJsonBody(req, 8 * 1024, updateSchema);
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
    const { id } = await context.params;
    const intervention = await updateAdminIntervention(schoolId, id, parsed.value);
    if (!intervention) {
      return errorJson({
        requestId,
        errorCode: 'intervention-not-found',
        message: 'Intervention not found.',
        status: 404,
      });
    }
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/interventions/[id]',
      action: 'admin-update-intervention',
      statusCode: 200,
      actorRole: session.role,
      actorAuthUserId: session.authUserId,
      schoolId,
      metadata: {
        interventionId: intervention.id,
        status: intervention.status,
      },
    });
    return dataJson({ requestId, data: { intervention } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'intervention-update-failed',
      message: error instanceof Error ? error.message : 'Failed to update intervention.',
      status: 500,
    });
  }
}
