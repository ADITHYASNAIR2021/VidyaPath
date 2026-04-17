import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isValidPin } from '@/lib/auth/pin';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { resetPinSchema } from '@/lib/schemas/admin-management';
import { getTeacherById, resetTeacherPin } from '@/lib/teacher/auth.db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const teacherId = params.id?.trim();
  if (!teacherId) {
    return errorJson({
      requestId,
      errorCode: 'missing-teacher-id',
      message: 'Teacher id is required.',
      status: 400,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, resetPinSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  const pin = typeof bodyResult.value.pin === 'string' ? bodyResult.value.pin.trim() : '';
  if (!pin) {
    return errorJson({
      requestId,
      errorCode: 'missing-pin',
      message: 'pin is required.',
      status: 400,
    });
  }
  if (!isValidPin(pin)) {
    return errorJson({
      requestId,
      errorCode: 'invalid-pin-format',
      message: 'PIN must be 4 to 8 digits.',
      status: 400,
    });
  }
  try {
    await assertTeacherStorageWritable();
    const teacher = await getTeacherById(teacherId, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!teacher) {
      return errorJson({
        requestId,
        errorCode: 'teacher-not-found',
        message: 'Teacher not found.',
        status: 404,
      });
    }
    const ok = await resetTeacherPin(teacherId, pin);
    if (!ok) {
      return errorJson({
        requestId,
        errorCode: 'teacher-not-found',
        message: 'Teacher not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers/[id]/reset-pin',
      action: 'admin-reset-teacher-pin',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { teacherId, committedAt },
    });
    return dataJson({
      requestId,
      data: { ok: true },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset PIN.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'reset-teacher-pin-failed',
      message,
      status,
    });
  }
}
