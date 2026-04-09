import { NextResponse } from 'next/server';
import { addSubmission, getAssignmentPack } from '@/lib/teacher-admin-db';
import { evaluateTeacherAssignmentSubmission } from '@/lib/teacher-assignment';
import type { TeacherSubmissionAnswer } from '@/lib/teacher-types';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';

interface SubmissionRequestBody {
  packId: string;
  answers: TeacherSubmissionAnswer[];
}

function parseSubmissionBody(value: unknown): SubmissionRequestBody | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const packId = typeof body.packId === 'string' ? body.packId.trim() : '';
  const answers: TeacherSubmissionAnswer[] = [];
  if (Array.isArray(body.answers)) {
    body.answers.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      const questionNo = typeof entry.questionNo === 'string' ? entry.questionNo.trim() : '';
      const answerText = typeof entry.answerText === 'string' ? entry.answerText.trim() : '';
      if (!questionNo || !answerText) return;
      answers.push({ questionNo, answerText });
    });
  }
  if (!packId || answers.length === 0) return null;
  return { packId, answers };
}

export async function POST(req: Request) {
  try {
    await assertTeacherStorageWritable();
    const studentSession = getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const parsed = parseSubmissionBody(body);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid request. Required: { packId, answers: [{ questionNo, answerText }] }' },
        { status: 400 }
      );
    }

    const pack = await getAssignmentPack(parsed.packId);
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

    const result = evaluateTeacherAssignmentSubmission(pack, parsed.answers);
    const { submission, duplicate } = await addSubmission({
      packId: parsed.packId,
      studentId: studentSession.studentId,
      studentName: studentSession.studentName,
      submissionCode: studentSession.rollCode,
      answers: parsed.answers,
      result,
    });

    return NextResponse.json({
      submissionId: submission.submissionId,
      status: submission.status,
      message: 'Submission recorded. Waiting for teacher review and result release.',
      duplicate,
    });
  } catch (error) {
    console.error('[teacher-submission:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to submit assignment.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
