import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { normalizeAcademicStream } from '@/lib/academic-taxonomy';
import {
  generateStrongPassword,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { importRosterSchema } from '@/lib/schemas/admin-management';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { isSubjectInCatalog } from '@/lib/subject-catalog-db';
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

function normalizeSubject(value: string): TeacherScope['subject'] | null {
  const subject = value.trim();
  if (!subject) return null;
  return subject as TeacherScope['subject'];
}

function parseSubjectList(value: unknown): TeacherScope['subject'][] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeSubject(String(item || '').trim()))
      .filter((item): item is TeacherScope['subject'] => !!item);
  }
  const raw = readString(value, 600);
  if (!raw) return [];
  return raw
    .split(/[,|;]/)
    .map((item) => normalizeSubject(item))
    .filter((item): item is TeacherScope['subject'] => !!item);
}

function parseRows(value: unknown): ImportRowRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => !!item && typeof item === 'object')
    .map((item) => item as ImportRowRecord);
}

function studentMapKey(input: {
  rollCode?: string;
  rollNo?: string;
  name?: string;
  classLevel?: 10 | 12 | null;
  section?: string;
}) {
  const rollCode = readString(input.rollCode, 80).toUpperCase();
  const rollNo = readString(input.rollNo, 50).toUpperCase();
  const name = readString(input.name, 120).toUpperCase();
  const classLevel = input.classLevel === 10 || input.classLevel === 12 ? String(input.classLevel) : '';
  const section = readString(input.section, 40).toUpperCase();
  return [rollCode, rollNo, name, classLevel, section].join('|');
}

