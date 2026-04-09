import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { releaseSubmissionResults } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

function parseSubmissionIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    ids.push(normalized);
  }
  return ids.length > 0 ? ids : undefined;
}

export async function POST(req: Request) {
  try {
    const session = await getTeacherSessionFromRequestCookies();
    if (!session) return NextResponse.json({ error: 'Unauthorized teacher access.' }, { status: 401 });
    await assertTeacherStorageWritable();

    const body = await req.json().catch(() => null);
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    const submissionIds = parseSubmissionIds(body?.submissionIds);

    if (!packId) return NextResponse.json({ error: 'packId is required.' }, { status: 400 });

    const released = await releaseSubmissionResults({
      teacherId: session.teacher.id,
      packId,
      submissionIds,
    });
    return NextResponse.json(released);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to release results.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
