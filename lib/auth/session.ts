import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';

export const ADMIN_SESSION_COOKIE = 'vp_admin_session';
export const TEACHER_SESSION_COOKIE = 'vp_teacher_session';
export const STUDENT_SESSION_COOKIE = 'vp_student_session';

const DEFAULT_TTL_SECONDS = 60 * 60 * 8;

export interface AdminSession {
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
}

export interface TeacherSession {
  role: 'teacher';
  teacherId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface StudentSession {
  role: 'student';
  studentId: string;
  studentName: string;
  rollCode: string;
  classLevel: 10 | 12;
  section?: string;
  issuedAt: number;
  expiresAt: number;
}

type SessionPayload = AdminSession | TeacherSession | StudentSession;

function getSessionSecret(): string {
  const fromEnv =
    process.env.SESSION_SIGNING_SECRET?.trim() ||
    process.env.ADMIN_PORTAL_KEY?.trim() ||
    process.env.TEACHER_PORTAL_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  return fromEnv || 'vidyapath-dev-session-secret';
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signRaw(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update(raw).digest('base64url');
}

function issueToken(payload: SessionPayload): string {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signRaw(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = signRaw(encoded);
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(sig);
  if (expectedBuf.length !== givenBuf.length || !timingSafeEqual(expectedBuf, givenBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as SessionPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
    if (parsed.role === 'admin') {
      return parsed;
    }
    if (parsed.role === 'teacher' && typeof parsed.teacherId === 'string' && parsed.teacherId.trim()) {
      return parsed;
    }
    if (
      parsed.role === 'student' &&
      typeof parsed.studentId === 'string' &&
      parsed.studentId.trim() &&
      typeof parsed.studentName === 'string' &&
      parsed.studentName.trim() &&
      typeof parsed.rollCode === 'string' &&
      parsed.rollCode.trim() &&
      (parsed.classLevel === 10 || parsed.classLevel === 12)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function createAdminSessionToken(ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const issuedAt = Date.now();
  return issueToken({
    role: 'admin',
    issuedAt,
    expiresAt: issuedAt + ttlSeconds * 1000,
  });
}

export function createTeacherSessionToken(teacherId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const issuedAt = Date.now();
  return issueToken({
    role: 'teacher',
    teacherId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds * 1000,
  });
}

export function createStudentSessionToken(
  student: {
    studentId: string;
    studentName: string;
    rollCode: string;
    classLevel: 10 | 12;
    section?: string;
  },
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const issuedAt = Date.now();
  return issueToken({
    role: 'student',
    studentId: student.studentId,
    studentName: student.studentName,
    rollCode: student.rollCode,
    classLevel: student.classLevel,
    section: student.section,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds * 1000,
  });
}

export function parseAdminSession(token?: string | null): AdminSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export function parseTeacherSession(token?: string | null): TeacherSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'teacher') return null;
  return payload;
}

export function parseStudentSession(token?: string | null): StudentSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'student') return null;
  return payload;
}

export function attachAdminSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function attachTeacherSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: TEACHER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function attachStudentSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: STUDENT_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function clearAdminSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

export function clearTeacherSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: TEACHER_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

export function clearStudentSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: STUDENT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}
