import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { packLifecycleSchema } from '@/lib/schemas/teacher-pack';
import { updateAssignmentPackLifecycle } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Unauthorized teacher access.', requestId);
  const packId = params.id?.trim();
  if (!packId) {
    return errorJson({
      requestId,
      errorCode: 'missing-pack-id',
      message: 'Assignment pack id is required.',
      status: 400,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, packLifecycleSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const { action, validUntil } = bodyResult.value;
  const extendDays = validUntil ? undefined : undefined; // validUntil drives extension
  try {
    const pack = await updateAssignmentPackLifecycle({
      teacherId: session.teacher.id,
      packId,
      action,
      extendDays: Number.isFinite(extendDays) ? extendDays : undefined,
    });
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/teacher/assignment-pack/[id]/lifecycle',
      action: `teacher-assignment-lifecycle-${action}`,
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        teacherId: session.teacher.id,
        packId,
        action,
        extendDays: Number.isFinite(extendDays) ? extendDays : undefined,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { pack },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update assignment lifecycle.';
    const status = /required|valid|action/i.test(message) ? 400 : 500;
    return errorJson({
      requestId,
      errorCode: 'teacher-assignment-lifecycle-failed',
      message,
      status,
    });
  }
}
