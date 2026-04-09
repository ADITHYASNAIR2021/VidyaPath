import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isValidPin } from '@/lib/auth/pin';
import { resetTeacherPin } from '@/lib/teacher-admin-db';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!getAdminSessionFromRequestCookies()) return unauthorizedJson('Admin session required.');
  const teacherId = params.id?.trim();
  if (!teacherId) return NextResponse.json({ error: 'Teacher id is required.' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
  if (!pin) return NextResponse.json({ error: 'pin is required.' }, { status: 400 });
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: 'PIN must be 4 to 8 digits.' }, { status: 400 });
  }
  try {
    await assertTeacherStorageWritable();
    const ok = await resetTeacherPin(teacherId, pin);
    if (!ok) return NextResponse.json({ error: 'Teacher not found.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset PIN.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
