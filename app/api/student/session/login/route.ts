import { NextResponse } from 'next/server';
import { attachStudentSessionCookie, createStudentSessionToken } from '@/lib/auth/session';
import { authenticateStudent, getStudentById } from '@/lib/teacher-admin-db';
import { findStudentAuthIdentity } from '@/lib/platform-rbac-db';
import { attachSupabaseSessionCookies, signInWithPassword } from '@/lib/auth/supabase-auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const schoolCode = typeof body?.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const classLevel = Number(body?.classLevel);
  const section = typeof body?.section === 'string' ? body.section.trim() : '';
  const batch = typeof body?.batch === 'string' ? body.batch.trim() : '';
  const rollNo = typeof body?.rollNo === 'string' ? body.rollNo.trim().toUpperCase() : '';
  const rollCode =
    typeof body?.rollCode === 'string'
      ? body.rollCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80)
      : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim().slice(0, 64) : '';
  const password = typeof body?.password === 'string' ? body.password.trim().slice(0, 128) : pin;

  const useCompositeLogin =
    !!schoolCode &&
    (classLevel === 10 || classLevel === 12) &&
    !!rollNo;

  if (useCompositeLogin) {
    const identity = await findStudentAuthIdentity({
      schoolCode,
      classLevel: classLevel as 10 | 12,
      section: section || undefined,
      batch: batch || undefined,
      rollNo,
    });
    if (!identity?.authEmail) {
      return NextResponse.json({ error: 'Student roster identity not found for this school/class/section.' }, { status: 404 });
    }
    try {
      const authSession = await signInWithPassword({
        email: identity.authEmail,
        password,
      });
      const student = await getStudentById(identity.studentId);
      if (!student) {
        return NextResponse.json({ error: 'Student profile not found.' }, { status: 404 });
      }
      const payload = {
        studentId: student.id,
        studentName: student.name,
        rollCode: student.rollCode,
        classLevel: student.classLevel,
        section: student.section,
      };
      const response = NextResponse.json({
        ...payload,
        role: 'student',
        auth: 'supabase',
      });
      attachSupabaseSessionCookies(response, authSession, 'student');
      attachStudentSessionCookie(response, createStudentSessionToken(payload));
      return response;
    } catch {
      return NextResponse.json({ error: 'Invalid student credentials.' }, { status: 401 });
    }
  }

  if (!rollCode) {
    return NextResponse.json(
      { error: 'Required: { rollCode, pin? }' },
      { status: 400 }
    );
  }

  const session = await authenticateStudent(rollCode, pin || undefined);
  if (!session) {
    return NextResponse.json({ error: 'Invalid roll code or PIN.' }, { status: 401 });
  }

  const response = NextResponse.json(session);
  attachStudentSessionCookie(
    response,
    createStudentSessionToken({
      studentId: session.studentId,
      studentName: session.studentName,
      rollCode: session.rollCode,
      classLevel: session.classLevel,
      section: session.section,
    })
  );
  return response;
}
