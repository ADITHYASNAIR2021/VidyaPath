import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject, normalizeAcademicStream } from '@/lib/academic-taxonomy';
import { isValidPin } from '@/lib/auth/pin';
import {
  buildInitialStudentPasswordFromLoginId,
  generateLegacyPin,
  generateStrongPassword,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { importRosterSchema } from '@/lib/schemas/admin-management';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { createStudent } from '@/lib/teacher-admin-db';
import { createTeacher } from '@/lib/teacher/auth.db';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

type ImportEntity = 'students' | 'teachers';

interface ImportRowRecord {
  [key: string]: unknown;
}

function readString(value: unknown, max = 220): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function readClassLevel(value: unknown): 10 | 12 | null {
  const n = Number(value);
  if (n === 10 || n === 12) return n;
  return null;
}

function generateStudentPin(seed: string): string {
  return generateLegacyPin(seed, 6);
}

function generateTeacherPin(seed: string): string {
  return generateLegacyPin(seed, 6);
}

function normalizeSubject(value: string): TeacherScope['subject'] | null {
  const subject = value.trim();
  if (!subject || !isSupportedSubject(subject)) return null;
  return subject as TeacherScope['subject'];
}

function parseTeacherScopes(row: ImportRowRecord): Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> {
  const explicit = Array.isArray(row.scopes) ? row.scopes : null;
  const parsed: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> = [];
  if (explicit) {
    for (const item of explicit) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const classLevel = readClassLevel(obj.classLevel);
      const subject = normalizeSubject(readString(obj.subject, 60));
      const section = readString(obj.section, 40);
      if (!classLevel || !subject) continue;
      parsed.push({ classLevel, subject, section: section || undefined });
    }
  }

  if (parsed.length > 0) return parsed;
  const classLevel = readClassLevel(row.scopeClassLevel ?? row.classLevel);
  const subject = normalizeSubject(readString(row.scopeSubject ?? row.subject, 60));
  const section = readString(row.scopeSection ?? row.section, 40);
  if (!classLevel || !subject) return [];
  return [{ classLevel, subject, section: section || undefined }];
}

function parseRows(value: unknown): ImportRowRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => !!item && typeof item === 'object')
    .map((item) => item as ImportRowRecord);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/admin/import/roster';
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 4 * 1024 * 1024, importRosterSchema);
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
  const emergencyOverride = body.emergencyOverride === true;
  const entity: ImportEntity | null = body.entity === 'students' || body.entity === 'teachers'
    ? body.entity
    : null;
  if (!entity) {
    return errorJson({
      requestId,
      errorCode: 'invalid-import-entity',
      message: 'entity must be either students or teachers.',
      status: 400,
    });
  }

  const schoolId = adminSession.role === 'developer'
    ? readString(body.schoolId, 80)
    : (adminSession.schoolId || '');
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 400,
    });
  }
  const limit = await checkRateLimit({
    key: buildRateLimitKey('admin:roster-import:bulk-write', [schoolId]),
    windowSeconds: 60,
    maxRequests: 5,
    blockSeconds: 180,
  });
  if (!limit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many roster import attempts for this school. Please retry shortly.',
      status: 429,
      hint: `Retry after ${limit.retryAfterSeconds}s`,
    });
  }

  if (entity === 'students' && adminSession.role === 'admin' && !emergencyOverride) {
    return errorJson({
      requestId,
      errorCode: 'teacher-owned-student-roster',
      message: 'Student roster import is class-teacher owned. Use teacher class-section import, or set emergencyOverride=true.',
      status: 403,
    });
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
  if (rows.length > 1000) {
    return errorJson({
      requestId,
      errorCode: 'import-rows-too-large',
      message: 'Max 1000 rows per import request.',
      status: 413,
    });
  }

  const created: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      if (entity === 'students') {
        const name = readString(row.name, 120);
        const rollNo = readString(row.rollNo ?? row.roll_number ?? row.roll, 50).toUpperCase();
        const rollCode = readString(row.rollCode ?? row.roll_code, 80).toUpperCase();
        const classLevel = readClassLevel(row.classLevel ?? row.class ?? row.standard);
        const stream = normalizeAcademicStream(row.stream ?? row.academicStream ?? row.track);
        const section = readString(row.section, 30);
        const batch = readString(row.batch, 30);
        if (!name || !classLevel) {
          throw new Error('Required student fields: name and classLevel.');
        }
        if (classLevel === 12 && !stream) {
          throw new Error('Class 12 student rows must include stream (pcm|pcb|commerce|interdisciplinary).');
        }
        const pinInput = readString(row.pin, 16);
        const pin = pinInput && isValidPin(pinInput) ? pinInput : generateStudentPin(rollNo || rollCode || name);
        const student = await createStudent({
          schoolId,
          name,
          rollNo: rollNo || undefined,
          rollCode: rollCode || undefined,
          classLevel,
          stream,
          section: section || undefined,
          batch: batch || undefined,
          pin,
        });
        created.push({
          rowIndex: index + 1,
          id: student.id,
          entity: 'student',
          name: student.name,
          classLevel: student.classLevel,
          section: student.section,
          issuedCredentials: {
            loginIdentifier: student.rollCode,
            alternateIdentifier: student.rollNo,
            pin,
            password: buildInitialStudentPasswordFromLoginId(student.rollCode),
          },
        });
      } else {
        const name = readString(row.name, 120);
        const email = readString(row.email ?? row.authEmail ?? row.teacherEmail, 180).toLowerCase();
        const phone = readString(row.phone, 24);
        const staffCode = readString(row.staffCode ?? row.staff_code ?? row.teacherCode, 50).toUpperCase();
        const scopes = parseTeacherScopes(row);
        if (!name || !email) {
          throw new Error('Required teacher fields: name and email.');
        }
        if (scopes.length === 0) {
          throw new Error('Each teacher row must include at least one valid scope (class + subject).');
        }
        const pinInput = readString(row.pin, 16);
        const pin = pinInput && isValidPin(pinInput) ? pinInput : generateTeacherPin(phone || staffCode || name);
        const providedPassword = readString(row.password, 120);
        if (providedPassword) {
          const policy = validatePasswordPolicy(providedPassword);
          if (!policy.ok) throw new Error(policy.message);
        }
        const password = providedPassword || generateStrongPassword(12);
        const teacher = await createTeacher({
          schoolId,
          name,
          email,
          phone,
          staffCode: staffCode || undefined,
          pin,
          password,
          scopes,
        });
        created.push({
          rowIndex: index + 1,
          id: teacher.id,
          entity: 'teacher',
          name: teacher.name,
          issuedCredentials: {
            loginIdentifier: email,
            alternateIdentifier: teacher.staffCode || teacher.phone,
            pin,
            password,
          },
          scopes: teacher.scopes.map((scope) => ({
            classLevel: scope.classLevel,
            subject: scope.subject,
            section: scope.section,
          })),
        });
      }
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
    action: `admin-import-${entity}`,
    statusCode: failed.length === 0 ? 200 : 207,
    actorRole: adminSession.role,
    actorAuthUserId: adminSession.authUserId,
    schoolId,
      metadata: {
        entity,
        totalRows: rows.length,
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
      entity,
      totalRows: rows.length,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    },
    meta: { committedAt },
  });
}
