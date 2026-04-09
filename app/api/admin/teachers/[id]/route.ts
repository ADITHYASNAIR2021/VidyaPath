import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { updateTeacher } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

interface PatchTeacherRequest {
  phone?: string;
  name?: string;
  status?: 'active' | 'inactive';
}

function parsePatch(value: unknown): PatchTeacherRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const output: PatchTeacherRequest = {};
  if (typeof body.phone === 'string') output.phone = body.phone.trim();
  if (typeof body.name === 'string') output.name = body.name.trim();
  if (body.status === 'active' || body.status === 'inactive') output.status = body.status;
  if (!output.phone && !output.name && !output.status) return null;
  return output;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const teacherId = params.id?.trim();
  if (!teacherId) return NextResponse.json({ error: 'Teacher id is required.' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = parsePatch(body);
  if (!parsed) return NextResponse.json({ error: 'Invalid patch payload.' }, { status: 400 });
  try {
    await assertTeacherStorageWritable();
    const teacher = await updateTeacher(teacherId, parsed, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!teacher) return NextResponse.json({ error: 'Teacher not found.' }, { status: 404 });
    return NextResponse.json({ teacher });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update teacher.';
    const status = /required|valid|phone|name/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
