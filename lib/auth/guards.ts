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
import { getStudentById, getTeacherSessionById } from '@/lib/teacher-admin-db';
import { type PlatformRole } from '@/lib/auth/roles';
import {
  decodeJwtPayload,
  isAccessTokenExpired,
  refreshSupabaseSession,
  SUPABASE_ACCESS_COOKIE,
  SUPABASE_REFRESH_COOKIE,
} from '@/lib/auth/supabase-auth';
import { resolveRoleContextByAuthUserId, type PlatformRoleContext } from '@/lib/platform-rbac-db';

export interface RequestAuthContext {
  role: Exclude<PlatformRole, 'anonymous'>;
  authUserId?: string;
  schoolId?: string;
  schoolCode?: string;
  profileId?: string;
  classLevel?: 10 | 12;
  section?: string;
  availableRoles?: Array<Exclude<PlatformRole, 'anonymous'>>;
  issuedAt?: number;
  expiresAt?: number;
}

function toRequestAuthContext(
  roleContext: PlatformRoleContext,
  tokenPayload?: { iat?: number; exp?: number }
): RequestAuthContext {
  return {
    role: roleContext.role,
    authUserId: roleContext.authUserId,
    schoolId: roleContext.schoolId,
    schoolCode: roleContext.schoolCode,
    profileId: roleContext.profileId,
    classLevel: roleContext.classLevel,
    section: roleContext.section,
    availableRoles: roleContext.availableRoles,
    issuedAt: typeof tokenPayload?.iat === 'number' ? tokenPayload.iat * 1000 : undefined,
    expiresAt: typeof tokenPayload?.exp === 'number' ? tokenPayload.exp * 1000 : undefined,
  };
}

async function resolveSupabaseContext(): Promise<RequestAuthContext | null> {
  const cookieStore = cookies();
  let accessToken = cookieStore.get(SUPABASE_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(SUPABASE_REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) return null;

  if ((!accessToken || isAccessTokenExpired(accessToken)) && refreshToken) {
    try {
      const refreshed = await refreshSupabaseSession(refreshToken);
      accessToken = refreshed.access_token;
    } catch {
      accessToken = undefined;
    }
  }

  const payload = decodeJwtPayload(accessToken);
  if (!payload?.sub) return null;
  const roleContext = await resolveRoleContextByAuthUserId(payload.sub);
  if (!roleContext) return null;
  return toRequestAuthContext(roleContext, { iat: payload.iat, exp: payload.exp });
}

function resolveLegacyContext(): RequestAuthContext | null {
  const cookieStore = cookies();
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const teacherToken = cookieStore.get(TEACHER_SESSION_COOKIE)?.value;
  const studentToken = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  const admin = parseAdminSession(adminToken);
  if (admin) {
    return {
      role: 'admin',
      issuedAt: admin.issuedAt,
      expiresAt: admin.expiresAt,
      availableRoles: ['admin'],
    };
  }

  const teacher = parseTeacherSession(teacherToken);
  if (teacher) {
    return {
      role: 'teacher',
      profileId: teacher.teacherId,
      issuedAt: teacher.issuedAt,
      expiresAt: teacher.expiresAt,
      availableRoles: ['teacher'],
    };
  }

  const student = parseStudentSession(studentToken);
  if (student) {
    return {
      role: 'student',
      profileId: student.studentId,
      issuedAt: student.issuedAt,
      expiresAt: student.expiresAt,
      availableRoles: ['student'],
    };
  }
  return null;
}

export async function getRequestAuthContext(): Promise<RequestAuthContext | null> {
  const supabaseContext = await resolveSupabaseContext();
  if (supabaseContext) return supabaseContext;
  return resolveLegacyContext();
}

export async function requireRequestRole(
  allowedRoles: Array<Exclude<PlatformRole, 'anonymous'>>
): Promise<RequestAuthContext | null> {
  const context = await getRequestAuthContext();
  if (!context) return null;
  if (allowedRoles.includes(context.role)) return context;
  return null;
}

export async function getAdminSessionFromRequestCookies(): Promise<{
  issuedAt?: number;
  expiresAt?: number;
  schoolId?: string;
  authUserId?: string;
  role: 'admin' | 'developer';
} | null> {
  const context = await requireRequestRole(['admin', 'developer']);
  if (!context || (context.role !== 'admin' && context.role !== 'developer')) return null;
  return {
    role: context.role,
    issuedAt: context.issuedAt,
    expiresAt: context.expiresAt,
    schoolId: context.schoolId,
    authUserId: context.authUserId,
  };
}

export async function getTeacherSessionFromRequestCookies() {
  const context = await requireRequestRole(['teacher']);
  if (!context?.profileId) {
    const token = cookies().get(TEACHER_SESSION_COOKIE)?.value;
    const parsed = parseTeacherSession(token);
    if (!parsed) return null;
    return getTeacherSessionById(parsed.teacherId);
  }
  return getTeacherSessionById(context.profileId);
}

export async function getStudentSessionFromRequestCookies() {
  const context = await requireRequestRole(['student']);
  if (context?.profileId && context.role === 'student') {
    const token = cookies().get(STUDENT_SESSION_COOKIE)?.value;
    const parsed = parseStudentSession(token);
    if (parsed) return parsed;
    const student = await getStudentById(context.profileId);
    if (!student) return null;
    return {
      studentId: student.id,
      studentName: student.name,
      rollCode: student.rollCode,
      classLevel: student.classLevel,
      section: student.section,
      role: 'student' as const,
      issuedAt: context.issuedAt || Date.now(),
      expiresAt: context.expiresAt || Date.now() + 60 * 60 * 1000,
    };
  }
  const token = cookies().get(STUDENT_SESSION_COOKIE)?.value;
  const parsed = parseStudentSession(token);
  if (!parsed) return null;
  return parsed;
}

export async function getDeveloperSessionFromRequestCookies(): Promise<{
  authUserId?: string;
  issuedAt?: number;
  expiresAt?: number;
} | null> {
  const context = await requireRequestRole(['developer']);
  if (!context || context.role !== 'developer') return null;
  return {
    authUserId: context.authUserId,
    issuedAt: context.issuedAt,
    expiresAt: context.expiresAt,
  };
}

export function unauthorizedJson(message = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
