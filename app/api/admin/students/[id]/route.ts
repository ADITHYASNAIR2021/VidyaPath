import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { updateStudent } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  try {
    await assertTeacherStorageWritable();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const updates: Partial<{
      name: string;
      rollCode: string;
      rollNo: string;
      batch: string;
      classLevel: 10 | 12;
      section?: string;
      status: 'active' | 'inactive';
      pin: string;
    }> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.rollCode === 'string') updates.rollCode = body.rollCode;
    if (typeof body.rollNo === 'string') updates.rollNo = body.rollNo;
    if (typeof body.batch === 'string') updates.batch = body.batch;
    if (Number(body.classLevel) === 10 || Number(body.classLevel) === 12) updates.classLevel = Number(body.classLevel) as 10 | 12;
    if (typeof body.section === 'string') updates.section = body.section;
    if (body.status === 'active' || body.status === 'inactive') updates.status = body.status;
    if (typeof body.pin === 'string') updates.pin = body.pin;

    const schoolId = adminSession.role === 'admin' ? adminSession.schoolId : undefined;
    const student = await updateStudent(params.id, updates, schoolId);
    if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    return NextResponse.json({ student });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update student.';
    const status = /valid|required/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
