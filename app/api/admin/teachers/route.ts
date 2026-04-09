import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { isValidPin } from '@/lib/auth/pin';
import { createTeacher, listTeachers } from '@/lib/teacher-admin-db';
import type { TeacherScope } from '@/lib/teacher-types';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export const dynamic = 'force-dynamic';

interface CreateTeacherRequest {
  phone: string;
  name: string;
  pin: string;
  staffCode?: string;
  password?: string;
  scopes?: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>;
}

function parseCreateTeacher(value: unknown): CreateTeacherRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const staffCode = typeof body.staffCode === 'string' ? body.staffCode.trim() : undefined;
  const password = typeof body.password === 'string' ? body.password.trim() : undefined;
  if (!phone || !name || !pin) return null;
  if (!isValidPin(pin)) return null;
  const scopes: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }> = [];
  if (Array.isArray(body.scopes)) {
    body.scopes.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const scope = item as Record<string, unknown>;
      const classLevel = Number(scope.classLevel);
      const subject = typeof scope.subject === 'string' ? scope.subject.trim() : '';
      const section = typeof scope.section === 'string' ? scope.section.trim() : undefined;
      if ((classLevel !== 10 && classLevel !== 12) || !subject || !isSupportedSubject(subject)) return;
      scopes.push({ classLevel: classLevel as 10 | 12, subject: subject as TeacherScope['subject'], section });
    });
  }
  return { phone, name, pin, staffCode, password, scopes };
}

export async function GET() {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const teachers = await listTeachers(adminSession.role === 'admin' ? adminSession.schoolId : undefined);
  return NextResponse.json({ teachers });
}

export async function POST(req: Request) {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const body = await req.json().catch(() => null);
  const parsed = parseCreateTeacher(body);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid request. Required: { phone, name, pin, scopes? }' },
      { status: 400 }
    );
  }
  try {
    await assertTeacherStorageWritable();
    const schoolId = adminSession.role === 'developer'
      ? (body && typeof body === 'object' && typeof (body as Record<string, unknown>).schoolId === 'string'
          ? String((body as Record<string, unknown>).schoolId).trim()
          : undefined)
      : adminSession.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: 'School scope missing for admin session.' }, { status: 400 });
    }
    const teacher = await createTeacher({ ...parsed, schoolId });
    return NextResponse.json({ teacher });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create teacher.';
    const status = /required|valid|pin|subject/i.test(message)
      ? 400
      : /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message)
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
