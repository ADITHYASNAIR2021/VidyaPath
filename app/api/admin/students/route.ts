import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { createStudent, listStudents } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export async function GET(req: Request) {
  if (!getAdminSessionFromRequestCookies()) return unauthorizedJson('Admin session required.');
  const url = new URL(req.url);
  const classLevelRaw = Number(url.searchParams.get('classLevel'));
  const classLevel = classLevelRaw === 10 || classLevelRaw === 12 ? classLevelRaw : undefined;
  const section = url.searchParams.get('section')?.trim() || undefined;
  const status = url.searchParams.get('status');
  const students = await listStudents({
    classLevel,
    section,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  });
  return NextResponse.json({ students });
}

export async function POST(req: Request) {
  if (!getAdminSessionFromRequestCookies()) return unauthorizedJson('Admin session required.');
  try {
    await assertTeacherStorageWritable();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rollCode = typeof body.rollCode === 'string' ? body.rollCode.trim() : '';
    const classLevel = Number(body.classLevel);
    const section = typeof body.section === 'string' ? body.section.trim() : undefined;
    const pin = typeof body.pin === 'string' ? body.pin.trim() : undefined;
    if (!name || !rollCode || (classLevel !== 10 && classLevel !== 12)) {
      return NextResponse.json({ error: 'Required: name, rollCode, classLevel(10|12).' }, { status: 400 });
    }

    const student = await createStudent({
      name,
      rollCode,
      classLevel: classLevel as 10 | 12,
      section,
      pin,
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
