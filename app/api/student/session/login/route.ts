import { NextResponse } from 'next/server';
import { attachStudentSessionCookie, createStudentSessionToken } from '@/lib/auth/session';
import { authenticateStudent } from '@/lib/teacher-admin-db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rollCode =
    typeof body?.rollCode === 'string'
      ? body.rollCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80)
      : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim().slice(0, 32) : '';

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
