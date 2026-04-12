import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getAssignmentPack, getAssignmentPackSchoolId, getExamSession, recordExamHeartbeat } from '@/lib/teacher-admin-db';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import type { ExamViolationEvent } from '@/lib/teacher-types';

const EXAM_VIOLATION_TYPES: ExamViolationEvent['type'][] = [
  'fullscreen-exit',
  'tab-hidden',
  'window-blur',
  'copy-attempt',
  'paste-attempt',
  'context-menu',
  'key-shortcut',
];

function parseEvents(value: unknown): ExamViolationEvent[] {
  if (!Array.isArray(value)) return [];
  const parsed: ExamViolationEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const event = item as Record<string, unknown>;
    const rawType = typeof event.type === 'string' ? event.type.trim() : '';
    if (!EXAM_VIOLATION_TYPES.includes(rawType as ExamViolationEvent['type'])) continue;
    parsed.push({
      type: rawType as ExamViolationEvent['type'],
      occurredAt: typeof event.occurredAt === 'string' ? event.occurredAt : new Date().toISOString(),
      detail: typeof event.detail === 'string' ? event.detail : undefined,
    });
  }
  return parsed;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Student login required.',
        status: 401,
      });
    }

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return errorJson({
        requestId,
        errorCode: 'missing-session-id',
        message: 'sessionId is required.',
        status: 400,
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
    if (session.submissionCode.toUpperCase() !== studentSession.rollCode.toUpperCase()) {
      return errorJson({
        requestId,
        errorCode: 'session-identity-mismatch',
        message: 'Session identity mismatch. Please login again.',
        status: 403,
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
    const packSchoolId = await getAssignmentPackSchoolId(pack.packId);
    if (!studentSession.schoolId || !packSchoolId || packSchoolId !== studentSession.schoolId) {
      return errorJson({
        requestId,
        errorCode: 'school-mismatch',
        message: 'This assignment is not available for your school.',
        status: 403,
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

    const events = parseEvents(body?.events);
    const data = await recordExamHeartbeat({ sessionId, events });
    return dataJson({ requestId, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update exam session.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'exam-heartbeat-failed',
      message,
      status,
    });
  }
}
