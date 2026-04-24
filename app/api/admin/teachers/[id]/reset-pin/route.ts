import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { generateStrongPassword, validatePasswordPolicy } from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { resetPinSchema } from '@/lib/schemas/admin-management';
import { getTeacherById, resetTeacherPassword } from '@/lib/teacher/auth.db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (adminSession.role === 'admin' && !adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 403,
    });
  }
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
  const requestedPassword = typeof bodyResult.value.newPassword === 'string'
    ? bodyResult.value.newPassword.trim()
    : (typeof bodyResult.value.password === 'string' ? bodyResult.value.password.trim() : '');
  const issuedPassword = bodyResult.value.generateRandom === true ? generateStrongPassword(12) : requestedPassword;
  if (!issuedPassword) {
    return errorJson({
      requestId,
      errorCode: 'missing-password',
      message: 'newPassword is required unless generateRandom=true.',
      status: 400,
    });
  }
  const policy = validatePasswordPolicy(issuedPassword);
  if (!policy.ok) {
    return errorJson({
      requestId,
      errorCode: 'invalid-password-format',
      message: policy.message,
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
    const ok = await resetTeacherPassword(teacherId, issuedPassword);
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
      action: 'admin-reset-teacher-password',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: adminSession.schoolId,
      metadata: { teacherId, committedAt },
    });
    return dataJson({
      requestId,
      data: {
        ok: true,
        issuedCredentials: {
          loginIdentifier: teacher.phone || teacher.staffCode || teacher.id,
          password: issuedPassword,
          mustChangePassword: true,
        },
      },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'reset-teacher-password-failed',
      message,
      status,
    });
  }
}
