import { randomUUID } from 'node:crypto';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, sanitizePackTitle, toAnswerKey } from '@/lib/teacher-assignment';
import { getStudentSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { ALL_CHAPTERS } from '@/lib/data';
import { getSubjectsForAcademicTrack } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { z } from 'zod';

const teacherActionSchema = z.enum([
  'set-important-topics',
  'set-quiz-link',
  'add-announcement',
  'remove-announcement',
  'create-assignment-pack',
]);
const teacherActionEnvelopeSchema = z.record(z.string(), z.unknown());
const sectionSchema = z.string().trim().max(40).optional();
const chapterIdSchema = z.string().trim().min(1).max(80);
const dueDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const setImportantTopicsActionSchema = z.object({
  action: z.literal('set-important-topics'),
  chapterId: chapterIdSchema,
  topics: z.array(z.string().trim().max(140)).max(20).optional().default([]),
  section: sectionSchema,
}).strict();

const setQuizLinkActionSchema = z.object({
  action: z.literal('set-quiz-link'),
  chapterId: chapterIdSchema,
  url: z.string().trim().max(500),
  section: sectionSchema,
}).strict();

const addAnnouncementActionSchema = z.object({
  action: z.literal('add-announcement'),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(800),
  chapterId: z.string().trim().max(80).optional(),
  section: sectionSchema,
  batch: z.string().trim().max(80).optional(),
  deliveryScope: z.enum(['class', 'section', 'batch', 'chapter']).optional(),
}).strict();

const removeAnnouncementActionSchema = z.object({
  action: z.literal('remove-announcement'),
  id: z.string().trim().min(1).max(80),
}).strict();

const createAssignmentPackActionSchema = z.object({
  action: z.literal('create-assignment-pack'),
  chapterId: chapterIdSchema,
  classLevel: z.coerce.number().refine((value) => value === 10 || value === 12),
  subject: z.string().trim().min(1).max(80),
  questionCount: z.coerce.number().int().min(1).max(24).optional(),
  difficultyMix: z.string().trim().max(100).optional(),
  includeShortAnswers: z.boolean().optional(),
  includeFormulaDrill: z.boolean().optional(),
  dueDate: dueDateSchema.optional(),
  section: sectionSchema,
}).strict();
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

function zodIssuesToApi(issues: z.ZodIssue[]): Array<{ path: string; message: string }> {
  return issues.map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.map((part) => String(part)).join('.') : '',
    message: issue.message,
  }));
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
      const fallbackSubjects = getSubjectsForAcademicTrack(studentSession.classLevel, studentSession.stream);
      const allowedSubjects = new Set(enrolledSubjects.length > 0 ? enrolledSubjects : fallbackSubjects);
      if (allowedSubjects.size === 0) return dataJson({ requestId, data: config });
      return dataJson({
        requestId,
        data: filterPublicConfigBySubjects(config as unknown as Record<string, unknown>, allowedSubjects),
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

    const bodyResult = await parseAndValidateJsonBody(req, 128 * 1024, teacherActionEnvelopeSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }
    const body = bodyResult.value as Record<string, unknown>;
    const actionResult = z.object({ action: teacherActionSchema }).safeParse(body);
    if (!actionResult.success) {
      return errorJson({
        requestId,
        errorCode: 'invalid-input',
        message: 'Action is required.',
        status: 400,
        issues: zodIssuesToApi(actionResult.error.issues),
      });
    }
    const action = actionResult.data.action as TeacherAction;

    if (action === 'set-important-topics') {
      const parsedAction = setImportantTopicsActionSchema.safeParse(body);
      if (!parsedAction.success) {
        return errorJson({
          requestId,
          errorCode: 'invalid-input',
          message: 'Invalid set-important-topics payload.',
          status: 400,
          issues: zodIssuesToApi(parsedAction.error.issues),
        });
      }
      const config = await setImportantTopics({
        teacherId: session.teacher.id,
        chapterId: parsedAction.data.chapterId,
        topics: parsedAction.data.topics,
        section: parsedAction.data.section,
      });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-set-important-topics',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId: parsedAction.data.chapterId, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'set-quiz-link') {
      const parsedAction = setQuizLinkActionSchema.safeParse(body);
      if (!parsedAction.success) {
        return errorJson({
          requestId,
          errorCode: 'invalid-input',
          message: 'Invalid set-quiz-link payload.',
          status: 400,
          issues: zodIssuesToApi(parsedAction.error.issues),
        });
      }
      const config = await setQuizLink({
        teacherId: session.teacher.id,
        chapterId: parsedAction.data.chapterId,
        url: parsedAction.data.url,
        section: parsedAction.data.section,
      });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-set-quiz-link',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId: parsedAction.data.chapterId, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'add-announcement') {
      const parsedAction = addAnnouncementActionSchema.safeParse(body);
      if (!parsedAction.success) {
        return errorJson({
          requestId,
          errorCode: 'invalid-input',
          message: 'Invalid add-announcement payload.',
          status: 400,
          issues: zodIssuesToApi(parsedAction.error.issues),
        });
      }
      const config = await addAnnouncement({
        teacherId: session.teacher.id,
        title: parsedAction.data.title,
        body: parsedAction.data.body,
        chapterId: parsedAction.data.chapterId || undefined,
        section: parsedAction.data.section,
        batch: parsedAction.data.batch,
        deliveryScope: parsedAction.data.deliveryScope,
      });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-add-announcement',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, chapterId: parsedAction.data.chapterId || undefined, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'remove-announcement') {
      const parsedAction = removeAnnouncementActionSchema.safeParse(body);
      if (!parsedAction.success) {
        return errorJson({
          requestId,
          errorCode: 'invalid-input',
          message: 'Invalid remove-announcement payload.',
          status: 400,
          issues: zodIssuesToApi(parsedAction.error.issues),
        });
      }
      const config = await removeAnnouncement({ teacherId: session.teacher.id, id: parsedAction.data.id });
      const committedAt = new Date().toISOString();
      await recordAuditEvent({
        requestId,
        endpoint: '/api/teacher',
        action: 'teacher-remove-announcement',
        statusCode: 200,
        actorRole: 'teacher',
        metadata: { teacherId: session.teacher.id, announcementId: parsedAction.data.id, committedAt },
      });
      return dataJson({
        requestId,
        data: { ok: true, config },
        meta: { committedAt },
      });
    }

    if (action === 'create-assignment-pack') {
      const parsedAction = createAssignmentPackActionSchema.safeParse(body);
      if (!parsedAction.success) {
        return errorJson({
          requestId,
          errorCode: 'invalid-input',
          message: 'Invalid create-assignment-pack payload.',
          status: 400,
          issues: zodIssuesToApi(parsedAction.error.issues),
        });
      }
      const classLevel = safeClassLevel(parsedAction.data.classLevel);
      const chapterId = parsedAction.data.chapterId;
      const subject = parsedAction.data.subject;
      const questionCount = Number(parsedAction.data.questionCount);
      const difficultyMix = parsedAction.data.difficultyMix ?? '40% easy, 40% medium, 20% hard';
      const includeShortAnswers = parsedAction.data.includeShortAnswers !== false;
      const includeFormulaDrill = parsedAction.data.includeFormulaDrill !== false;
      const dueDate = parsedAction.data.dueDate;

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
        section: parsedAction.data.section,
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
