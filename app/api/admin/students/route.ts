import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { createStudent, listStudents } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const url = new URL(req.url);
  const classLevelRaw = Number(url.searchParams.get('classLevel'));
  const classLevel = classLevelRaw === 10 || classLevelRaw === 12 ? classLevelRaw : undefined;
  const section = url.searchParams.get('section')?.trim() || undefined;
  const status = url.searchParams.get('status');
  const schoolId =
    adminSession.role === 'developer'
      ? (url.searchParams.get('schoolId')?.trim() || undefined)
      : adminSession.schoolId;
  const students = await listStudents({
    schoolId,
    classLevel,
    section,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  });
  return NextResponse.json({ students });
}

export async function POST(req: Request) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  try {
    await assertTeacherStorageWritable();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rollCode = typeof body.rollCode === 'string' ? body.rollCode.trim() : '';
    const rollNo = typeof body.rollNo === 'string' ? body.rollNo.trim() : '';
    const batch = typeof body.batch === 'string' ? body.batch.trim() : undefined;
    const classLevel = Number(body.classLevel);
    const section = typeof body.section === 'string' ? body.section.trim() : undefined;
    const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
    const password = typeof body.password === 'string' ? body.password.trim() : undefined;
    const schoolId = adminSession.role === 'developer'
      ? (typeof body.schoolId === 'string' ? body.schoolId.trim() : undefined)
      : adminSession.schoolId;
    if (!name || (classLevel !== 10 && classLevel !== 12)) {
      return NextResponse.json({ error: 'Required: name and classLevel(10|12).' }, { status: 400 });
    }
    if (!rollNo && !rollCode) {
      return NextResponse.json({ error: 'Provide rollNo (recommended) or rollCode.' }, { status: 400 });
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School scope missing for admin session.' }, { status: 400 });
    }

    const student = await createStudent({
      schoolId,
      name,
      rollCode: rollCode || undefined,
      rollNo: rollNo || undefined,
      batch,
      classLevel: classLevel as 10 | 12,
      section,
      pin,
      password,
    });
    return NextResponse.json({ student });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create student.';
    const status = /valid|required/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
