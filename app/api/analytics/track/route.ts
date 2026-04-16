import { trackAiQuestion, trackChapterView, trackSearchNoResult } from '@/lib/analytics-store';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

interface TrackPayload {
  eventName?: string;
  chapterId?: string;
  query?: string;
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit({
      key: buildRateLimitKey('analytics:track', [ip]),
      windowSeconds: 60,
      maxRequests: 60,
      blockSeconds: 120,
    });
    if (!rateLimit.allowed) {
      return dataJson({ requestId, data: { ok: true } }); // silent drop — don't expose rate limit to trackers
    }

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
