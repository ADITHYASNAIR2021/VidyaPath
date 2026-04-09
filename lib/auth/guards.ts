import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  STUDENT_SESSION_COOKIE,
  TEACHER_SESSION_COOKIE,
  parseAdminSession,
  parseStudentSession,
  parseTeacherSession,
} from '@/lib/auth/session';
import { getTeacherSessionById } from '@/lib/teacher-admin-db';

export function getAdminSessionFromRequestCookies(): { issuedAt: number; expiresAt: number } | null {
  const token = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const parsed = parseAdminSession(token);
  if (!parsed) return null;
  return { issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt };
}

export async function getTeacherSessionFromRequestCookies() {
  const token = cookies().get(TEACHER_SESSION_COOKIE)?.value;
  const parsed = parseTeacherSession(token);
  if (!parsed) return null;
  return getTeacherSessionById(parsed.teacherId);
}

export function getStudentSessionFromRequestCookies() {
  const token = cookies().get(STUDENT_SESSION_COOKIE)?.value;
  const parsed = parseStudentSession(token);
  if (!parsed) return null;
  return parsed;
}

export function unauthorizedJson(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
