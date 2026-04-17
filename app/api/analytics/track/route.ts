import { trackAiQuestion, trackChapterView, trackSearchNoResult } from '@/lib/analytics-store';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { trackEventSchema } from '@/lib/schemas/analytics';
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

    const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, trackEventSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
      });
    }
    const body = bodyResult.value;
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
