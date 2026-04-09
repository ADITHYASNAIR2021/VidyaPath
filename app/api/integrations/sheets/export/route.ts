import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { canTeacherAccessAssignmentPack, getAssignmentPack, getTeacherSubmissionSummary } from '@/lib/teacher-admin-db';
import { exportToSheets } from '@/lib/sheets-bridge';

export async function POST(req: Request) {
  try {
    const admin = await getAdminSessionFromRequestCookies();
    const teacher = await getTeacherSessionFromRequestCookies();
    if (!admin && !teacher) {
      return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    if (!packId) {
      return NextResponse.json({ error: 'packId is required.' }, { status: 400 });
    }

    if (teacher && !(await canTeacherAccessAssignmentPack(teacher.teacher.id, packId))) {
      return NextResponse.json({ error: 'Forbidden pack access.' }, { status: 403 });
    }

    const pack = await getAssignmentPack(packId);
    if (!pack) return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });

    const summary = teacher
      ? await getTeacherSubmissionSummary(teacher.teacher.id, packId)
      : null;

    const payload = {
      exportedAt: new Date().toISOString(),
      pack,
      summary,
    };
    const result = await exportToSheets(payload);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheets export failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
