import { NextResponse } from 'next/server';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getAssignmentPack, startExamSession } from '@/lib/teacher-admin-db';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await assertTeacherStorageWritable();
    const body = await req.json().catch(() => null);
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
    }
    const studentName = studentSession.studentName;
    const submissionCode = studentSession.rollCode;
    if (!packId || !studentName || !submissionCode) {
      return NextResponse.json(
        { error: 'Required: { packId }' },
        { status: 400 }
      );
    }
    const pack = await getAssignmentPack(packId);
    if (!pack || pack.status !== 'published') {
      return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });
    }
    if (pack.classLevel !== studentSession.classLevel) {
      return NextResponse.json({ error: 'This assignment is not available for your class.' }, { status: 403 });
    }
    if (pack.section && studentSession.section && pack.section !== studentSession.section) {
      return NextResponse.json({ error: 'This assignment is section restricted.' }, { status: 403 });
    }
    if (pack.section && !studentSession.section) {
      return NextResponse.json({ error: 'Student section is missing for this restricted assignment.' }, { status: 403 });
    }

    const session = await startExamSession({ packId, studentName, submissionCode });
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start exam session.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
