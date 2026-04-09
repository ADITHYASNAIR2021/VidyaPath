import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { createTeacherQuestionBankItem, listTeacherQuestionBank } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export async function GET(req: Request) {
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
  const url = new URL(req.url);
  const chapterId = url.searchParams.get('chapterId')?.trim() || undefined;
  const items = await listTeacherQuestionBank(session.teacher.id, { chapterId });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
    const kind = body.kind === 'mcq' || body.kind === 'short' || body.kind === 'long' ? body.kind : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!chapterId || !kind || !prompt) {
      return NextResponse.json({ error: 'Required: chapterId, kind, prompt.' }, { status: 400 });
    }

    const item = await createTeacherQuestionBankItem({
      teacherId: session.teacher.id,
      chapterId,
      kind,
      prompt,
      options: Array.isArray(body.options) ? body.options.filter((v: unknown): v is string => typeof v === 'string') : undefined,
      answerIndex: Number.isFinite(Number(body.answerIndex)) ? Number(body.answerIndex) : undefined,
      rubric: typeof body.rubric === 'string' ? body.rubric : undefined,
      maxMarks: Number.isFinite(Number(body.maxMarks)) ? Number(body.maxMarks) : undefined,
      imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : undefined,
      section: typeof body.section === 'string' ? body.section : undefined,
    });
    if (!item) return NextResponse.json({ error: 'Failed to create question bank item.' }, { status: 500 });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create question bank item.';
    const status = /required|valid|scope|chapter|kind/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
