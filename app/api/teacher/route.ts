import { NextResponse } from 'next/server';
import {
  addAnnouncement,
  getPrivateTeacherConfig,
  getPublicTeacherConfig,
  isValidTeacherKey,
  removeAnnouncement,
  setImportantTopics,
  setQuizLink,
} from '@/lib/teacher-store';

type TeacherAction =
  | 'set-important-topics'
  | 'set-quiz-link'
  | 'add-announcement'
  | 'remove-announcement';

function getKeyFromRequest(req: Request): string {
  const url = new URL(req.url);
  return url.searchParams.get('key')?.trim() ?? '';
}

function ensureTeacher(req: Request): boolean {
  const key = getKeyFromRequest(req);
  return isValidTeacherKey(key);
}

export async function GET(req: Request) {
  try {
    if (ensureTeacher(req)) {
      const config = await getPrivateTeacherConfig();
      return NextResponse.json(config);
    }
    const config = await getPublicTeacherConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('[teacher:get] error', error);
    return NextResponse.json({ error: 'Failed to load teacher config.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!ensureTeacher(req)) {
      return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const action = String((body as Record<string, unknown>).action ?? '') as TeacherAction;
    const chapterId = String((body as Record<string, unknown>).chapterId ?? '').trim();

    if (action === 'set-important-topics') {
      const topics = Array.isArray((body as Record<string, unknown>).topics)
        ? ((body as Record<string, unknown>).topics as unknown[])
            .filter((item): item is string => typeof item === 'string')
        : [];
      if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });
      const config = await setImportantTopics(chapterId, topics);
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'set-quiz-link') {
      const url = String((body as Record<string, unknown>).url ?? '').trim();
      if (!chapterId) return NextResponse.json({ error: 'chapterId is required.' }, { status: 400 });
      const config = await setQuizLink(chapterId, url);
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'add-announcement') {
      const title = String((body as Record<string, unknown>).title ?? '').trim();
      const message = String((body as Record<string, unknown>).body ?? '').trim();
      const config = await addAnnouncement(title, message);
      return NextResponse.json({ ok: true, config });
    }

    if (action === 'remove-announcement') {
      const id = String((body as Record<string, unknown>).id ?? '').trim();
      const config = await removeAnnouncement(id);
      return NextResponse.json({ ok: true, config });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('[teacher:post] error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update teacher config.' },
      { status: 500 }
    );
  }
}
