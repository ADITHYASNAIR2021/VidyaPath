import { POST as adminLoginPOST } from '@/app/api/admin/session/bootstrap/route';
import { POST as developerLoginPOST } from '@/app/api/developer/session/login/route';
import { POST as studentLoginPOST } from '@/app/api/student/session/login/route';
import { POST as teacherLoginPOST } from '@/app/api/teacher/session/login/route';
import { errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { unifiedLoginSchema } from '@/lib/schemas/auth';

export const dynamic = 'force-dynamic';

type LoginRole = 'student' | 'teacher' | 'admin' | 'developer';

const HANDLERS: Record<LoginRole, (req: Request) => Promise<Response>> = {
  student: studentLoginPOST,
  teacher: teacherLoginPOST,
  admin: adminLoginPOST,
  developer: developerLoginPOST,
};

function normalizeIdentifier(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isEmailIdentifier(value: string): boolean {
  return value.includes('@');
}

function isMostlyNumeric(value: string): boolean {
  const cleaned = value.replace(/[^\d]/g, '');
  return cleaned.length >= 6 && cleaned.length >= Math.max(6, Math.floor(value.length * 0.7));
}

function isStudentLikeIdentifier(value: string): boolean {
  const upper = value.toUpperCase();
  if (upper.startsWith('APS.STU.')) return true;
  if (/^C(10|12)[A-Z0-9._-]*/.test(upper)) return true;
  if (/\.STU\./.test(upper)) return true;
  return false;
}

function buildCandidateRoles(identifier: string, portalHint?: LoginRole): LoginRole[] {
  const roleSet = new Set<LoginRole>();
  if (portalHint) roleSet.add(portalHint);

  if (isEmailIdentifier(identifier)) {
    roleSet.add('admin');
    roleSet.add('teacher');
    roleSet.add('developer');
  } else if (isStudentLikeIdentifier(identifier)) {
    roleSet.add('student');
    roleSet.add('teacher');
    roleSet.add('developer');
  } else if (isMostlyNumeric(identifier)) {
    roleSet.add('teacher');
    roleSet.add('student');
    roleSet.add('developer');
  } else {
    roleSet.add('developer');
    roleSet.add('teacher');
    roleSet.add('student');
  }

  return [...roleSet];
}

function buildRolePayload(role: LoginRole, identifier: string, password: string): Record<string, unknown> {
  if (role === 'student') {
    return { roll: identifier, password };
  }
  if (role === 'teacher') {
    return { identifier, password };
  }
  if (role === 'admin') {
    return { identifier, password };
  }
  return {
    username: identifier,
    email: identifier.includes('@') ? identifier : undefined,
    password,
  };
}

function buildForwardHeaders(req: Request, requestId: string): Headers {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('x-request-id', requestId);
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);
  const realIp = req.headers.get('x-real-ip');
  if (realIp) headers.set('x-real-ip', realIp);
  const userAgent = req.headers.get('user-agent');
  if (userAgent) headers.set('user-agent', userAgent);
  return headers;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, unifiedLoginSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const rawIdentifier = normalizeIdentifier(bodyResult.value.identifier);
  const password = String(bodyResult.value.password || '').trim();
  const portalHint = bodyResult.value.portal;
  if (!rawIdentifier || !password) {
    return errorJson({
      requestId,
      errorCode: 'missing-login-credentials',
      message: 'ID and password are required.',
      status: 400,
    });
  }

  const candidates = buildCandidateRoles(rawIdentifier, portalHint);
  const forwardHeaders = buildForwardHeaders(req, requestId);

  for (const role of candidates) {
    const payload = buildRolePayload(role, rawIdentifier, password);
    const internalRequest = new Request(new URL(req.url), {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(payload),
    });
    const response = await HANDLERS[role](internalRequest);
    if (response.ok) {
      return response;
    }
    if (response.status === 429 || response.status >= 500 || response.status === 409) {
      return response;
    }
  }

  return errorJson({
    requestId,
    errorCode: 'invalid-login-credentials',
    message: 'Invalid ID or password.',
    status: 401,
  });
}
