import { randomUUID } from 'node:crypto';
import { getStudentSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { createAssignmentPackSchema } from '@/lib/schemas/teacher-pack';
import { logServerEvent } from '@/lib/observability';
import {
  canTeacherAccessAssignmentPack,
  getAssignmentPack,
  getAssignmentPackSchoolId,
  upsertAssignmentPack,
} from '@/lib/teacher-admin-db';
import { studentCanAccessChapter } from '@/lib/school-management-db';
import {
  buildTeacherAssignmentPackDraft,
  buildTeacherPackUrls,
  sanitizePackTitle,
  toAnswerKey,
} from '@/lib/teacher-assignment';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function parseClassLevel(value: unknown): 10 | 12 {
  return Number(value) === 10 ? 10 : 12;
}

function isPackOpenForStudents(pack: {
  status: string;
  visibilityStatus?: string;
  validFrom?: string;
  validUntil?: string;
}): boolean {
  if (pack.status !== 'published') return false;
  if ((pack.visibilityStatus || 'open') !== 'open') return false;
  const now = Date.now();
  if (pack.validFrom) {
    const start = Date.parse(pack.validFrom);
    if (Number.isFinite(start) && start > now) return false;
  }
  if (pack.validUntil) {
    const end = Date.parse(pack.validUntil);
    if (Number.isFinite(end) && end < now) return false;
  }
  return true;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/teacher/assignment-pack';
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id')?.trim() ?? '';
    if (!id) {
      return errorJson({
        requestId,
        errorCode: 'missing-pack-id',
        message: 'id query param is required.',
        status: 400,
      });
    }

    const pack = await getAssignmentPack(id);
    if (!pack) {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }

    const teacherSession = await getTeacherSessionFromRequestCookies();
    let canViewFullPack = false;
    if (teacherSession) {
      canViewFullPack = await canTeacherAccessAssignmentPack(teacherSession.teacher.id, pack.packId);
    }
    if (!canViewFullPack && pack.status !== 'published') {
      return errorJson({
        requestId,
        errorCode: 'assignment-pack-not-found',
        message: 'Assignment pack not found.',
        status: 404,
      });
    }

    if (!canViewFullPack) {
      const studentSession = await getStudentSessionFromRequestCookies();
      if (!studentSession) {
        return errorJson({
          requestId,
          errorCode: 'unauthorized',
          message: 'Student login required.',
          status: 401,
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
      if (!isPackOpenForStudents(pack)) {
        return errorJson({
          requestId,
          errorCode: 'assignment-pack-closed',
          message: 'This assignment is currently closed.',
          status: 403,
        });
      }
      const allowedByEnrollment = await studentCanAccessChapter({
        studentId: studentSession.studentId,
        chapterId: pack.chapterId,
        schoolId: studentSession.schoolId,
      });
      if (!allowedByEnrollment) {
        return errorJson({
          requestId,
          errorCode: 'subject-enrollment-required',
          message: 'This assignment is not available for your enrolled subjects.',
          status: 403,
        });
      }
      const { createdByKeyId: _createdByKeyId, ...publicPack } = pack;
      const data = {
        ...publicPack,
        answerKey: [],
      };
      logServerEvent({
        event: 'assignment-pack-read',
        requestId,
        endpoint,
        role: 'student',
        statusCode: 200,
        details: { packId: pack.packId },
      });
      return dataJson({ requestId, data });
    }
    logServerEvent({
      event: 'assignment-pack-read',
      requestId,
      endpoint,
      role: 'teacher',
      statusCode: 200,
      details: { packId: pack.packId, status: pack.status },
    });
    return dataJson({ requestId, data: pack });
  } catch (error) {
    console.error('[teacher-assignment-pack:get] error', error);
    const message = error instanceof Error ? error.message : 'Failed to load assignment pack.';
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-read-failed',
      message,
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/teacher/assignment-pack';
  const ip = getClientIp(req);
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      await recordAuditEvent({
        requestId,
        endpoint,
        action: 'assignment-pack-create-denied',
        statusCode: 401,
        actorRole: 'system',
        metadata: { ip },
      });
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    await assertTeacherStorageWritable();

    const bodyResult = await parseAndValidateJsonBody(req, 96 * 1024, createAssignmentPackSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
      });
    }
    const body = bodyResult.value;
    const { chapterId, section, classLevel, subject, questionCount, difficultyMix,
      includeShortAnswers, includeLongAnswers, includeFormulaDrill, dueDate, packId: incomingPackId } = body;

    const draft = await buildTeacherAssignmentPackDraft({
      chapterId,
      classLevel,
      subject,
      questionCount,
      difficultyMix: difficultyMix ?? '40% easy, 40% medium, 20% hard',
      includeShortAnswers: includeShortAnswers !== false,
      includeLongAnswers: includeLongAnswers !== false,
      includeFormulaDrill: includeFormulaDrill !== false,
      dueDate,
    });

    const packId = (incomingPackId?.trim()) || randomUUID();
    const { shareUrl, printUrl } = buildTeacherPackUrls(packId);

    const pack = await upsertAssignmentPack(teacherSession.teacher.id, {
      ...draft,
      packId,
      title: sanitizePackTitle(chapterId, draft.title),
      answerKey: toAnswerKey(draft.mcqs),
      shareUrl,
      printUrl,
      section,
      status: 'draft',
    });

    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'assignment-pack-created',
      statusCode: 200,
      actorRole: 'teacher',
      metadata: {
        teacherId: teacherSession.teacher.id,
        packId: pack.packId,
        chapterId,
        committedAt,
      },
    });
    logServerEvent({
      event: 'assignment-pack-created',
      requestId,
      endpoint,
      role: 'teacher',
      statusCode: 200,
      details: { packId: pack.packId, chapterId },
    });
    return dataJson({
      requestId,
      data: pack,
      meta: { committedAt },
    });
  } catch (error) {
    console.error('[teacher-assignment-pack:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to create assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'assignment-pack-create-failed',
      message,
      status,
    });
  }
}
