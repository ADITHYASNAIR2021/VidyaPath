import { NextResponse } from 'next/server';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { errorJson, getClientIp, getRequestId, withRequestIdHeader } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
import { beginIdempotentRequest, commitIdempotentResponse } from '@/lib/security/idempotency';
import {
  addSubmission,
  completeExamSession,
  getAssignmentPack,
  getExamSession,
} from '@/lib/teacher-admin-db';
import { evaluateTeacherAssignmentSubmission } from '@/lib/teacher-assignment';
import type { TeacherSubmissionAnswer } from '@/lib/teacher-types';

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
  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  const endpoint = '/api/exam/session/submit';
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'exam-submit-denied',
        statusCode: 401,
        actorRole: 'system',
        metadata: { ip },
      });
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Student login required.',
        status: 401,
      });
    }

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 256 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return errorJson({
        requestId,
        errorCode: 'missing-session-id',
        message: 'sessionId is required.',
        status: 400,
      });
    }

    const idempotency = await beginIdempotentRequest({
      endpoint,
      actorScope: `student:${studentSession.studentId}`,
      idempotencyKey: req.headers.get('x-idempotency-key')?.trim() || `exam-submit:${sessionId}`,
      requestBody: {
        sessionId,
        answers: body.answers,
      },
      ttlSeconds: 24 * 60 * 60,
    });
    if (idempotency.kind === 'replay') {
      return withRequestIdHeader(NextResponse.json(idempotency.response, { status: idempotency.statusCode }), requestId);
    }
    if (idempotency.kind === 'conflict') {
      return errorJson({
        requestId,
        errorCode: 'idempotency-conflict',
        message: idempotency.message,
        status: 409,
      });
    }

    const session = await getExamSession(sessionId);
    if (!session) {
      return errorJson({
        requestId,
        errorCode: 'exam-session-not-found',
        message: 'Exam session not found.',
        status: 404,
      });
    }
    if (session.status !== 'active') {
      return errorJson({
        requestId,
        errorCode: 'exam-session-closed',
        message: 'Exam session is already closed.',
        status: 409,
      });
    }

    const pack = await getAssignmentPack(session.packId);
    if (!pack || pack.status !== 'published') {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }
    if (pack.classLevel !== studentSession.classLevel) {
      return errorJson({
        requestId,
        errorCode: 'class-mismatch',
        message: 'This assignment is not available for your class.',
        status: 403,
      });
    }
    if (pack.section && studentSession.section && pack.section !== studentSession.section) {
      return errorJson({
        requestId,
        errorCode: 'section-restricted',
        message: 'This assignment is section restricted.',
        status: 403,
      });
    }
    if (pack.section && !studentSession.section) {
      return errorJson({
        requestId,
        errorCode: 'missing-student-section',
        message: 'Student section is missing for this restricted assignment.',
        status: 403,
      });
    }
    if (session.submissionCode.toUpperCase() !== studentSession.rollCode.toUpperCase()) {
      return errorJson({
        requestId,
        errorCode: 'session-identity-mismatch',
        message: 'Session identity mismatch. Please login again.',
        status: 403,
      });
    }

    const answers = parseAnswers(body.answers);
    if (answers.length === 0) {
      return errorJson({
        requestId,
        errorCode: 'missing-answers',
        message: 'At least one answer is required.',
        status: 400,
      });
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

    const committedAt = new Date().toISOString();
    const responseBody = {
      ok: true,
      requestId,
      data: {
        submissionId: submission.submissionId,
        status: submission.status,
        message: 'Exam submitted. Result will be available after teacher grading and release.',
        integritySummary: submission.integritySummary,
      },
      meta: { committedAt },
    } as const;
    await commitIdempotentResponse({
      rowId: idempotency.rowId,
      response: responseBody as unknown as Record<string, unknown>,
      statusCode: 200,
    });
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'exam-submitted',
      statusCode: 200,
      actorRole: 'student',
      metadata: {
        studentId: studentSession.studentId,
        packId: session.packId,
        sessionId,
        committedAt,
      },
    });
    logServerEvent({
      event: 'exam-submitted',
      requestId,
      endpoint,
      role: 'student',
      statusCode: 200,
      details: { studentId: studentSession.studentId, sessionId, packId: session.packId },
    });
    return withRequestIdHeader(NextResponse.json(responseBody), requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit exam.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'exam-submit-failed',
      statusCode: status,
      actorRole: 'system',
      metadata: { ip, message: message.slice(0, 300) },
    });
    return errorJson({
      requestId,
      errorCode: 'exam-submit-failed',
      message,
      status,
    });
  }
}
