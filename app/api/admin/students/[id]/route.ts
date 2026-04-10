import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { updateStudent } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  try {
    await assertTeacherStorageWritable();
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
    const updates: Partial<{
      name: string;
      rollCode: string;
      rollNo: string;
      batch: string;
      classLevel: 10 | 12;
      section?: string;
      status: 'active' | 'inactive';
      pin: string;
    }> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.rollCode === 'string') updates.rollCode = body.rollCode;
    if (typeof body.rollNo === 'string') updates.rollNo = body.rollNo;
    if (typeof body.batch === 'string') updates.batch = body.batch;
    if (Number(body.classLevel) === 10 || Number(body.classLevel) === 12) updates.classLevel = Number(body.classLevel) as 10 | 12;
    if (typeof body.section === 'string') updates.section = body.section;
    if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;
    if (typeof body.pin === 'string') updates.pin = body.pin;

    const schoolId = adminSession.role === 'admin' ? adminSession.schoolId : undefined;
    const student = await updateStudent(params.id, updates, schoolId);
    if (!student) {
      return errorJson({
        requestId,
        errorCode: 'student-not-found',
        message: 'Student not found.',
        status: 404,
      });
    }
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/students/[id]',
      action: 'admin-update-student',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId: schoolId,
      metadata: { studentId: params.id, committedAt, fields: Object.keys(updates) },
    });
    return dataJson({
      requestId,
      data: { student },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update student.';
    const status = /valid|required/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'update-student-failed',
      message,
      status,
    });
  }
}
