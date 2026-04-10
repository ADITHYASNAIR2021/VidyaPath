import { trackAiQuestion, trackChapterView, trackSearchNoResult } from '@/lib/analytics-store';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';

interface TrackPayload {
  eventName?: string;
  chapterId?: string;
  query?: string;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const bodyResult = await parseJsonBodyWithLimit<TrackPayload>(req, 8 * 1024);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
      });
    }
    const body = bodyResult.value as TrackPayload | null;
    if (!body || typeof body !== 'object' || typeof body.eventName !== 'string') {
      return errorJson({
        requestId,
        errorCode: 'invalid-analytics-payload',
        message: 'Invalid analytics payload.',
        status: 400,
      });
    }

    const eventName = body.eventName.trim();
    if (eventName === 'chapter_view' && body.chapterId) {
      await trackChapterView(body.chapterId);
    } else if (eventName === 'ai_question' && body.chapterId) {
      await trackAiQuestion(body.chapterId);
    } else if (eventName === 'search_no_result' && body.query) {
      await trackSearchNoResult(body.query);
    }

    return dataJson({ requestId, data: { ok: true } });
  } catch (error) {
    console.error('[analytics-track] error', error);
    return dataJson({ requestId, data: { ok: true } });
  }
}
