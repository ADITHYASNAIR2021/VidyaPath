import { NextResponse } from 'next/server';
import { attachTeacherSessionCookie, createTeacherSessionToken } from '@/lib/auth/session';
import { authenticateTeacher, getTeacherSessionById } from '@/lib/teacher-admin-db';
import { findTeacherAuthIdentity, getSchoolByCode } from '@/lib/platform-rbac-db';
import { attachSupabaseSessionCookies, signInWithPassword } from '@/lib/auth/supabase-auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const schoolCode = typeof body?.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : identifier;
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  const password = typeof body?.password === 'string' ? body.password.trim() : pin;
  if (!phone || !password) {
    return NextResponse.json({ error: 'identifier and password are required.' }, { status: 400 });
  }

  if (schoolCode) {
    const school = await getSchoolByCode(schoolCode);
    if (!school || school.status !== 'active') {
      return NextResponse.json({ error: 'School code not found or inactive.' }, { status: 404 });
    }
    const authIdentity = await findTeacherAuthIdentity({
      schoolCode,
      identifier: phone,
    });
    if (!authIdentity?.authEmail) {
      const legacySession = await authenticateTeacher(phone, pin || password, school.id);
      if (!legacySession) {
        return NextResponse.json({ error: 'Teacher identity not found for this school.' }, { status: 404 });
      }
      const response = NextResponse.json({
        teacher: legacySession.teacher,
        effectiveScopes: legacySession.effectiveScopes,
        role: 'teacher',
        auth: 'legacy-scoped',
      });
      attachTeacherSessionCookie(response, createTeacherSessionToken(legacySession.teacher.id));
      return response;
    }
    try {
      const authSession = await signInWithPassword({
        email: authIdentity.authEmail,
        password,
      });
      const teacherSession = await getTeacherSessionById(authIdentity.teacherId, authIdentity.schoolId);
      if (!teacherSession) {
        return NextResponse.json({ error: 'Teacher profile is inactive or missing.' }, { status: 403 });
      }
      const response = NextResponse.json({
        teacher: teacherSession.teacher,
        effectiveScopes: teacherSession.effectiveScopes,
        role: 'teacher',
        auth: 'supabase',
      });
      attachSupabaseSessionCookies(response, authSession, 'teacher');
      attachTeacherSessionCookie(response, createTeacherSessionToken(teacherSession.teacher.id));
      return response;
    } catch {
      return NextResponse.json({ error: 'Invalid teacher credentials.' }, { status: 401 });
    }
  }

  const session = await authenticateTeacher(phone, pin || password);
  if (!session) {
    return NextResponse.json({ error: 'Invalid teacher credentials.' }, { status: 401 });
  }

  const response = NextResponse.json({
    teacher: session.teacher,
    effectiveScopes: session.effectiveScopes,
    role: 'teacher',
    auth: 'legacy',
  });
  attachTeacherSessionCookie(response, createTeacherSessionToken(session.teacher.id));
  return response;
}
