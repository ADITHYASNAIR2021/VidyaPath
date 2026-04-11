import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
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
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 32 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const action =
    bodyResult.value.action === 'extend' || bodyResult.value.action === 'close' || bodyResult.value.action === 'reopen'
      ? bodyResult.value.action
      : '';
  if (!action) {
    return errorJson({
      requestId,
      errorCode: 'invalid-lifecycle-action',
      message: 'action must be extend, close, or reopen.',
      status: 400,
    });
  }
  const extendDays = Number(bodyResult.value.extendDays);
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
