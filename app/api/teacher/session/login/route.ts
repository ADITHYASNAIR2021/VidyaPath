import { NextResponse } from 'next/server';
import { attachTeacherSessionCookie, createTeacherSessionToken } from '@/lib/auth/session';
import { authenticateTeacher } from '@/lib/teacher-admin-db';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (!phone || !pin) {
    return NextResponse.json({ error: 'phone and pin are required.' }, { status: 400 });
  }
  const session = await authenticateTeacher(phone, pin);
  if (!session) {
    return NextResponse.json({ error: 'Invalid phone or PIN.' }, { status: 401 });
  }
  const response = NextResponse.json({
    teacher: session.teacher,
    effectiveScopes: session.effectiveScopes,
  });
  attachTeacherSessionCookie(response, createTeacherSessionToken(session.teacher.id));
  return response;
}

