import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { updateAssignmentPackStatus } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export async function POST(req: Request) {
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    if (!packId) return NextResponse.json({ error: 'packId is required.' }, { status: 400 });

    const pack = await updateAssignmentPackStatus({
      teacherId: teacherSession.teacher.id,
      packId,
      status: 'published',
      approved: true,
    });
    if (!pack) return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });

    return NextResponse.json({ pack });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
