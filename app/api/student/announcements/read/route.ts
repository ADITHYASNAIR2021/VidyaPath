/**
 * POST /api/student/announcements/read
 * Marks an announcement as read for the current student.
 *
 * Requires announcement_reads table in Supabase:
 * CREATE TABLE IF NOT EXISTS announcement_reads (
 *   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   announcement_id TEXT NOT NULL,
 *   student_id      TEXT NOT NULL,
 *   school_id       TEXT,
 *   read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   UNIQUE(announcement_id, student_id)
 * );
 */
import { NextRequest } from 'next/server';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { supabaseInsert, supabaseSelect } from '@/lib/supabase-rest';

const READS_TABLE = 'announcement_reads';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 4 * 1024);
    if (!bodyResult.ok) return errorJson({ requestId, errorCode: bodyResult.reason, message: bodyResult.message, status: 400 });

    const body = bodyResult.value;
    const announcementId = typeof body.announcementId === 'string' ? body.announcementId.trim() : '';
    if (!announcementId) {
      return errorJson({ requestId, errorCode: 'missing-announcement-id', message: 'announcementId is required.', status: 400 });
    }

    const studentSession = await getStudentSessionFromRequestCookies();
    const studentId = context?.profileId || studentSession?.studentId || context?.authUserId || '';
    const schoolId = context?.schoolId || studentSession?.schoolId || null;
    if (!studentId) {
      return errorJson({ requestId, errorCode: 'no-profile', message: 'Student profile not found.', status: 403 });
    }

    // Check if already read (idempotent)
    try {
      const existing = await supabaseSelect<{ id: string }>(READS_TABLE, {
        select: 'id',
        filters: [
          { column: 'announcement_id', value: announcementId },
          { column: 'student_id', value: studentId },
        ],
        limit: 1,
      });
      if (existing.length > 0) {
        return dataJson({ requestId, data: { alreadyRead: true } });
      }
    } catch {
      // Table doesn't exist yet — silently succeed (graceful degradation)
      return dataJson({ requestId, data: { alreadyRead: false, skipped: true } });
    }

    await supabaseInsert(READS_TABLE, {
      announcement_id: announcementId,
      student_id: studentId,
      school_id: schoolId,
      read_at: new Date().toISOString(),
    });

    return dataJson({ requestId, data: { alreadyRead: false } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record read.';
    return errorJson({ requestId, errorCode: 'read-record-failed', message, status: 500 });
  }
}
