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
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { announcementReadSchema } from '@/lib/schemas/engagement';
import { getSupabaseAccessTokenFromRequest } from '@/lib/auth/supabase-auth';
import { getUserClient } from '@/lib/supabase-rest';

const READS_TABLE = 'announcement_reads';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseAndValidateJsonBody(req, 4 * 1024, announcementReadSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const accessToken = getSupabaseAccessTokenFromRequest(req);
    if (!accessToken) {
      return errorJson({
        requestId,
        errorCode: 'supabase-session-required',
        message: 'Supabase access token is required to mark announcements as read.',
        status: 401,
      });
    }
    const client = getUserClient(accessToken);

    const body = bodyResult.value;
    const announcementId = body.announcementId.trim();

    const studentSession = await getStudentSessionFromRequestCookies();
    const studentId = context?.profileId || studentSession?.studentId || context?.authUserId || '';
    const schoolId = context?.schoolId || studentSession?.schoolId || null;
    if (!studentId) {
      return errorJson({ requestId, errorCode: 'no-profile', message: 'Student profile not found.', status: 403 });
    }

    // Check if already read (idempotent)
    try {
      const { data: existing, error: selectError } = await client
        .from(READS_TABLE)
        .select('id')
        .eq('announcement_id', announcementId)
        .eq('student_id', studentId)
        .limit(1);
      if (selectError) throw selectError;
      if (existing.length > 0) {
        return dataJson({ requestId, data: { alreadyRead: true } });
      }
    } catch {
      // Table doesn't exist yet — silently succeed (graceful degradation)
      return dataJson({ requestId, data: { alreadyRead: false, skipped: true } });
    }

    const { error: insertError } = await client.from(READS_TABLE).insert({
      announcement_id: announcementId,
      student_id: studentId,
      school_id: schoolId,
      read_at: new Date().toISOString(),
    });
    if (insertError) {
      return errorJson({
        requestId,
        errorCode: 'read-record-failed',
        message: insertError.message || 'Failed to record read.',
        status: 500,
      });
    }

    return dataJson({ requestId, data: { alreadyRead: false } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record read.';
    return errorJson({ requestId, errorCode: 'read-record-failed', message, status: 500 });
  }
}
