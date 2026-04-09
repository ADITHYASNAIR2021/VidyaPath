import { NextResponse } from 'next/server';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import {
  addSubmission,
  completeExamSession,
  getAssignmentPack,
  getExamSession,
} from '@/lib/teacher-admin-db';
import { evaluateTeacherAssignmentSubmission } from '@/lib/teacher-assignment';
import type { TeacherSubmissionAnswer } from '@/lib/teacher-types';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

function parseAnswers(value: unknown): TeacherSubmissionAnswer[] {
  if (!Array.isArray(value)) return [];
  const answers: TeacherSubmissionAnswer[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const answer = item as Record<string, unknown>;
    const questionNo = typeof answer.questionNo === 'string' ? answer.questionNo.trim() : '';
    const answerText = typeof answer.answerText === 'string' ? answer.answerText.trim() : '';
    if (!questionNo || !answerText) return;
    answers.push({ questionNo, answerText });
  });
  return answers;
}

export async function POST(req: Request) {
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
    }

    const session = await getExamSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Exam session not found.' }, { status: 404 });
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Exam session is already closed.' }, { status: 409 });
    }

    const pack = await getAssignmentPack(session.packId);
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
    if (session.submissionCode.toUpperCase() !== studentSession.rollCode.toUpperCase()) {
      return NextResponse.json({ error: 'Session identity mismatch. Please login again.' }, { status: 403 });
    }

    const answers = parseAnswers(body?.answers);
    if (answers.length === 0) {
      return NextResponse.json({ error: 'At least one answer is required.' }, { status: 400 });
    }

    const integritySummary = await completeExamSession(sessionId);
    const result = evaluateTeacherAssignmentSubmission(pack, answers);
    result.integritySummary = integritySummary;

    const { submission } = await addSubmission({
      packId: session.packId,
      studentId: studentSession.studentId,
      studentName: studentSession.studentName,
      submissionCode: studentSession.rollCode,
      answers,
      result,
    });

    return NextResponse.json({
      submissionId: submission.submissionId,
      status: submission.status,
      message: 'Exam submitted. Result will be available after teacher grading and release.',
      integritySummary: submission.integritySummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit exam.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
