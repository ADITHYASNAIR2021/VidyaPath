import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { getStudentSubmissionResults } from '@/lib/teacher-admin-db';

export async function GET(req: Request) {
  const student = getStudentSessionFromRequestCookies();
  if (!student) {
    return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const packId = url.searchParams.get('packId')?.trim() || '';
  if (!packId) {
    return NextResponse.json({ error: 'packId is required.' }, { status: 400 });
  }

  const attempts = await getStudentSubmissionResults({
    packId,
    studentId: student.studentId,
    rollCode: student.rollCode,
  });
  return NextResponse.json({ attempts });
}
