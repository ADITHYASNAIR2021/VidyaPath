import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { isValidPin } from '@/lib/auth/pin';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { createTeacher, listTeachers } from '@/lib/teacher-admin-db';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface CreateTeacherRequest {
  phone: string;
  name: string;
  pin?: string;
  staffCode?: string;
  password?: string;
  scopes?: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>;
}

function parseCreateTeacher(value: unknown): CreateTeacherRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
  const staffCode = typeof body.staffCode === 'string' ? body.staffCode.trim() : undefined;
  const password = typeof body.password === 'string' ? body.password.trim() : undefined;
  if (!phone || !name) return null;
  if (pin && !isValidPin(pin)) return null;
  const scopes: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> = [];
  if (Array.isArray(body.scopes)) {
    body.scopes.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const scope = item as Record<string, unknown>;
      const classLevel = Number(scope.classLevel);
      const subject = typeof scope.subject === 'string' ? scope.subject.trim() : '';
      const section = typeof scope.section === 'string' ? scope.section.trim() : undefined;
      if ((classLevel !== 10 && classLevel !== 12) || !subject || !isSupportedSubject(subject)) return;
      scopes.push({ classLevel: classLevel as 10 | 12, subject: subject as TeacherScope['subject'], section });
    });
  }
  return { phone, name, pin, staffCode, password, scopes };
}

function generatePin(seed: string): string {
  const digits = seed.replace(/\D/g, '');
  const fromSeed = digits.slice(-4);
  if (fromSeed.length === 4) return fromSeed;
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const teachers = await listTeachers(adminSession.role === 'admin' ? adminSession.schoolId : undefined);
  return dataJson({ requestId, data: { teachers } });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  const parsed = parseCreateTeacher(body);
  if (!parsed) {
    return errorJson({
      requestId,
      errorCode: 'invalid-create-teacher-payload',
      message: 'Invalid request. Required: { phone, name, scopes? } and optional { pin, password }.',
      status: 400,
    });
  }
  try {
    await assertTeacherStorageWritable();
    const schoolId = adminSession.role === 'developer'
      ? (typeof body.schoolId === 'string' ? String(body.schoolId).trim() : undefined)
      : adminSession.schoolId;
    if (!schoolId) {
      return errorJson({
        requestId,
        errorCode: 'missing-school-scope',
        message: 'School scope missing for admin session.',
        status: 400,
      });
    }
    const issuedPin = parsed.pin || generatePin(parsed.phone);
    const issuedPassword = (parsed.password && parsed.password.trim()) || issuedPin;
    const teacher = await createTeacher({
      ...parsed,
      schoolId,
      pin: issuedPin,
      password: issuedPassword,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers',
      action: 'admin-create-teacher',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId,
      metadata: { teacherId: teacher.id, committedAt },
    });
    return dataJson({
      requestId,
      data: {
        teacher,
        issuedCredentials: {
          loginIdentifier: teacher.phone,
          alternateIdentifier: teacher.staffCode || undefined,
          pin: issuedPin,
          password: issuedPassword,
        },
      },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create teacher.';
    const status = /required|valid|pin|subject/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return errorJson({
      requestId,
      errorCode: 'create-teacher-failed',
      message,
      status,
    });
  }
}
