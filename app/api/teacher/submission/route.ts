import { addSubmission, getAssignmentPack } from '@/lib/teacher-admin-db';
import { evaluateTeacherAssignmentSubmission } from '@/lib/teacher-assignment';
import type { TeacherSubmissionAnswer } from '@/lib/teacher-types';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

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
  const requestId = getRequestId(req);
  const endpoint = '/api/teacher/submission';
  const ip = getClientIp(req);
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'submission-denied',
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
    const parsed = parseSubmissionBody(bodyResult.value);
    if (!parsed) {
      return errorJson({
        requestId,
        errorCode: 'invalid-request-body',
        message: 'Invalid request. Required: { packId, answers: [{ questionNo, answerText }] }',
        status: 400,
      });
    }

    const pack = await getAssignmentPack(parsed.packId);
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

    // Server-side duplicate guard: block re-submission for the same student + pack
    const { supabaseSelect } = await import('@/lib/supabase-rest');
    const existingRows = await supabaseSelect<{ id: string }>(
      'teacher_submissions',
      {
        select: 'id',
        filters: [
          { column: 'pack_id', value: parsed.packId },
          { column: 'submission_code', value: studentSession.rollCode.toUpperCase() },
        ],
        limit: 1,
      }
    ).catch(() => []);
    if (existingRows.length > 0) {
      return errorJson({
        requestId,
        errorCode: 'already-submitted',
        message: 'You have already submitted this assignment.',
        status: 409,
      });
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

    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'submission-recorded',
      statusCode: 200,
      actorRole: 'student',
      metadata: {
        studentId: studentSession.studentId,
        submissionId: submission.submissionId,
        packId: parsed.packId,
        duplicate,
        committedAt,
      },
    });
    logServerEvent({
      event: 'submission-recorded',
      requestId,
      endpoint,
      role: 'student',
      statusCode: 200,
      details: { studentId: studentSession.studentId, packId: parsed.packId, duplicate },
    });
    return dataJson({
      requestId,
      data: {
        submissionId: submission.submissionId,
        status: submission.status,
        message: 'Submission recorded. Waiting for teacher review and result release.',
        duplicate,
      },
      meta: { committedAt },
    });
  } catch (error) {
    console.error('[teacher-submission:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to submit assignment.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'submission-failed',
      statusCode: status,
      actorRole: 'system',
      metadata: { message: message.slice(0, 300), ip },
    });
    return errorJson({
      requestId,
      errorCode: 'submission-failed',
      message,
      status,
    });
  }
}
