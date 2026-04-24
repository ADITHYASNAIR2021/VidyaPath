import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { normalizeAcademicStream } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { updateStudentSchema } from '@/lib/schemas/admin-management';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { updateStudent } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
  try {
    await assertTeacherStorageWritable();
    const bodyResult = await parseAndValidateJsonBody(req, 32 * 1024, updateStudentSchema);
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
    const updates: Partial<{
      name: string;
      rollCode: string;
      rollNo: string;
    batch: string;
    classLevel: 10 | 12;
      stream: 'pcm' | 'pcb' | 'commerce';
      section?: string;
      status: 'active' | 'inactive';
      password: string;
    }> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.rollCode === 'string') updates.rollCode = body.rollCode;
    if (typeof body.rollNo === 'string') updates.rollNo = body.rollNo;
    if (typeof body.batch === 'string') updates.batch = body.batch;
    if (Number(body.classLevel) === 10 || Number(body.classLevel) === 12) updates.classLevel = Number(body.classLevel) as 10 | 12;
    if (body.stream !== undefined) {
      const stream = normalizeAcademicStream(body.stream);
      if (stream) updates.stream = stream;
    }
    if (typeof body.section === 'string') updates.section = body.section;
    if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;
    if (typeof body.password === 'string') updates.password = body.password;

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
