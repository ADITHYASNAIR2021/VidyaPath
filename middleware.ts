import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SESSION_COOKIE = 'vp_admin_session';
const TEACHER_SESSION_COOKIE = 'vp_teacher_session';
const STUDENT_SESSION_COOKIE = 'vp_student_session';
const DEFAULT_SESSION_SECRET = 'vidyapath-dev-session-secret';

interface SessionPayload {
  role: 'admin' | 'teacher' | 'student';
  teacherId?: string;
  studentId?: string;
  studentName?: string;
  rollCode?: string;
  classLevel?: number;
  section?: string;
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

async function isValidSignedSessionToken(
  token: string | undefined,
  expectedRole: 'admin' | 'teacher' | 'student'
): Promise<boolean> {
  if (!token) return false;
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return false;
  const secret = (
    process.env.SESSION_SIGNING_SECRET ||
    process.env.ADMIN_PORTAL_KEY ||
    process.env.TEACHER_PORTAL_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    DEFAULT_SESSION_SECRET
  ).trim();
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
  const [hasAdminSession, hasTeacherSession, hasStudentSession] = await Promise.all([
    isValidSignedSessionToken(adminToken, 'admin'),
    isValidSignedSessionToken(teacherToken, 'teacher'),
    isValidSignedSessionToken(studentToken, 'student'),
  ]);

  if (pathname.startsWith('/teacher/assignment/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/teacher/assignment/', '/practice/assignment/');
    return NextResponse.redirect(url);
  }

  if (pathname === '/admin/login' && hasAdminSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
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

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!hasAdminSession) return redirectToLogin(request, '/admin/login');
  }
  if (pathname.startsWith('/teacher') && pathname !== '/teacher/login') {
    if (!hasTeacherSession) return redirectToLogin(request, '/teacher/login');
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
  matcher: ['/admin/:path*', '/teacher/:path*', '/student/:path*', '/exam/assignment/:path*', '/helper/:path*'],
};
