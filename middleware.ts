import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { csrfAllowedForMutation } from '@/lib/security/csrf';

const ADMIN_SESSION_COOKIE = 'vp_admin_session';
const TEACHER_SESSION_COOKIE = 'vp_teacher_session';
const STUDENT_SESSION_COOKIE = 'vp_student_session';
const DEVELOPER_SESSION_COOKIE = 'vp_developer_session';
const PARENT_SESSION_COOKIE = 'vp_parent_session';
const SUPABASE_ACCESS_COOKIE = 'vp_sb_access_token';
const SUPABASE_REFRESH_COOKIE = 'vp_sb_refresh_token';
const SUPABASE_ROLE_HINT_COOKIE = 'vp_role_hint';
// AI API routes — require any authenticated session (student / teacher / admin / developer)
const AUTH_REQUIRED_AI_API_PREFIXES = [
  '/api/ai-tutor',
  '/api/generate-quiz',
  '/api/generate-flashcards',
  '/api/revision-plan',
  '/api/paper-evaluate',
  '/api/image-solve',
  '/api/chapter-pack',
  '/api/chapter-drill',
  '/api/chapter-diagnose',
  '/api/chapter-remediate',
  '/api/adaptive-test',
  '/api/context-pack',
];

function resolveSessionSecret(): string {
  const explicit = (process.env.SESSION_SIGNING_SECRET || '').trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === 'production') return '';
  return (
    process.env.ADMIN_PORTAL_KEY ||
    process.env.TEACHER_PORTAL_KEY ||
    'vidyapath-dev-session-secret'
  ).trim();
}

interface SessionPayload {
  role: 'admin' | 'teacher' | 'student' | 'developer';
  teacherId?: string;
  studentId?: string;
  studentName?: string;
  rollCode?: string;
  classLevel?: number;
  section?: string;
  username?: string;
  expiresAt: number;
}

function parseSupabaseRoleHint(value: string | undefined): 'student' | 'teacher' | 'admin' | 'developer' | null {
  if (value === 'student' || value === 'teacher' || value === 'admin' || value === 'developer') return value;
  return null;
}

function decodeJwtPayload(token: string | undefined): { exp?: number } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { exp?: number };
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function hasValidSupabaseSession(accessToken: string | undefined, refreshToken: string | undefined): boolean {
  if (!accessToken && !refreshToken) return false;
  if (!accessToken && refreshToken) return true;
  const payload = decodeJwtPayload(accessToken);
  if (!payload || typeof payload.exp !== 'number') return !!refreshToken;
  return payload.exp > Math.floor(Date.now() / 1000);
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

async function isValidSignedSessionToken(
  token: string | undefined,
  expectedRole: 'admin' | 'teacher' | 'student' | 'developer'
): Promise<boolean> {
  if (!token) return false;
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return false;
  const secret = resolveSessionSecret();
  if (!secret) return false;
  const expectedSignature = await signBase64UrlPayload(encodedPayload, secret);
  if (expectedSignature !== providedSignature) return false;
  const decodedRaw = fromBase64Url(encodedPayload);
  if (!decodedRaw) return false;
  try {
    const parsed = JSON.parse(decodedRaw) as SessionPayload;
    if (!parsed || parsed.role !== expectedRole) return false;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return false;
    if (expectedRole === 'teacher' && (!parsed.teacherId || typeof parsed.teacherId !== 'string')) return false;
    if (
      expectedRole === 'student' &&
      (!parsed.studentId ||
        typeof parsed.studentId !== 'string' ||
        !parsed.studentName ||
        typeof parsed.studentName !== 'string' ||
        !parsed.rollCode ||
        typeof parsed.rollCode !== 'string' ||
        (parsed.classLevel !== 10 && parsed.classLevel !== 12))
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const singleEnvMode = process.env.SINGLE_ENV_MODE === '1';
  const isProtectedApiMutation =
    (pathname.startsWith('/api/admin') ||
      pathname.startsWith('/api/teacher') ||
      pathname.startsWith('/api/student') ||
      pathname.startsWith('/api/mock-exam') ||
      pathname.startsWith('/api/parent') ||
      pathname.startsWith('/api/developer') ||
      pathname.startsWith('/api/integrations/sheets') ||
      pathname.startsWith('/api/exam/session')) &&
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
  const adminToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const teacherToken = request.cookies.get(TEACHER_SESSION_COOKIE)?.value;
  const studentToken = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
  const developerToken = request.cookies.get(DEVELOPER_SESSION_COOKIE)?.value;
  const parentToken = request.cookies.get(PARENT_SESSION_COOKIE)?.value;
  const supabaseAccess = request.cookies.get(SUPABASE_ACCESS_COOKIE)?.value;
  const supabaseRefresh = request.cookies.get(SUPABASE_REFRESH_COOKIE)?.value;
  const supabaseRoleHint = parseSupabaseRoleHint(request.cookies.get(SUPABASE_ROLE_HINT_COOKIE)?.value);
  const hasSupabaseSession = hasValidSupabaseSession(supabaseAccess, supabaseRefresh);
  const [legacyHasAdminSession, legacyHasTeacherSession, legacyHasStudentSession, legacyHasDeveloperSession] = await Promise.all([
    isValidSignedSessionToken(adminToken, 'admin'),
    isValidSignedSessionToken(teacherToken, 'teacher'),
    isValidSignedSessionToken(studentToken, 'student'),
    isValidSignedSessionToken(developerToken, 'developer'),
  ]);
  const hasDeveloperSession = legacyHasDeveloperSession || (hasSupabaseSession && supabaseRoleHint === 'developer');
  const hasAdminSession = legacyHasAdminSession || (hasSupabaseSession && (supabaseRoleHint === 'admin' || supabaseRoleHint === 'developer'));
  const hasTeacherSession = legacyHasTeacherSession || (hasSupabaseSession && supabaseRoleHint === 'teacher');
  const hasStudentSession = legacyHasStudentSession || (hasSupabaseSession && supabaseRoleHint === 'student');
  const hasParentSession = !!parentToken;
  const hasDeveloperLikeSession = hasDeveloperSession || (singleEnvMode && hasAdminSession);
  const isAuthRequiredAiApi = AUTH_REQUIRED_AI_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const hasAnySession = hasStudentSession || hasTeacherSession || hasAdminSession || hasDeveloperSession;

  if (isAuthRequiredAiApi && !hasAnySession) {
    return NextResponse.json(
      {
        ok: false,
        errorCode: 'auth-required',
        message: 'Please login to use AI features.',
      },
      { status: 401 }
    );
  }

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
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
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
  if (pathname.startsWith('/student') && pathname !== '/student/login') {
    if (!hasStudentSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/student/login';
      url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      url.searchParams.set('reason', 'auth-required');
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
