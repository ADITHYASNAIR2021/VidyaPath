import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { normalizeAcademicStream } from '@/lib/academic-taxonomy';
import {
  generateStrongPassword,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { importStudentsSchema } from '@/lib/schemas/teacher-roster';
import { getClassSectionById, isTeacherClassTeacherForSection } from '@/lib/school-management-db';
import { isSubjectInCatalog } from '@/lib/subject-catalog-db';
import { createStudent } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';
import { checkRateLimit, buildRateLimitKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
const MAX_IMPORT_ROWS_TEACHER = 200;
const MAX_IMPORT_ROWS_ADMIN_OVERRIDE = 1500;

interface ImportRowRecord {
  [key: string]: unknown;
}

function readString(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseRows(value: unknown): ImportRowRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => !!item && typeof item === 'object').map((item) => item as ImportRowRecord);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/teacher/class-sections/students/import';
  const teacherSession = await getTeacherSessionFromRequestCookies();
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!teacherSession && !adminSession) return unauthorizedJson('Teacher session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 2 * 1024 * 1024, importStudentsSchema);
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
  const classSectionId = readString(body.classSectionId, 90);
  const emergencyOverride = body.emergencyOverride === true;
  if (!classSectionId) {
    return errorJson({
      requestId,
      errorCode: 'missing-class-section-id',
      message: 'classSectionId is required.',
      status: 400,
    });
  }
  const classSection = await getClassSectionById(classSectionId);
  if (!classSection) {
    return errorJson({
      requestId,
      errorCode: 'class-section-not-found',
      message: 'Class section not found.',
      status: 404,
    });
  }
  if (teacherSession) {
    const allowed = await isTeacherClassTeacherForSection(teacherSession.teacher.id, classSectionId, classSection.schoolId);
    if (!allowed) {
      return errorJson({
        requestId,
        errorCode: 'class-teacher-required',
        message: 'Only class teacher can import students for this section.',
        status: 403,
      });
    }
  } else {
    if (!adminSession || !emergencyOverride) {
      return errorJson({
        requestId,
        errorCode: 'admin-emergency-override-required',
        message: 'Admin emergency override is required when class teacher session is not used.',
        status: 403,
      });
    }
  }

  const rows = parseRows(body.rows);
  if (rows.length === 0) {
    return errorJson({
      requestId,
      errorCode: 'empty-import-rows',
      message: 'rows must contain at least one entry.',
      status: 400,
    });
  }
  if (rows.length > MAX_IMPORT_ROWS_ADMIN_OVERRIDE) {
    return errorJson({
      requestId,
      errorCode: 'import-rows-too-large',
      message: `Max ${MAX_IMPORT_ROWS_ADMIN_OVERRIDE} rows per import request.`,
      status: 413,
    });
  }
  if (teacherSession && rows.length > MAX_IMPORT_ROWS_TEACHER) {
    return errorJson({
      requestId,
      errorCode: 'teacher-import-cap-exceeded',
      message: `Teacher import is capped at ${MAX_IMPORT_ROWS_TEACHER} rows per request. Use admin emergency override for larger batches.`,
      status: 403,
    });
  }

  const schoolRateLimit = await checkRateLimit({
    key: buildRateLimitKey('teacher:students-import:school', [classSection.schoolId]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 180,
    metadata: {
      actorRole: teacherSession ? 'teacher' : 'admin',
      schoolId: classSection.schoolId,
      classSectionId,
      emergencyOverride,
    },
  });
  if (!schoolRateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many import attempts for this school. Please retry shortly.',
      status: 429,
      hint: `Retry after ${schoolRateLimit.retryAfterSeconds}s`,
    });
  }
  if (teacherSession) {
    const teacherRateLimit = await checkRateLimit({
      key: buildRateLimitKey('teacher:students-import:teacher', [teacherSession.teacher.id]),
      windowSeconds: 60,
      maxRequests: 4,
      blockSeconds: 180,
      metadata: {
        teacherId: teacherSession.teacher.id,
        schoolId: classSection.schoolId,
        classSectionId,
      },
    });
    if (!teacherRateLimit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many import attempts for this teacher account. Please retry shortly.',
        status: 429,
        hint: `Retry after ${teacherRateLimit.retryAfterSeconds}s`,
      });
    }
  }

  const created: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const name = readString(row.name, 120);
      const rollNo = readString(row.rollNo ?? row.roll_number ?? row.roll, 50).toUpperCase();
      const rollCode = readString(row.rollCode ?? row.roll_code, 80).toUpperCase();
      const stream = normalizeAcademicStream(row.stream ?? row.academicStream ?? row.track);
      const subjects = readString(row.subjects, 500)
        .split(/[,|;]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (!name) {
        throw new Error('Required student field missing: name.');
      }
      if (classSection.classLevel === 10 && stream) {
        throw new Error('Class 10 does not use stream.');
      }
      for (const subject of subjects) {
        const allowed = await isSubjectInCatalog({
          schoolId: classSection.schoolId,
          classLevel: classSection.classLevel,
          subject,
        });
        if (!allowed) {
          throw new Error(`Unsupported subject for Class ${classSection.classLevel}: ${subject}.`);
        }
      }
      const providedPassword = readString(row.password, 120);
      if (providedPassword) {
        const policy = validatePasswordPolicy(providedPassword);
        if (!policy.ok) throw new Error(policy.message);
      }
      const issuedPassword = providedPassword || generateStrongPassword(12);
      const student = await createStudent({
        schoolId: classSection.schoolId,
        name,
        rollNo: rollNo || undefined,
        rollCode: rollCode || undefined,
        classLevel: classSection.classLevel,
        stream,
        section: classSection.section,
        batch: classSection.batch,
        password: issuedPassword,
        subjects,
        forcePasswordChangeOnFirstLogin: true,
      });
      created.push({
        rowIndex: index + 1,
        id: student.id,
        name: student.name,
        classLevel: student.classLevel,
        section: student.section,
        batch: student.batch,
        issuedCredentials: {
          loginIdentifier: student.rollCode,
          alternateIdentifier: student.rollNo,
          password: issuedPassword,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import row failed.';
      failed.push({
        rowIndex: index + 1,
        message,
        row,
      });
    }
  }
  const committedAt = new Date().toISOString();
  await recordAuditEvent({
    requestId,
    endpoint,
    action: 'class-section-student-import',
    statusCode: failed.length === 0 ? 200 : 207,
    actorRole: teacherSession ? 'teacher' : (adminSession?.role || 'admin'),
    actorAuthUserId: adminSession?.authUserId,
    schoolId: classSection.schoolId,
    metadata: {
      actorType: teacherSession ? 'teacher' : 'admin',
      classSectionId,
      classLevel: classSection.classLevel,
      section: classSection.section,
      batch: classSection.batch,
      created: created.length,
      failed: failed.length,
      emergencyOverride,
      committedAt,
    },
  });
  return dataJson({
    requestId,
    status: failed.length === 0 ? 200 : 207,
    data: {
      totalRows: rows.length,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    },
    meta: { committedAt },
  });
}
