import { POST as adminLoginPOST } from '@/app/api/admin/session/bootstrap/route';
import { POST as developerLoginPOST } from '@/app/api/developer/session/login/route';
import { POST as studentLoginPOST } from '@/app/api/student/session/login/route';
import { POST as teacherLoginPOST } from '@/app/api/teacher/session/login/route';
import { errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { unifiedLoginSchema } from '@/lib/schemas/auth';
import { isDeveloperLoginIdentifier } from '@/lib/auth/developer-login';

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
  // When the user is on a specific portal's login page, only try that handler.
  // Cascading through multiple handlers multiplies rate-limit consumption across
  // unrelated buckets and lets the lowest-limit handler (developer: 8/min) block
  // all users on a shared IP after very few attempts.
  if (portalHint) return [portalHint];
  if (isDeveloperLoginIdentifier(identifier)) return ['developer'];

  // Generic login page: auto-detect role, never include developer
  // unless the identifier matches the configured developer account exactly.
  if (isEmailIdentifier(identifier)) return ['admin', 'teacher'];
  if (isStudentLikeIdentifier(identifier)) return ['student'];
  if (isMostlyNumeric(identifier)) return ['teacher', 'student'];
  return ['teacher', 'student'];
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
  const passthroughHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'true-client-ip',
    'x-client-ip',
    'fastly-client-ip',
    'fly-client-ip',
    'forwarded',
  ];
  for (const headerName of passthroughHeaders) {
    const value = req.headers.get(headerName);
    if (value) headers.set(headerName, value);
  }
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
  let deferredErrorResponse: Response | null = null;

  for (const [index, role] of candidates.entries()) {
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
    const hasMoreCandidates = index < candidates.length - 1;
    const isRetryableCrossRoleFailure = response.status === 429 || response.status === 409 || response.status >= 500;
    if (isRetryableCrossRoleFailure) {
      if (!deferredErrorResponse) deferredErrorResponse = response;
      if (hasMoreCandidates && !portalHint) {
        continue;
      }
      return response;
    }
  }

  if (deferredErrorResponse) {
    return deferredErrorResponse;
  }

  return errorJson({
    requestId,
    errorCode: 'invalid-login-credentials',
    message: 'Invalid ID or password.',
    status: 401,
  });
}
