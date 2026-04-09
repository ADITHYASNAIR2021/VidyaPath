import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { addTeacherScope, getTeacherById } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import type { TeacherScope } from '@/lib/teacher-types';

export const dynamic = 'force-dynamic';

interface ScopeRequest {
  classLevel: 10 | 12;
  subject: TeacherScope['subject'];
  section?: string;
}

function parseScope(value: unknown): ScopeRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const classLevel = Number(body.classLevel);
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const section = typeof body.section === 'string' ? body.section.trim() : undefined;
  if ((classLevel !== 10 && classLevel !== 12) || !subject || !isSupportedSubject(subject)) return null;
  return {
    classLevel: classLevel as 10 | 12,
    subject: subject as TeacherScope['subject'],
    section,
  };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const teacherId = params.id?.trim();
  if (!teacherId) return NextResponse.json({ error: 'Teacher id is required.' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const parsed = parseScope(body);
  if (!parsed) return NextResponse.json({ error: 'Invalid scope payload.' }, { status: 400 });
  try {
    await assertTeacherStorageWritable();
    const teacher = await getTeacherById(teacherId, adminSession.role === 'admin' ? adminSession.schoolId : undefined);
    if (!teacher) return NextResponse.json({ error: 'Teacher not found.' }, { status: 404 });
    const scope = await addTeacherScope(teacherId, parsed);
    return NextResponse.json({ scope });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add scope.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
