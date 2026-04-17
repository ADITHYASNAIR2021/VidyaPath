import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import {
  buildInitialStudentPasswordFromLoginId,
  generateLegacyPin,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createStudentSchema } from '@/lib/schemas/admin-management';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { createStudent, listStudents } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

function generatePin(seed: string): string {
  return generateLegacyPin(seed, 6);
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const url = new URL(req.url);
  const classLevelRaw = Number(url.searchParams.get('classLevel'));
  const classLevel = classLevelRaw === 10 || classLevelRaw === 12 ? classLevelRaw : undefined;
  const section = url.searchParams.get('section')?.trim() || undefined;
  const status = url.searchParams.get('status');
  const schoolId =
    adminSession.role === 'developer'
      ? (url.searchParams.get('schoolId')?.trim() || undefined)
      : adminSession.schoolId;
  const students = await listStudents({
    schoolId,
    classLevel,
    section,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  });
  return dataJson({ requestId, data: { students } });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  try {
    await assertTeacherStorageWritable();
    const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, createStudentSchema);
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
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rollCode = typeof body.rollCode === 'string' ? body.rollCode.trim() : '';
    const rollNo = typeof body.rollNo === 'string' ? body.rollNo.trim() : '';
    const batch = typeof body.batch === 'string' ? body.batch.trim() : undefined;
    const classLevel = Number(body.classLevel);
    const section = typeof body.section === 'string' ? body.section.trim() : undefined;
    const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
    const schoolId = adminSession.role === 'developer'
      ? (typeof body.schoolId === 'string' ? body.schoolId.trim() : undefined)
      : adminSession.schoolId;
    if (!name || (classLevel !== 10 && classLevel !== 12)) {
      return errorJson({
        requestId,
        errorCode: 'invalid-student-core-fields',
        message: 'Required: name and classLevel(10|12).',
        status: 400,
      });
    }
    if (!schoolId) {
      return errorJson({
        requestId,
        errorCode: 'missing-school-scope',
        message: 'School scope missing for admin session.',
        status: 400,
      });
    }

    const issuedPin = pin && /^\d{4,8}$/.test(pin) ? pin : generatePin(rollNo || rollCode || name);
    const student = await createStudent({
      schoolId,
      name,
      rollCode: rollCode || undefined,
      rollNo: rollNo || undefined,
      batch,
      classLevel: classLevel as 10 | 12,
      section,
      pin: issuedPin,
    });
    const issuedPassword = buildInitialStudentPasswordFromLoginId(student.rollCode);
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/students',
      action: 'admin-create-student',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId,
      metadata: { studentId: student.id, committedAt },
    });
    return dataJson({
      requestId,
      data: {
        student,
        issuedCredentials: {
          loginIdentifier: student.rollCode,
          alternateIdentifier: student.rollNo,
          pin: issuedPin,
          password: issuedPassword,
        },
      },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create student.';
    const status = /valid|required/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'create-student-failed',
      message,
      status,
    });
  }
}
