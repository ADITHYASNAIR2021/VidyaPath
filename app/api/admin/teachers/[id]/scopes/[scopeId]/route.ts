import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { deleteTeacherScope } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export async function DELETE(_req: Request, { params }: { params: { id: string; scopeId: string } }) {
  if (!getAdminSessionFromRequestCookies()) return unauthorizedJson('Admin session required.');
  const teacherId = params.id?.trim();
  const scopeId = params.scopeId?.trim();
  if (!teacherId || !scopeId) {
    return NextResponse.json({ error: 'teacher id and scope id are required.' }, { status: 400 });
  }
  try {
    await assertTeacherStorageWritable();
    const ok = await deleteTeacherScope(teacherId, scopeId);
    if (!ok) return NextResponse.json({ error: 'Scope not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove scope.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

