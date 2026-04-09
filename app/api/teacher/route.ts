import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { buildTeacherAssignmentPackDraft, buildTeacherPackUrls, sanitizePackTitle, toAnswerKey } from '@/lib/teacher-assignment';
import { getStudentSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import {
  addAnnouncement,
  getPrivateTeacherConfig,
  getPublicTeacherConfig,
  removeAnnouncement,
  setImportantTopics,
  setQuizLink,
  upsertAssignmentPack,
} from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
 
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

export async function GET(req: Request) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (session) {
      const config = await getPrivateTeacherConfig(session.teacher.id);
      return NextResponse.json(config);
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
    const config = await getPublicTeacherConfig({ chapterId, classLevel, subject, section });
    return NextResponse.json(config);
  } catch (error) {
    console.error('[teacher:get] error', error);
    return NextResponse.json({ error: 'Failed to load teacher config.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    }
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
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
      if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });
      const config = await setImportantTopics({ teacherId: session.teacher.id, chapterId, topics, section });
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'set-quiz-link') {
      const url = String((body as Record<string, unknown>).url ?? '').trim();
      if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });
      const config = await setQuizLink({ teacherId: session.teacher.id, chapterId, url, section });
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'add-announcement') {
      const title = String((body as Record<string, unknown>).title ?? '').trim();
      const message = String((body as Record<string, unknown>).body ?? '').trim();
      const config = await addAnnouncement({
        teacherId: session.teacher.id,
        title,
        body: message,
        chapterId: chapterId || undefined,
        section,
      });
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'remove-announcement') {
      const id = String((body as Record<string, unknown>).id ?? '').trim();
      const config = await removeAnnouncement({ teacherId: session.teacher.id, id });
      return NextResponse.json({ ok: true, config });
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
      if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });

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
      return NextResponse.json({ ok: true, pack });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('[teacher:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to update teacher config.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
