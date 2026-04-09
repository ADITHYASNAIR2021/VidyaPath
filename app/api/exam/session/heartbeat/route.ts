import { NextResponse } from 'next/server';
import { assertTeacherStorageWritable } from '@/lib/persistence/teacher-storage';
import { getAssignmentPack, getExamSession, recordExamHeartbeat } from '@/lib/teacher-admin-db';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import type { ExamViolationEvent } from '@/lib/teacher-types';

const EXAM_VIOLATION_TYPES: ExamViolationEvent['type'][] = [
  'fullscreen-exit',
  'tab-hidden',
  'window-blur',
  'copy-attempt',
  'paste-attempt',
  'context-menu',
  'key-shortcut',
];

function parseEvents(value: unknown): ExamViolationEvent[] {
  if (!Array.isArray(value)) return [];
  const parsed: ExamViolationEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const event = item as Record<string, unknown>;
    const rawType = typeof event.type === 'string' ? event.type.trim() : '';
    if (!EXAM_VIOLATION_TYPES.includes(rawType as ExamViolationEvent['type'])) continue;
    parsed.push({
      type: rawType as ExamViolationEvent['type'],
      occurredAt: typeof event.occurredAt === 'string' ? event.occurredAt : new Date().toISOString(),
      detail: typeof event.detail === 'string' ? event.detail : undefined,
    });
  }
  return parsed;
}

export async function POST(req: Request) {
  try {
    await assertTeacherStorageWritable();
    const studentSession = await getStudentSessionFromRequestCookies();
    if (!studentSession) {
      return NextResponse.json({ error: 'Student login required.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
    }
    const session = await getExamSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Exam session not found.' }, { status: 404 });
    }
    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Exam session is already closed.' }, { status: 409 });
    }
    if (session.submissionCode.toUpperCase() !== studentSession.rollCode.toUpperCase()) {
      return NextResponse.json({ error: 'Session identity mismatch. Please login again.' }, { status: 403 });
    }
    const pack = await getAssignmentPack(session.packId);
    if (!pack || pack.status !== 'published') {
      return NextResponse.json({ error: 'Assignment pack not found.' }, { status: 404 });
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

    const events = parseEvents(body?.events);
    const data = await recordExamHeartbeat({ sessionId, events });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update exam session.';
    const status = /supabase|storage|missing table|scripts\/sql\/supabase_init\.sql/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
