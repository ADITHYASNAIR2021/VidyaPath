import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getSupabaseAccessTokenFromRequest } from '@/lib/auth/supabase-auth';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { saveAiHistorySchema } from '@/lib/schemas/teacher-history';
import { logTeacherActivity } from '@/lib/teacher/auth.db';
import { getUserClient, isSupabasePublicConfigured } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

const ACTION = 'ai_tool_generated';
const MAX_HISTORY = 10;

interface ActivityRow {
  id: number;
  teacher_id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);

  try {
    if (!isSupabasePublicConfigured()) {
      return dataJson({ requestId, data: { entries: [] } });
    }
    const accessToken = getSupabaseAccessTokenFromRequest(req);
    if (!accessToken) {
      return dataJson({ requestId, data: { entries: [] } });
    }

    const client = getUserClient(accessToken);
    const { data, error } = await client
      .from('teacher_activity')
      .select('id,metadata,created_at')
      .eq('teacher_id', teacherSession.teacher.id)
      .eq('action', ACTION)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY);
    if (error) throw new Error(error.message || 'Failed to read AI history.');
    const rows = (data || []) as ActivityRow[];

    const entries = rows.map((row) => ({
      id: String(row.id),
      toolType: row.metadata?.toolType ?? 'worksheet',
      chapterTitle: row.metadata?.chapterTitle ?? '',
      subject: row.metadata?.subject ?? '',
      difficulty: row.metadata?.difficulty ?? 'medium',
      result: row.metadata?.result ?? '',
      generatedAt: row.created_at,
    }));

    return dataJson({ requestId, data: { entries } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load AI history.';
    return errorJson({ requestId, errorCode: 'ai-history-load-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const teacherSession = await getTeacherSessionFromRequestCookies();
  if (!teacherSession) return unauthorizedJson('Teacher session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, saveAiHistorySchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { toolType, chapterTitle, subject, chapterId, difficulty, result } = bodyResult.value;
  if (typeof toolType !== 'string' || typeof result !== 'string') {
    return errorJson({ requestId, errorCode: 'missing-fields', message: 'toolType and result are required.', status: 400 });
  }

  try {
    await logTeacherActivity({
      actorType: 'teacher',
      teacherId: teacherSession.teacher.id,
      action: ACTION,
      chapterId: typeof chapterId === 'string' ? chapterId : undefined,
      metadata: {
        toolType,
        chapterTitle: typeof chapterTitle === 'string' ? chapterTitle : '',
        subject: typeof subject === 'string' ? subject : '',
        difficulty: typeof difficulty === 'string' ? difficulty : 'medium',
        // Store full result — JSONB handles it; keep reasonable max
        result: typeof result === 'string' ? result.slice(0, 15000) : '',
      },
    });
    return dataJson({ requestId, data: { saved: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save AI history.';
    return errorJson({ requestId, errorCode: 'ai-history-save-failed', message, status: 500 });
  }
}
