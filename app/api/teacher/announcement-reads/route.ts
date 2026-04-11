/**
 * GET /api/teacher/announcement-reads?announcementId=xxx
 * Returns read counts for a specific announcement (teacher only).
 * Also supports: ?announcementIds=id1,id2,id3 for batch read counts.
 */
import { NextRequest } from 'next/server';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { supabaseSelect } from '@/lib/supabase-rest';

const READS_TABLE = 'announcement_reads';

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    if (context?.role !== 'teacher' && context?.role !== 'admin' && context?.role !== 'developer') {
      return errorJson({ requestId, errorCode: 'teacher-required', message: 'Teacher access required.', status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const announcementId = searchParams.get('announcementId')?.trim() || '';
    const announcementIdsRaw = searchParams.get('announcementIds')?.trim() || '';

    const ids = announcementId
      ? [announcementId]
      : announcementIdsRaw.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 50);

    if (ids.length === 0) {
      return errorJson({ requestId, errorCode: 'missing-announcement-id', message: 'announcementId or announcementIds required.', status: 400 });
    }

    // Fetch reads for all ids (batched via multiple selects)
    const readCounts: Record<string, number> = {};
    const readStudents: Record<string, string[]> = {};

    try {
      for (const id of ids) {
        const rows = await supabaseSelect<{ student_id: string }>(READS_TABLE, {
          select: 'student_id',
          filters: [{ column: 'announcement_id', value: id }],
          limit: 500,
        });
        readCounts[id] = rows.length;
        readStudents[id] = rows.map((r) => r.student_id);
      }
    } catch {
      // Table not yet created — return zeros gracefully
      for (const id of ids) {
        readCounts[id] = 0;
        readStudents[id] = [];
      }
    }

    return dataJson({
      requestId,
      data: {
        readCounts,
        ...(ids.length === 1 ? { readStudents: readStudents[ids[0]] } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch read receipts.';
    return errorJson({ requestId, errorCode: 'announcement-reads-failed', message, status: 500 });
  }
}
