import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { getTeacherSubmissionSummary } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    }
    const url = new URL(req.url);
    const packId = url.searchParams.get('packId')?.trim() ?? '';
    if (!packId) {
      return NextResponse.json({ error: 'packId query param is required.' }, { status: 400 });
    }

    const summary = await getTeacherSubmissionSummary(teacherSession.teacher.id, packId);
    if (!summary) {
      return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[teacher-submission-summary:get] error', error);
    return NextResponse.json({ error: 'Failed to load submission summary.' }, { status: 500 });
  }
}
