import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { deleteTeacherQuestionBankItem, updateTeacherQuestionBankItem } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    const item = await updateTeacherQuestionBankItem({
      teacherId: session.teacher.id,
      itemId: params.id,
      prompt: typeof body?.prompt === 'string' ? body.prompt : undefined,
      options: Array.isArray(body?.options) ? body.options.filter((v: unknown): v is string => typeof v === 'string') : undefined,
      answerIndex: Number.isFinite(Number(body?.answerIndex)) ? Number(body.answerIndex) : undefined,
      rubric: typeof body?.rubric === 'string' ? body.rubric : undefined,
      maxMarks: Number.isFinite(Number(body?.maxMarks)) ? Number(body.maxMarks) : undefined,
      imageUrl: typeof body?.imageUrl === 'string' ? body.imageUrl : undefined,
    });
    if (!item) return NextResponse.json({ error: 'Question bank item not found.' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update question bank item.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const ok = await deleteTeacherQuestionBankItem(session.teacher.id, params.id);
    if (!ok) return NextResponse.json({ error: 'Question bank item not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete question bank item.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
