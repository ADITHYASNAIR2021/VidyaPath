import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { normalizeAcademicStream } from '@/lib/academic-taxonomy';
import {
  generateStrongPassword,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createStudentSchema } from '@/lib/schemas/admin-management';
import { isSubjectInCatalog } from '@/lib/subject-catalog-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { createStudent, listStudents } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

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
    const stream = normalizeAcademicStream(body.stream);
    const section = typeof body.section === 'string' ? body.section.trim() : undefined;
    const providedPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const subjects = Array.isArray(body.subjects)
      ? body.subjects.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
      : [];
    const yearOfEnrollment = Number(body.yearOfEnrollment);
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
    for (const subject of subjects) {
      const allowed = await isSubjectInCatalog({
        schoolId,
        classLevel: classLevel as 10 | 12,
        subject,
      });
      if (!allowed) {
        return errorJson({
          requestId,
          errorCode: 'unsupported-student-subject',
          message: `Unsupported subject for Class ${classLevel}: ${subject}.`,
          status: 400,
        });
      }
    }
    if (providedPassword) {
      const policy = validatePasswordPolicy(providedPassword);
      if (!policy.ok) {
        return errorJson({
          requestId,
          errorCode: 'invalid-student-password',
          message: policy.message,
          status: 400,
        });
      }
    }
    const limit = await checkRateLimit({
      key: buildRateLimitKey('admin:students:bulk-write', [schoolId]),
      windowSeconds: 60,
      maxRequests: 5,
      blockSeconds: 180,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many bulk student mutations for this school. Please retry shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const issuedPassword = providedPassword || generateStrongPassword(12);
    const student = await createStudent({
      schoolId,
      name,
      rollCode: rollCode || undefined,
      rollNo: rollNo || undefined,
      batch,
      classLevel: classLevel as 10 | 12,
      stream,
      section,
      password: issuedPassword,
      subjects,
      yearOfEnrollment: Number.isFinite(yearOfEnrollment) ? Math.trunc(yearOfEnrollment) : undefined,
      forcePasswordChangeOnFirstLogin: true,
    });
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
