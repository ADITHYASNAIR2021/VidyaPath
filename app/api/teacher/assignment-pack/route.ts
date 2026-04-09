import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getStudentSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import {
  canTeacherAccessAssignmentPack,
  getAssignmentPack,
  upsertAssignmentPack,
} from '@/lib/teacher-admin-db';
import {
  buildTeacherAssignmentPackDraft,
  buildTeacherPackUrls,
  sanitizePackTitle,
  toAnswerKey,
} from '@/lib/teacher-assignment';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

function parseClassLevel(value: unknown): 10 | 12 {
  return Number(value) === 10 ? 10 : 12;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id')?.trim() ?? '';
    if (!id) {
      return NextResponse.json({ error: 'id query param is required.' }, { status: 400 });
    }

    const pack = await getAssignmentPack(id);
    if (!pack) {
      return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });
    }

    const teacherSession = await getTeacherSessionFromRequestCookies();
    let canViewFullPack = false;
    if (teacherSession) {
      canViewFullPack = await canTeacherAccessAssignmentPack(teacherSession.teacher.id, pack.packId);
    }
    if (!canViewFullPack && pack.status !== 'published') {
      return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });
    }

    if (!canViewFullPack) {
      const studentSession = getStudentSessionFromRequestCookies();
      if (!studentSession) {
        return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
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
      const { createdByKeyId: _createdByKeyId, ...publicPack } = pack;
      return NextResponse.json({
        ...publicPack,
        answerKey: [],
      });
    }
    return NextResponse.json(pack);
  } catch (error) {
    console.error('[teacher-assignment-pack:get] error', error);
    return NextResponse.json({ error: 'Failed to load assignment pack.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const teacherSession = await getTeacherSessionFromRequestCookies();
    if (!teacherSession) {
      return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    }
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const chapterId = typeof (body as Record<string, unknown>).chapterId === 'string'
      ? String((body as Record<string, unknown>).chapterId).trim()
      : '';
    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });
    }
    const section = typeof (body as Record<string, unknown>).section === 'string'
      ? String((body as Record<string, unknown>).section).trim()
      : undefined;

    const draft = await buildTeacherAssignmentPackDraft({
      chapterId,
      classLevel: parseClassLevel((body as Record<string, unknown>).classLevel),
      subject: typeof (body as Record<string, unknown>).subject === 'string'
        ? String((body as Record<string, unknown>).subject).trim()
        : '',
      questionCount: Number((body as Record<string, unknown>).questionCount),
      difficultyMix: typeof (body as Record<string, unknown>).difficultyMix === 'string'
        ? String((body as Record<string, unknown>).difficultyMix).trim()
        : '40% easy, 40% medium, 20% hard',
      includeShortAnswers: (body as Record<string, unknown>).includeShortAnswers !== false,
      includeFormulaDrill: (body as Record<string, unknown>).includeFormulaDrill !== false,
      dueDate: typeof (body as Record<string, unknown>).dueDate === 'string'
        ? String((body as Record<string, unknown>).dueDate).trim()
        : undefined,
    });

    const incomingPackId = typeof (body as Record<string, unknown>).packId === 'string'
      ? String((body as Record<string, unknown>).packId).trim()
      : '';
    const packId = incomingPackId || randomUUID();
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

    return NextResponse.json(pack);
  } catch (error) {
    console.error('[teacher-assignment-pack:post] error', error);
    const message = error instanceof Error ? error.message : 'Failed to create assignment pack.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
