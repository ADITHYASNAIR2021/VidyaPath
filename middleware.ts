import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { csrfAllowedForMutation } from '@/lib/security/csrf';

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


function redirectToLogin(request: NextRequest, loginPath: '/admin/login' | '/teacher/login') {
  const url = request.nextUrl.clone();
  url.pathname = loginPath;
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  url.searchParams.set('reason', 'auth-required');
  return NextResponse.redirect(url);
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const singleEnvMode = process.env.SINGLE_ENV_MODE === '1';
  const isProtectedApiMutation =
    pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
  if (isProtectedApiMutation && !csrfAllowedForMutation(request)) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'csrf-validation-failed',
        message: 'CSRF validation failed for mutation request.',
      },
      { status: 403 }
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
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
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
    return NextResponse.redirect(url);
  }

  if (pathname === '/admin/login' && hasAdminSession) {
    const url = request.nextUrl.clone();
    const nextTarget = request.nextUrl.searchParams.get('next')?.trim() || '';
    const shouldLandDeveloper = hasDeveloperSession || (singleEnvMode && nextTarget.startsWith('/developer'));
    url.pathname = shouldLandDeveloper ? '/developer' : '/admin';
    return NextResponse.redirect(url);
  }
  if (pathname === '/teacher/login' && hasTeacherSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/teacher';
    return NextResponse.redirect(url);
  }
  if (pathname === '/student/login' && hasStudentSession && request.nextUrl.searchParams.get('force') !== '1') {
    const url = request.nextUrl.clone();
    url.pathname = studentMustChangePassword ? '/student/first-login' : '/dashboard';
    return NextResponse.redirect(url);
  }
  if (pathname === '/student/first-login') {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', '/student/first-login');
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
    if (!studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }
  if (pathname === '/parent/login' && hasParentSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/parent';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!hasAdminSession) return redirectToLogin(request, '/admin/login');
  }
  if (pathname === '/developer/login' && hasDeveloperLikeSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/developer';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith('/developer') && pathname !== '/developer/login') {
    if (!hasDeveloperLikeSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/developer/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/teacher') && pathname !== '/teacher/login') {
    if (!hasTeacherSession) return redirectToLogin(request, '/teacher/login');
  }
  if (pathname.startsWith('/student') && pathname !== '/student/login' && pathname !== '/student/first-login') {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/mock-exam')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/parent') && pathname !== '/parent/login') {
    if (!hasParentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/parent/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/bookmarks')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/api-lab')) {
    if (!hasAdminSession && !hasDeveloperLikeSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
  }
  if (pathname.startsWith('/exam/assignment/')) {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
      return NextResponse.redirect(url);
    }
    if (studentMustChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/first-login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/admin/:path*',
    '/teacher/:path*',
    '/student/:path*',
    '/parent/:path*',
    '/developer/:path*',
    '/dashboard/:path*',
    '/bookmarks/:path*',
    '/mock-exam/:path*',
    '/api-lab/:path*',
    '/exam/assignment/:path*',
    '/helper/:path*',
  ],
};
