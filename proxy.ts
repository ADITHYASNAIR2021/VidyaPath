import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { csrfAllowedForMutation } from '@/lib/security/csrf';
import { isInteractiveApiRoute } from '@/lib/security/interactive-api-policy';

const ADMIN_SESSION_COOKIE = 'vp_admin_session';
const TEACHER_SESSION_COOKIE = 'vp_teacher_session';
const STUDENT_SESSION_COOKIE = 'vp_student_session';
const DEVELOPER_SESSION_COOKIE = 'vp_developer_session';
const PARENT_SESSION_COOKIE = 'vp_parent_session';

function resolveSessionSecret(): string {
  return (process.env.SESSION_SIGNING_SECRET || '').trim();
}

interface SessionPayload {
  role: 'admin' | 'teacher' | 'student' | 'developer' | 'parent';
  teacherId?: string;
  studentId?: string;
  studentName?: string;
  rollCode?: string;
  classLevel?: number;
  section?: string;
  username?: string;
  phone?: string;
  mustChangePassword?: boolean;
  expiresAt: number;
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes)
    .map((value) => String.fromCharCode(value))
    .join('');
  return btoa(raw).replace(/=+$/g, '');
}

function buildContentSecurityPolicy(nonce: string): string {
  const connectSources = [
    "'self'",
    'https://*.supabase.co',
    'https://api.groq.com',
    'https://generativelanguage.googleapis.com',
    'https://integrate.api.nvidia.com',
    'https://ai.api.nvidia.com',
    'https://huggingface.co',
    'https://plausible.io',
  ];
  const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();
  if (umamiScriptUrl) {
    try {
      connectSources.push(new URL(umamiScriptUrl).origin);
    } catch {
      // Ignore invalid optional analytics origins.
    }
  }

  const allowUnsafeInlineStyle =
    process.env.NODE_ENV !== 'production' || process.env.CSP_ALLOW_UNSAFE_INLINE_STYLE === '1';
  const styleElemDirective = allowUnsafeInlineStyle
    ? "style-src-elem 'self' 'unsafe-inline'"
    : "style-src-elem 'self'";
  const styleAttrDirective = allowUnsafeInlineStyle
    ? "style-src-attr 'unsafe-inline'"
    : "style-src-attr 'none'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self'",
    styleElemDirective,
    styleAttrDirective,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: http:`,
    `connect-src ${connectSources.join(' ')}`,
    'upgrade-insecure-requests',
  ].join('; ');
}

function attachSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  response.headers.set('x-nonce', nonce);
  return response;
}

function nextWithSecurityHeaders(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  return attachSecurityHeaders(response, nonce);
}

function redirectWithSecurityHeaders(url: URL, nonce: string): NextResponse {
  return attachSecurityHeaders(NextResponse.redirect(url), nonce);
}

function redirectToLogin(request: NextRequest, loginPath: '/admin/login' | '/teacher/login', nonce: string) {
  const url = request.nextUrl.clone();
  url.pathname = loginPath;
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  url.searchParams.set('reason', 'auth-required');
  return redirectWithSecurityHeaders(url, nonce);
}

function toBase64(input: string): string {
  const encoded = btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return encoded;
}

function fromBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

async function signBase64UrlPayload(payloadBase64Url: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadBase64Url));
  const bytes = Array.from(new Uint8Array(signature)).map((value) => String.fromCharCode(value)).join('');
  return toBase64(bytes);
}

async function parseSignedSessionToken(
  token: string | undefined,
  expectedRole: 'admin' | 'teacher' | 'student' | 'developer' | 'parent',
  sessionSecret: string
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;
  if (!sessionSecret) return null;
  const expectedSignature = await signBase64UrlPayload(encodedPayload, sessionSecret);
  if (expectedSignature !== providedSignature) return null;
  const decodedRaw = fromBase64Url(encodedPayload);
  if (!decodedRaw) return null;
  try {
    const parsed = JSON.parse(decodedRaw) as SessionPayload;
    if (!parsed || parsed.role !== expectedRole) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
    if (expectedRole === 'teacher' && (!parsed.teacherId || typeof parsed.teacherId !== 'string')) return null;
    if (
      expectedRole === 'student' &&
      (!parsed.studentId ||
        typeof parsed.studentId !== 'string' ||
        !parsed.studentName ||
        typeof parsed.studentName !== 'string' ||
        !parsed.rollCode ||
        typeof parsed.rollCode !== 'string' ||
        (parsed.classLevel !== 10 && parsed.classLevel !== 12) ||
        (parsed.mustChangePassword !== undefined && typeof parsed.mustChangePassword !== 'boolean'))
    ) {
      return null;
    }
    if (
      expectedRole === 'parent' &&
      (!parsed.studentId || typeof parsed.studentId !== 'string' ||
       !parsed.phone || typeof parsed.phone !== 'string')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  const singleEnvMode = process.env.SINGLE_ENV_MODE === '1';
  const method = request.method.toUpperCase();
  const isProtectedApiMutation =
    pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (isProtectedApiMutation && !csrfAllowedForMutation(request)) {
    return attachSecurityHeaders(
      NextResponse.json(
        {
          ok: false,
          errorCode: 'csrf-validation-failed',
          message: 'CSRF validation failed for mutation request.',
        },
        { status: 403 }
      ),
      nonce
    );
  }
  if (pathname === '/helper' || pathname.startsWith('/helper/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/chapters';
    if (pathname.startsWith('/helper/class-10')) {
      url.searchParams.set('class', '10');
    }
    if (pathname.startsWith('/helper/class-12')) {
      url.searchParams.set('class', '12');
    }
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname.startsWith('/api/')) {
    const isAdminApi = pathname.startsWith('/api/admin');
    const isDeveloperApi = pathname.startsWith('/api/developer');
    const isTeacherApi = pathname.startsWith('/api/teacher');
    const isStudentApi = pathname.startsWith('/api/student');
    const isParentApi = pathname.startsWith('/api/parent');
    const isExamApi = pathname.startsWith('/api/exam/session') || pathname.startsWith('/api/mock-exam');
    const isRoleSwitchApi = pathname === '/api/auth/role/switch';
    const isInteractiveAiApi = isInteractiveApiRoute(pathname);
    const isPublicTeacherRead = isTeacherApi && pathname === '/api/teacher' && (method === 'GET' || method === 'HEAD');
    const isAdminLoginApi = pathname === '/api/admin/session/bootstrap';
    const isTeacherLoginApi = pathname === '/api/teacher/session/login';
    const isStudentLoginApi = pathname === '/api/student/session/login';
    const isDeveloperLoginApi = pathname === '/api/developer/session/login';
    const isParentLoginApi = pathname === '/api/parent/session/login';

    const requiresAdmin = isAdminApi && !isAdminLoginApi;
    const requiresDeveloperLike = isDeveloperApi && !isDeveloperLoginApi;
    const requiresTeacher =
      isTeacherApi &&
      !isPublicTeacherRead &&
      !isTeacherLoginApi &&
      method !== 'GET' &&
      method !== 'HEAD';
    const requiresStudent = (isStudentApi && !isStudentLoginApi) || isExamApi;
    const requiresParent = isParentApi && !isParentLoginApi;
    const requiresAnySession = isRoleSwitchApi || isInteractiveAiApi;

    if (
      !requiresAdmin &&
      !requiresDeveloperLike &&
      !requiresTeacher &&
      !requiresStudent &&
      !requiresParent &&
      !requiresAnySession
    ) {
      return nextWithSecurityHeaders(request, nonce);
    }

    const sessionSecret = resolveSessionSecret();
    const adminToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const teacherToken = request.cookies.get(TEACHER_SESSION_COOKIE)?.value;
    const studentToken = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
    const developerToken = request.cookies.get(DEVELOPER_SESSION_COOKIE)?.value;
    const parentToken = request.cookies.get(PARENT_SESSION_COOKIE)?.value;

    const [adminSession, teacherSession, studentSession, developerSession, parentSession] = await Promise.all([
      parseSignedSessionToken(adminToken, 'admin', sessionSecret),
      parseSignedSessionToken(teacherToken, 'teacher', sessionSecret),
      parseSignedSessionToken(studentToken, 'student', sessionSecret),
      parseSignedSessionToken(developerToken, 'developer', sessionSecret),
      parseSignedSessionToken(parentToken, 'parent', sessionSecret),
    ]);
    const hasAdminSession = !!adminSession;
    const hasTeacherSession = !!teacherSession;
    const hasStudentSession = !!studentSession;
    const hasParentSession = !!parentSession;
    const hasDeveloperLikeSession = !!developerSession || (singleEnvMode && hasAdminSession);

    const unauthorizedApiResponse = attachSecurityHeaders(NextResponse.json(
      {
        ok: false,
        errorCode: 'unauthorized',
        message: 'Unauthorized API access.',
      },
      { status: 401 }
    ), nonce);

    if (requiresAdmin && !hasAdminSession) return unauthorizedApiResponse;
    if (requiresDeveloperLike && !hasDeveloperLikeSession) return unauthorizedApiResponse;
    if (requiresTeacher && !hasTeacherSession) return unauthorizedApiResponse;
    if (requiresStudent && !hasStudentSession) return unauthorizedApiResponse;
    if (requiresParent && !hasParentSession) return unauthorizedApiResponse;
    if (
      requiresAnySession &&
      !hasAdminSession &&
      !hasTeacherSession &&
      !hasStudentSession &&
      !hasParentSession &&
      !hasDeveloperLikeSession
    ) {
      return unauthorizedApiResponse;
    }

    return nextWithSecurityHeaders(request, nonce);
  }
  const sessionSecret = resolveSessionSecret();

  // ── Selective cookie verification ─────────────────────────────────────
  // Determine which session types are actually needed for this path to
  // avoid running 5 parallel HMAC verifications on every page request.
  const needsAdmin =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/developer') ||
    pathname.startsWith('/api-lab');
  const needsDeveloper =
    pathname.startsWith('/developer') ||
    pathname === '/sentry-example-page' ||
    pathname.startsWith('/api-lab') ||
    (singleEnvMode && pathname.startsWith('/admin'));
  const needsTeacher = pathname.startsWith('/teacher');
  const needsStudent =
    pathname.startsWith('/student') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/bookmarks') ||
    pathname.startsWith('/mock-exam') ||
    pathname.startsWith('/exam/assignment/');
  const needsParent = pathname.startsWith('/parent');

  const adminToken = needsAdmin ? request.cookies.get(ADMIN_SESSION_COOKIE)?.value : undefined;
  const teacherToken = needsTeacher ? request.cookies.get(TEACHER_SESSION_COOKIE)?.value : undefined;
  const studentToken = needsStudent ? request.cookies.get(STUDENT_SESSION_COOKIE)?.value : undefined;
  const developerToken = needsDeveloper ? request.cookies.get(DEVELOPER_SESSION_COOKIE)?.value : undefined;
  const parentToken = needsParent ? request.cookies.get(PARENT_SESSION_COOKIE)?.value : undefined;

  // For login pages — verify all relevant cookies to detect "already logged in"
  const isLoginPage =
    pathname === '/admin/login' ||
    pathname === '/teacher/login' ||
    pathname === '/student/login' ||
    pathname === '/developer/login' ||
    pathname === '/parent/login';

  const effectiveAdminToken = isLoginPage ? request.cookies.get(ADMIN_SESSION_COOKIE)?.value : adminToken;
  const effectiveTeacherToken = isLoginPage ? request.cookies.get(TEACHER_SESSION_COOKIE)?.value : teacherToken;
  const effectiveStudentToken = isLoginPage ? request.cookies.get(STUDENT_SESSION_COOKIE)?.value : studentToken;
  const effectiveDeveloperToken = isLoginPage ? request.cookies.get(DEVELOPER_SESSION_COOKIE)?.value : developerToken;
  const effectiveParentToken = isLoginPage ? request.cookies.get(PARENT_SESSION_COOKIE)?.value : parentToken;

  const [legacyAdminSession, legacyTeacherSession, legacyStudentSession, legacyDeveloperSession, legacyParentSession] =
    await Promise.all([
      parseSignedSessionToken(effectiveAdminToken, 'admin', sessionSecret),
      parseSignedSessionToken(effectiveTeacherToken, 'teacher', sessionSecret),
      parseSignedSessionToken(effectiveStudentToken, 'student', sessionSecret),
      parseSignedSessionToken(effectiveDeveloperToken, 'developer', sessionSecret),
      parseSignedSessionToken(effectiveParentToken, 'parent', sessionSecret),
    ]);

  const legacyHasAdminSession = !!legacyAdminSession;
  const legacyHasTeacherSession = !!legacyTeacherSession;
  const legacyHasStudentSession = !!legacyStudentSession;
  const legacyHasDeveloperSession = !!legacyDeveloperSession;
  const hasParentSession = !!legacyParentSession;
  const studentMustChangePassword = legacyStudentSession?.mustChangePassword === true;
  const hasDeveloperSession = legacyHasDeveloperSession;
  const hasAdminSession = legacyHasAdminSession;
  const hasTeacherSession = legacyHasTeacherSession;
  const hasStudentSession = legacyHasStudentSession;
  const hasDeveloperLikeSession = hasDeveloperSession || (singleEnvMode && hasAdminSession);

  if (pathname.startsWith('/teacher/assignment/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/teacher/assignment/', '/practice/assignment/');
    return redirectWithSecurityHeaders(url, nonce);
  }

  if (pathname === '/admin/login' && hasAdminSession) {
    const url = request.nextUrl.clone();
    const nextTarget = request.nextUrl.searchParams.get('next')?.trim() || '';
    const shouldLandDeveloper = hasDeveloperSession || (singleEnvMode && nextTarget.startsWith('/developer'));
    url.pathname = shouldLandDeveloper ? '/developer' : '/admin';
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname === '/teacher/login' && hasTeacherSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/teacher';
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname === '/student/login' && hasStudentSession && request.nextUrl.searchParams.get('force') !== '1') {
    const url = request.nextUrl.clone();
    url.pathname = studentMustChangePassword ? '/student/first-login' : '/dashboard';
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname === '/student/first-login') {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', '/student/first-login');
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
    if (!studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname === '/parent/login' && hasParentSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/parent';
    return redirectWithSecurityHeaders(url, nonce);
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!hasAdminSession) return redirectToLogin(request, '/admin/login', nonce);
  }
  if (pathname === '/developer/login' && hasDeveloperLikeSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/developer';
    url.search = '';
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname.startsWith('/developer') && pathname !== '/developer/login') {
    if (!hasDeveloperLikeSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/developer/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname === '/sentry-example-page' && !hasDeveloperLikeSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/developer/login';
    url.searchParams.set('next', pathname);
    return redirectWithSecurityHeaders(url, nonce);
  }
  if (pathname.startsWith('/teacher') && pathname !== '/teacher/login') {
    if (!hasTeacherSession) return redirectToLogin(request, '/teacher/login', nonce);
  }
  if (pathname.startsWith('/student') && pathname !== '/student/login' && pathname !== '/student/first-login') {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname.startsWith('/mock-exam')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname.startsWith('/parent') && pathname !== '/parent/login') {
    if (!hasParentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/parent/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/bookmarks')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname.startsWith('/api-lab')) {
    if (!hasAdminSession && !hasDeveloperLikeSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  if (pathname.startsWith('/exam/assignment/')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return redirectWithSecurityHeaders(url, nonce);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return redirectWithSecurityHeaders(url, nonce);
    }
  }
  return nextWithSecurityHeaders(request, nonce);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon-16.png|favicon-32.png|icon.png|og-image.png|manifest.json|robots.txt|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|map|txt|xml)$).*)',
  ],
};
