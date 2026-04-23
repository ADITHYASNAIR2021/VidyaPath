import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { normalizeAcademicStream, type AcademicStream } from '@/lib/academic-taxonomy';

export const ADMIN_SESSION_COOKIE = 'vp_admin_session';
export const TEACHER_SESSION_COOKIE = 'vp_teacher_session';
export const STUDENT_SESSION_COOKIE = 'vp_student_session';
export const DEVELOPER_SESSION_COOKIE = 'vp_developer_session';
export const ACTIVE_ROLE_COOKIE = 'vp_active_role';

const DEFAULT_TTL_SECONDS = 60 * 60 * 8;
const COOKIE_MAX_AGE_SECONDS = Math.max(
  300,
  Math.min(60 * 60 * 24 * 30, Number(process.env.SESSION_COOKIE_MAX_AGE_SECONDS) || DEFAULT_TTL_SECONDS)
);

const SESSION_COOKIE_BASE_OPTIONS = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

function setRoleSessionCookie(res: NextResponse, name: string, value: string): void {
  res.cookies.set({
    name,
    value,
    ...SESSION_COOKIE_BASE_OPTIONS,
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

function clearRoleSessionCookie(res: NextResponse, name: string): void {
  res.cookies.set({
    name,
    value: '',
    ...SESSION_COOKIE_BASE_OPTIONS,
    expires: new Date(0),
    maxAge: 0,
  });
}

export interface AdminSession {
  role: 'admin';
  issuedAt: number;
  expiresAt: number;
}

export interface DeveloperSession {
  role: 'developer';
  username: string;
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
  schoolId?: string;
  schoolCode?: string;
  batch?: string;
  mustChangePassword?: boolean;
  stream?: AcademicStream;
  enrolledSubjects?: string[];
  issuedAt: number;
  expiresAt: number;
}

export type ActivePlatformRole = 'student' | 'teacher' | 'admin' | 'developer';

type SessionPayload = AdminSession | TeacherSession | StudentSession | DeveloperSession;

function getSessionSecret(): string {
  return (process.env.SESSION_SIGNING_SECRET || '').trim();
}

export function isSessionSigningConfigured(): boolean {
  return !!getSessionSecret();
}

function requireSessionSecret(): string {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error('SESSION_SIGNING_SECRET is required.');
  }
  return secret;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signRaw(raw: string): string {
  return createHmac('sha256', requireSessionSecret()).update(raw).digest('base64url');
}

function issueToken(payload: SessionPayload): string {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signRaw(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): SessionPayload | null {
  if (!getSessionSecret()) return null;
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
    if (parsed.role === 'developer' && typeof (parsed as DeveloperSession).username === 'string') {
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
      (parsed.classLevel === 10 || parsed.classLevel === 12) &&
      (parsed.stream === undefined || !!normalizeAcademicStream(parsed.stream)) &&
      (parsed.mustChangePassword === undefined || typeof parsed.mustChangePassword === 'boolean')
    ) {
      return {
        ...parsed,
        stream: normalizeAcademicStream(parsed.stream),
      };
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

export function createDeveloperSessionToken(username: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const issuedAt = Date.now();
  return issueToken({
    role: 'developer',
    username,
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
    schoolId?: string;
    schoolCode?: string;
    batch?: string;
    mustChangePassword?: boolean;
    stream?: AcademicStream;
    enrolledSubjects?: string[];
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
    schoolId: student.schoolId,
    schoolCode: student.schoolCode,
    batch: student.batch,
    mustChangePassword: student.mustChangePassword === true,
    stream: normalizeAcademicStream(student.stream),
    enrolledSubjects: Array.isArray(student.enrolledSubjects) ? student.enrolledSubjects : undefined,
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

export function parseDeveloperSession(token?: string | null): DeveloperSession | null {
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || payload.role !== 'developer') return null;
  return payload as DeveloperSession;
}

export function parseActiveRoleHint(value?: string | null): ActivePlatformRole | null {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'student' || role === 'teacher' || role === 'admin' || role === 'developer') {
    return role;
  }
  return null;
}

export function attachAdminSessionCookie(res: NextResponse, token: string): void {
  setRoleSessionCookie(res, ADMIN_SESSION_COOKIE, token);
}

export function attachTeacherSessionCookie(res: NextResponse, token: string): void {
  setRoleSessionCookie(res, TEACHER_SESSION_COOKIE, token);
}

export function attachStudentSessionCookie(res: NextResponse, token: string): void {
  setRoleSessionCookie(res, STUDENT_SESSION_COOKIE, token);
}

export function clearAdminSessionCookie(res: NextResponse): void {
  clearRoleSessionCookie(res, ADMIN_SESSION_COOKIE);
}

export function clearTeacherSessionCookie(res: NextResponse): void {
  clearRoleSessionCookie(res, TEACHER_SESSION_COOKIE);
}

export function clearStudentSessionCookie(res: NextResponse): void {
  clearRoleSessionCookie(res, STUDENT_SESSION_COOKIE);
}

export function attachDeveloperSessionCookie(res: NextResponse, token: string): void {
  setRoleSessionCookie(res, DEVELOPER_SESSION_COOKIE, token);
}

export function attachActiveRoleCookie(res: NextResponse, role: ActivePlatformRole): void {
  setRoleSessionCookie(res, ACTIVE_ROLE_COOKIE, role);
}

export function clearDeveloperSessionCookie(res: NextResponse): void {
  clearRoleSessionCookie(res, DEVELOPER_SESSION_COOKIE);
}

export function clearActiveRoleCookie(res: NextResponse): void {
  clearRoleSessionCookie(res, ACTIVE_ROLE_COOKIE);
}

export function clearAllRoleSessionCookies(res: NextResponse): void {
  clearAdminSessionCookie(res);
  clearTeacherSessionCookie(res);
  clearStudentSessionCookie(res);
  clearDeveloperSessionCookie(res);
  clearActiveRoleCookie(res);
}
