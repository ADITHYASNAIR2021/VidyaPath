import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { gradeSubmission } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

type QuestionGradeInput = {
  questionNo: string;
  scoreAwarded: number;
  maxScore: number;
  feedback?: string;
};

function parseQuestionGrades(value: unknown): QuestionGradeInput[] {
  if (!Array.isArray(value)) return [];
  const rows: QuestionGradeInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const questionNo = typeof row.questionNo === 'string' ? row.questionNo.trim() : '';
    const scoreAwarded = Number(row.scoreAwarded);
    const maxScore = Number(row.maxScore);
    const feedback = typeof row.feedback === 'string' ? row.feedback.trim() : undefined;
    if (!questionNo || !Number.isFinite(scoreAwarded) || !Number.isFinite(maxScore)) continue;
    rows.push({ questionNo, scoreAwarded, maxScore, feedback });
  }
  return rows;
}

export async function POST(req: Request) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    const submissionId = typeof body?.submissionId === 'string' ? body.submissionId.trim() : '';
    const questionGrades = parseQuestionGrades(body?.questionGrades);

    if (!submissionId || questionGrades.length === 0) {
      return NextResponse.json({ error: 'Required: submissionId and questionGrades[]' }, { status: 400 });
    }

    const submission = await gradeSubmission({
      teacherId: session.teacher.id,
      submissionId,
      questionGrades,
    });

    if (!submission) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
    return NextResponse.json({ submission });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grade submission.';
    const status = /required|valid|grade/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
