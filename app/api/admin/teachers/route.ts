import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { isValidPin } from '@/lib/auth/pin';
import {
  generateLegacyPin,
  generateStrongPassword,
  validatePasswordPolicy,
} from '@/lib/auth/password-policy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createTeacherSchema } from '@/lib/schemas/admin-management';
import { sendCredentialMail } from '@/lib/notifications/credential-email';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { createTeacher, listTeachers } from '@/lib/teacher/auth.db';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface CreateTeacherRequest {
  email: string;
  phone?: string;
  name: string;
  pin?: string;
  staffCode?: string;
  password?: string;
  sendCredentialEmail: boolean;
  scopes?: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>;
}

function parseCreateTeacher(value: unknown): CreateTeacherRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
  const staffCode = typeof body.staffCode === 'string' ? body.staffCode.trim() : undefined;
  const password = typeof body.password === 'string' ? body.password.trim() : undefined;
  const sendCredentialEmail = body.sendCredentialEmail !== false;
  if (!email || !name) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (pin && !isValidPin(pin)) return null;
  if (password) {
    const passwordPolicy = validatePasswordPolicy(password);
    if (!passwordPolicy.ok) return null;
  }
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
  return { email, phone, name, pin, staffCode, password, sendCredentialEmail, scopes };
}

function generatePin(seed: string): string {
  return generateLegacyPin(seed, 6);
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

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, createTeacherSchema);
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
  const parsed = parseCreateTeacher(body);
  if (!parsed) {
    return errorJson({
      requestId,
      errorCode: 'invalid-create-teacher-payload',
      message: 'Invalid request. Required: { email, name } and optional { phone, pin(4-8), password(6-18 with upper/lower/number/symbol), scopes?, sendCredentialEmail }.',
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
    const issuedPin = parsed.pin || generatePin(parsed.phone || parsed.email);
    const issuedPassword = (parsed.password && parsed.password.trim()) || generateStrongPassword(12);
    const teacher = await createTeacher({
      schoolId,
      email: parsed.email,
      phone: parsed.phone,
      name: parsed.name,
      staffCode: parsed.staffCode,
      pin: issuedPin,
      password: issuedPassword,
      scopes: parsed.scopes,
    });
    const mailDelivery = parsed.sendCredentialEmail
      ? await sendCredentialMail({
          to: parsed.email,
          recipientName: teacher.name,
          role: 'teacher',
          schoolName: adminSession.schoolName,
          loginId: parsed.email,
          password: issuedPassword,
          mustChangePassword: true,
        })
      : {
          delivered: false,
          provider: 'none' as const,
          message: 'Credential email intentionally skipped.',
        };
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
          loginIdentifier: parsed.email,
          staffIdentifier: teacher.staffCode,
          phone: teacher.phone,
          email: parsed.email,
          pin: issuedPin,
          password: issuedPassword,
        },
        delivery: mailDelivery,
      },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create teacher.';
    const status = /required|valid|pin|password|subject/i.test(message)
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
