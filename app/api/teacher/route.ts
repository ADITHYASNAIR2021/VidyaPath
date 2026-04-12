import { randomUUID } from 'node:crypto';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, sanitizePackTitle, toAnswerKey } from '@/lib/teacher-assignment';
import { getStudentSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { ALL_CHAPTERS } from '@/lib/data';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import {
  addAnnouncement,
  getPrivateTeacherConfig,
  getPublicTeacherConfig,
  removeAnnouncement,
  setImportantTopics,
  setQuizLink,
  upsertAssignmentPack,
} from '@/lib/teacher-admin-db';
import { getStudentEnrolledSubjects } from '@/lib/school-management-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { recordAuditEvent } from '@/lib/security/audit';
 
export const dynamic = 'force-dynamic';

type TeacherAction =
  | 'set-important-topics'
  | 'set-quiz-link'
  | 'add-announcement'
  | 'remove-announcement'
  | 'create-assignment-pack';

function safeClassLevel(value: unknown): 10 | 12 {
  return Number(value) === 10 ? 10 : 12;
}

function filterPublicConfigBySubjects(config: Record<string, unknown>, allowedSubjects: Set<string>) {
  const chapterSubjectById = new Map(ALL_CHAPTERS.map((chapter) => [chapter.id, chapter.subject]));
  const scopeFeed = config.scopeFeed && typeof config.scopeFeed === 'object'
    ? (config.scopeFeed as Record<string, unknown>)
    : null;
  if (scopeFeed) {
    const announcements = Array.isArray(scopeFeed.announcements) ? scopeFeed.announcements : [];
    const assignmentPacks = Array.isArray(scopeFeed.assignmentPacks) ? scopeFeed.assignmentPacks : [];
    const quizLinks = Array.isArray(scopeFeed.quizLinks) ? scopeFeed.quizLinks : [];
    const importantTopics = Array.isArray(scopeFeed.importantTopics) ? scopeFeed.importantTopics : [];
    scopeFeed.announcements = announcements.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const subject = typeof (entry as Record<string, unknown>).subject === 'string'
        ? (entry as Record<string, unknown>).subject as string
        : '';
      return allowedSubjects.has(subject);
    });
    scopeFeed.assignmentPacks = assignmentPacks.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const subject = typeof (entry as Record<string, unknown>).subject === 'string'
        ? (entry as Record<string, unknown>).subject as string
        : '';
      return allowedSubjects.has(subject);
    });
    scopeFeed.quizLinks = quizLinks.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const chapterId = typeof (entry as Record<string, unknown>).chapterId === 'string'
        ? (entry as Record<string, unknown>).chapterId as string
        : '';
      const subject = chapterSubjectById.get(chapterId) || '';
      return allowedSubjects.has(subject);
    });
    scopeFeed.importantTopics = importantTopics.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const chapterId = typeof (entry as Record<string, unknown>).chapterId === 'string'
        ? (entry as Record<string, unknown>).chapterId as string
        : '';
      const subject = chapterSubjectById.get(chapterId) || '';
      return allowedSubjects.has(subject);
    });
  }

  const announcements = Array.isArray(config.announcements) ? config.announcements : [];
  const scopedAnnouncements = scopeFeed && Array.isArray(scopeFeed.announcements)
    ? scopeFeed.announcements
    : [];
  const allowedAnnouncementIds = new Set(
    scopedAnnouncements
      .map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>).id : undefined))
      .filter((id): id is string => typeof id === 'string')
  );
  config.announcements = announcements.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const id = (entry as Record<string, unknown>).id;
    if (typeof id !== 'string') return false;
    if (allowedAnnouncementIds.size > 0) return allowedAnnouncementIds.has(id);
    return false;
  });
  return config;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (session) {
      const config = await getPrivateTeacherConfig(session.teacher.id);
      return dataJson({ requestId, data: config });
    }
    const studentSession = await getStudentSessionFromRequestCookies();
    const url = new URL(req.url);
    const chapterId = url.searchParams.get('chapterId')?.trim() || undefined;
    const classLevelRaw = Number(url.searchParams.get('classLevel'));
    const classLevel = classLevelRaw === 10 || classLevelRaw === 12 ? classLevelRaw : undefined;
    const subject = url.searchParams.get('subject')?.trim() || undefined;
    const sectionFromQuery = url.searchParams.get('section')?.trim() || undefined;
    const sectionFromStudent =
      studentSession &&
      (!classLevel || classLevel === studentSession.classLevel) &&
      studentSession.section
        ? studentSession.section
        : undefined;
    const section = sectionFromQuery || sectionFromStudent;
    const config = await getPublicTeacherConfig({
      chapterId,
      classLevel,
      subject,
      section,
      schoolId: studentSession?.schoolId,
    });
    if (studentSession?.studentId) {
      const enrolledSubjects = await getStudentEnrolledSubjects(studentSession.studentId, studentSession.schoolId);
      const allowedSubjects = new Set(enrolledSubjects);
      if (allowedSubjects.size > 0) {
        return dataJson({
          requestId,
          data: filterPublicConfigBySubjects(config as unknown as Record<string, unknown>, allowedSubjects),
        });
      }
      return dataJson({
        requestId,
        data: {
          ...config,
          announcements: [],
          scopeFeed: {
            ...(config.scopeFeed || {}),
            announcements: [],
            assignmentPacks: [],
            quizLinks: [],
            importantTopics: [],
          },
        },
      });
    }
    return dataJson({ requestId, data: config });
  } catch (error) {
    console.error('[teacher:get] error', error);
    return errorJson({
      requestId,
      errorCode: 'teacher-config-read-failed',
      message: 'Failed to load teacher config.',
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) {
      return errorJson({
        requestId,
        errorCode: 'unauthorized',
        message: 'Unauthorized teacher access.',
        status: 401,
      });
    }
    await assertTeacherStorageWritable();

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 128 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value;
    const action = String((body as Record<string, unknown>).action ?? '') as TeacherAction;
    const chapterId = String((body as Record<string, unknown>).chapterId ?? '').trim();
    const section = typeof (body as Record<string, unknown>).section === 'string'
      ? String((body as Record<string, unknown>).section).trim()
      : undefined;

    if (action === 'set-important-topics') {
      const topics = Array.isArray((body as Record<string, unknown>).topics)
        ? ((body as Record<string, unknown>).topics as unknown[])
            .filter((item): item is string => typeof item === 'string')
        : [];
      if (!chapterId) {
        return errorJson({
          requestId,
          errorCode: 'missing-chapter-id',
          message: 'chapterId is required.',
          status: 400,
        });
      }
      const config = await setImportantTopics({ teacherId: session.teacher.id, chapterId, topics, section });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-set-important-topics',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'set-quiz-link') {
      const url = String((body as Record<string, unknown>).url ?? '').trim();
      if (!chapterId) {
        return errorJson({
          requestId,
          errorCode: 'missing-chapter-id',
          message: 'chapterId is required.',
          status: 400,
        });
      }
      const config = await setQuizLink({ teacherId: session.teacher.id, chapterId, url, section });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-set-quiz-link',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'add-announcement') {
      const title = String((body as Record<string, unknown>).title ?? '').trim();
      const message = String((body as Record<string, unknown>).body ?? '').trim();
      const rawDeliveryScope = (body as Record<string, unknown>).deliveryScope;
      const deliveryScope =
        rawDeliveryScope === 'class' || rawDeliveryScope === 'section' || rawDeliveryScope === 'batch' || rawDeliveryScope === 'chapter'
          ? rawDeliveryScope
          : undefined;
      const targetBatch = typeof (body as Record<string, unknown>).batch === 'string'
        ? String((body as Record<string, unknown>).batch).trim() || undefined
        : undefined;
      const config = await addAnnouncement({
        teacherId: session.teacher.id,
        title,
        body: message,
        chapterId: chapterId || undefined,
        section,
        batch: targetBatch,
        deliveryScope,
      });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-add-announcement',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId: chapterId || undefined, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'remove-announcement') {
      const id = String((body as Record<string, unknown>).id ?? '').trim();
      const config = await removeAnnouncement({ teacherId: session.teacher.id, id });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-remove-announcement',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, announcementId: id, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'create-assignment-pack') {
      const classLevel = safeClassLevel((body as Record<string, unknown>).classLevel);
      const subject = typeof (body as Record<string, unknown>).subject === 'string'
        ? String((body as Record<string, unknown>).subject).trim()
        : '';
      const questionCount = Number((body as Record<string, unknown>).questionCount);
      const difficultyMix = typeof (body as Record<string, unknown>).difficultyMix === 'string'
        ? String((body as Record<string, unknown>).difficultyMix).trim()
        : '40% easy, 40% medium, 20% hard';
      const includeShortAnswers = (body as Record<string, unknown>).includeShortAnswers !== false;
      const includeFormulaDrill = (body as Record<string, unknown>).includeFormulaDrill !== false;
      const dueDate = typeof (body as Record<string, unknown>).dueDate === 'string'
        ? String((body as Record<string, unknown>).dueDate).trim()
        : undefined;
      if (!chapterId) {
        return errorJson({
          requestId,
          errorCode: 'missing-chapter-id',
          message: 'chapterId is required.',
          status: 400,
        });
      }

      const draft = await buildTeacherAssignmentPackDraft({
        chapterId,
        classLevel,
        subject,
        questionCount: Number.isFinite(questionCount) ? questionCount : 8,
        difficultyMix,
        includeShortAnswers,
        includeFormulaDrill,
        dueDate,
      });

      const packId = randomUUID();
      const urls = buildTeacherPackUrls(packId);
      const pack = await upsertAssignmentPack(session.teacher.id, {
        ...draft,
        packId,
        title: sanitizePackTitle(chapterId, draft.title),
        answerKey: toAnswerKey(draft.mcqs),
        shareUrl: urls.shareUrl,
        printUrl: urls.printUrl,
        section,
      });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-create-assignment-pack',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, packId: pack.packId, chapterId, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, pack },
        meta: { committedAt },
      });
    }

    return errorJson({
      requestId,
      errorCode: 'unknown-teacher-action',
      message: 'Unknown action.',
      status: 400,
    });
  } catch (error) {
    console.error('[teacher:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to update teacher config.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return errorJson({
      requestId,
      errorCode: 'teacher-config-update-failed',
      message,
      status,
    });
  }
}