function parseTeacherScopes(
  row: ImportRowRecord,
  relationalScopes: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>
): Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> {
  const parsed: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> = [];
  const explicit = Array.isArray(row.scopes) ? row.scopes : null;
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

  const fallbackClassLevel = readClassLevel(row.scopeClassLevel ?? row.classLevel ?? row.class);
  const fallbackSubject = normalizeSubject(readString(row.scopeSubject ?? row.subject, 60));
  const fallbackSection = readString(row.scopeSection ?? row.section, 40);
  if (fallbackClassLevel && fallbackSubject) {
    parsed.push({ classLevel: fallbackClassLevel, subject: fallbackSubject, section: fallbackSection || undefined });
  }

  for (const scope of relationalScopes) {
    parsed.push(scope);
  }

  const deduped = new Map<string, { classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>();
  for (const scope of parsed) {
    const key = `${scope.classLevel}|${scope.subject}|${scope.section || ''}`;
    if (!deduped.has(key)) deduped.set(key, scope);
  }
  return [...deduped.values()];
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
  const dryRun = body.dryRun === true;
  const forcePasswordChangeOnFirstLogin = body.forcePasswordChangeOnFirstLogin !== false;
  const entity: ImportEntity | null = body.entity === 'students' || body.entity === 'teachers'
    ? body.entity
    : body.entity === 'student'
      ? 'students'
      : body.entity === 'teacher'
        ? 'teachers'
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

  const sheets = body.sheets || {};
  const simpleRows = parseRows(body.rows);
  const sheetRows = entity === 'teachers'
    ? parseRows((sheets as Record<string, unknown>).Teachers)
    : parseRows((sheets as Record<string, unknown>).Students);
  const rows = simpleRows.length > 0 ? simpleRows : sheetRows;

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

  const teacherScopesByEmail = new Map<string, Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>>();
  for (const scopeRow of parseRows((sheets as Record<string, unknown>).TeacherScopes)) {
    const teacherEmail = readString(scopeRow.teacherEmail ?? scopeRow.email, 180).toLowerCase();
    const classLevel = readClassLevel(scopeRow.classLevel ?? scopeRow.class ?? scopeRow.scopeClassLevel);
    const subject = normalizeSubject(readString(scopeRow.subject ?? scopeRow.scopeSubject, 80));
    const section = readString(scopeRow.section ?? scopeRow.scopeSection, 40);
    if (!teacherEmail || !classLevel || !subject) continue;
    const current = teacherScopesByEmail.get(teacherEmail) ?? [];
    current.push({ classLevel, subject, section: section || undefined });
    teacherScopesByEmail.set(teacherEmail, current);
  }

  const studentSubjectsByKey = new Map<string, TeacherScope['subject'][]>();
  for (const subjectRow of parseRows((sheets as Record<string, unknown>).StudentSubjects)) {
    const key = studentMapKey({
      rollCode: readString(subjectRow.studentRollCode ?? subjectRow.rollCode, 80),
      rollNo: readString(subjectRow.studentRollNo ?? subjectRow.rollNo ?? subjectRow.rollNumber, 50),
      name: readString(subjectRow.studentName ?? subjectRow.name, 120),
      classLevel: readClassLevel(subjectRow.classLevel ?? subjectRow.class),
      section: readString(subjectRow.section, 40),
    });
    if (!key) continue;
    const subject = normalizeSubject(readString(subjectRow.subject, 80));
    if (!subject) continue;
    const current = studentSubjectsByKey.get(key) ?? [];
    if (!current.includes(subject)) current.push(subject);
    studentSubjectsByKey.set(key, current);
  }

  if (entity === 'teachers' && teacherScopesByEmail.size > 0) {
    const teacherEmails = new Set(rows.map((row) => readString(row.email ?? row.authEmail ?? row.teacherEmail, 180).toLowerCase()).filter(Boolean));
    const unresolved = [...teacherScopesByEmail.keys()].filter((email) => !teacherEmails.has(email));
    if (unresolved.length > 0) {
      return errorJson({
        requestId,
        errorCode: 'teacher-scope-reference-mismatch',
        message: `TeacherScopes contains references that do not exist in Teachers sheet: ${unresolved.slice(0, 5).join(', ')}`,
        status: 400,
      });
    }
  }

  if (entity === 'students' && studentSubjectsByKey.size > 0) {
    const studentKeys = new Set(rows.map((row) => studentMapKey({
      rollCode: readString(row.rollCode ?? row.roll_code, 80).toUpperCase(),
      rollNo: readString(row.rollNo ?? row.roll_number ?? row.roll ?? row.rollNumber, 50).toUpperCase(),
      name: readString(row.name, 120),
      classLevel: readClassLevel(row.classLevel ?? row.class ?? row.standard),
      section: readString(row.section ?? row.sectionName, 30),
    })));
    const unresolved = [...studentSubjectsByKey.keys()].filter((key) => !studentKeys.has(key));
    if (unresolved.length > 0) {
      return errorJson({
        requestId,
        errorCode: 'student-subject-reference-mismatch',
        message: 'StudentSubjects contains references that do not exist in Students sheet.',
        status: 400,
      });
    }
  }

  const created: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const subjectCheckCache = new Map<string, boolean>();
  const seenTeacherEmails = new Set<string>();
  const seenStudentRosterKeys = new Set<string>();

  const isAllowedSubject = async (classLevel: 10 | 12, subject: string) => {
    const key = `${classLevel}|${subject.toLowerCase()}`;
    if (subjectCheckCache.has(key)) return subjectCheckCache.get(key) === true;
    const allowed = await isSubjectInCatalog({ schoolId, classLevel, subject });
    subjectCheckCache.set(key, allowed);
    return allowed;
  };

  const assertRowSchoolScope = (row: ImportRowRecord) => {
    if (adminSession.role !== 'admin') return;
    const rowSchoolName = readString(row.schoolName, 160);
    const rowSchoolCode = readString(row.schoolCode, 32).toUpperCase();
    if (rowSchoolName && adminSession.schoolName && rowSchoolName.toLowerCase() !== adminSession.schoolName.toLowerCase()) {
      throw new Error(`Row schoolName (${rowSchoolName}) does not match this admin school scope (${adminSession.schoolName}).`);
    }
    if (rowSchoolCode && adminSession.schoolCode && rowSchoolCode !== adminSession.schoolCode.toUpperCase()) {
      throw new Error(`Row schoolCode (${rowSchoolCode}) does not match this admin school scope (${adminSession.schoolCode}).`);
    }
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      if (entity === 'students') {
        assertRowSchoolScope(row);
        const name = readString(row.name, 120);
        const rollNo = readString(row.rollNo ?? row.roll_number ?? row.roll ?? row.rollNumber, 50).toUpperCase();
        const rollCode = readString(row.rollCode ?? row.roll_code, 80).toUpperCase();
        const classLevel = readClassLevel(row.classLevel ?? row.class ?? row.standard);
        const stream = normalizeAcademicStream(row.stream ?? row.academicStream ?? row.track);
        const section = readString(row.section ?? row.sectionName, 30);
        const batch = readString(row.batch, 30);
        const yearOfEnrollment = Number(row.yearOfEnrollment);
        const subjectList = parseSubjectList(row.subjects);
        const relationalSubjects = studentSubjectsByKey.get(studentMapKey({
          rollCode,
          rollNo,
          name,
          classLevel,
          section,
        })) ?? [];
        const mergedSubjects = [...new Set([...subjectList, ...relationalSubjects])];
        if (!name || !classLevel) {
          throw new Error('Required student fields: name and classLevel.');
        }
        const rosterKey = studentMapKey({ rollCode, rollNo, name, classLevel, section });
        if (seenStudentRosterKeys.has(rosterKey)) {
          throw new Error('Duplicate student identity row detected in this import file.');
        }
        seenStudentRosterKeys.add(rosterKey);
        if (classLevel === 10 && stream) {
          throw new Error('Class 10 does not use stream.');
        }
        for (const subject of mergedSubjects) {
          const allowed = await isAllowedSubject(classLevel, subject);
          if (!allowed) {
            throw new Error(`Unsupported subject for Class ${classLevel}: ${subject}. Add it to school subject catalog first.`);
          }
        }

        const providedPassword = readString(row.password, 120);
        if (providedPassword) {
          const policy = validatePasswordPolicy(providedPassword);
          if (!policy.ok) throw new Error(policy.message);
        }
        const issuedPassword = providedPassword || generateStrongPassword(12);

        if (dryRun) {
          created.push({
            rowIndex: index + 1,
            id: `dry-run-student-${index + 1}`,
            entity: 'student',
            name,
            classLevel,
            section: section || undefined,
            batch: batch || undefined,
            stream,
            yearOfEnrollment: Number.isFinite(yearOfEnrollment) ? yearOfEnrollment : undefined,
            subjects: mergedSubjects,
            issuedCredentials: {
              loginIdentifier: rollCode || '(auto-generated)',
              alternateIdentifier: rollNo || undefined,
              password: issuedPassword,
            },
            mustChangePassword: forcePasswordChangeOnFirstLogin,
            dryRun: true,
          });
          continue;
        }

        const student = await createStudent({
          schoolId,
          name,
          rollNo: rollNo || undefined,
          rollCode: rollCode || undefined,
          classLevel,
          stream,
          section: section || undefined,
          batch: batch || (Number.isFinite(yearOfEnrollment) ? String(Math.trunc(yearOfEnrollment)) : undefined),
          password: issuedPassword,
          subjects: mergedSubjects,
        });
        created.push({
          rowIndex: index + 1,
          id: student.id,
          entity: 'student',
          name: student.name,
          classLevel: student.classLevel,
          section: student.section,
          batch: student.batch,
          stream: student.stream,
          subjects: mergedSubjects,
          issuedCredentials: {
            loginIdentifier: student.rollCode,
            alternateIdentifier: student.rollNo,
            password: issuedPassword,
          },
          mustChangePassword: student.mustChangePassword === true,
        });
      } else {
        assertRowSchoolScope(row);
        const name = readString(row.name, 120);
        const email = readString(row.email ?? row.authEmail ?? row.teacherEmail, 180).toLowerCase();
        const phone = readString(row.phone, 24);
        const staffCode = readString(row.staffCode ?? row.staff_code ?? row.teacherCode, 50).toUpperCase();
        const relationalScopes = teacherScopesByEmail.get(email) ?? [];
        const scopes = parseTeacherScopes(row, relationalScopes);
        if (!name || !email) {
          throw new Error('Required teacher fields: name and email.');
        }
        if (seenTeacherEmails.has(email)) {
          throw new Error('Duplicate teacher email row detected in this import file.');
        }
        seenTeacherEmails.add(email);
        if (scopes.length === 0) {
          throw new Error('Each teacher row must include at least one valid scope (class + subject).');
        }
        for (const scope of scopes) {
          const allowed = await isAllowedSubject(scope.classLevel, scope.subject);
          if (!allowed) {
            throw new Error(`Unsupported scope subject for Class ${scope.classLevel}: ${scope.subject}.`);
          }
        }

        const providedPassword = readString(row.password, 120);
        if (providedPassword) {
          const policy = validatePasswordPolicy(providedPassword);
          if (!policy.ok) throw new Error(policy.message);
        }
        const issuedPassword = providedPassword || generateStrongPassword(12);

        if (dryRun) {
          created.push({
            rowIndex: index + 1,
            id: `dry-run-teacher-${index + 1}`,
            entity: 'teacher',
            name,
            scopes,
            issuedCredentials: {
              loginIdentifier: email,
              alternateIdentifier: staffCode || phone || undefined,
              password: issuedPassword,
            },
            mustChangePassword: forcePasswordChangeOnFirstLogin,
            dryRun: true,
          });
          continue;
        }

        const teacher = await createTeacher({
          schoolId,
          name,
          email,
          phone,
          staffCode: staffCode || undefined,
          password: issuedPassword,
          scopes,
          forcePasswordChangeOnFirstLogin,
          rotatePasswordIfExisting: true,
        });
        created.push({
          rowIndex: index + 1,
          id: teacher.id,
          entity: 'teacher',
          name: teacher.name,
          issuedCredentials: {
            loginIdentifier: email,
            alternateIdentifier: teacher.staffCode || teacher.phone,
            password: issuedPassword,
          },
          scopes: teacher.scopes.map((scope) => ({
            classLevel: scope.classLevel,
            subject: scope.subject,
            section: scope.section,
          })),
          mustChangePassword: teacher.mustChangePassword === true,
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
      dryRun,
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
      dryRun,
    },
    meta: { committedAt },
  });
}
