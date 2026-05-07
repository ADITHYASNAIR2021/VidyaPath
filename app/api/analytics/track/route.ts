import {
  trackAiQuestion,
  trackChapterView,
  trackSearchNoResult,
  trackUxEvent,
  trackUxPageLoad,
} from '@/lib/analytics-store';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { bodyReasonToStatus, parseAndValidateJsonBody } from '@/lib/http/request-body';
import { trackEventSchema } from '@/lib/schemas/analytics';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logger';

const TRUSTED_ANALYTICS_FIELDS = new Set([
  'schoolId',
  'teacherId',
  'studentId',
  'adminId',
  'developerId',
  'authUserId',
  'trusted',
  'authoritative',
]);

function containsTrustedSignals(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const keys = Object.keys(metadata as Record<string, unknown>);
  return keys.some((key) => TRUSTED_ANALYTICS_FIELDS.has(key));
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit({
      key: buildRateLimitKey('analytics:track', [ip]),
      windowSeconds: 60,
      maxRequests: 240,
      blockSeconds: 120,
    });
    if (!rateLimit.allowed) {
      // Silent drop; we do not expose analytics throttling to client trackers.
      return dataJson({ requestId, data: { ok: true } });
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
    if (containsTrustedSignals(body.metadata)) {
      return errorJson({
        requestId,
        errorCode: 'trusted-analytics-not-allowed',
        message: 'Anonymous analytics endpoint accepts only untrusted UX telemetry.',
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
    } else if (eventName === 'ux_page_load') {
      const route = typeof body.metadata?.route === 'string' ? body.metadata.route : 'unknown-route';
      const renderMs = typeof body.metadata?.renderMs === 'number' ? body.metadata.renderMs : undefined;
      const renderBucket = typeof body.metadata?.renderBucket === 'string' ? body.metadata.renderBucket : undefined;
      await trackUxPageLoad(route, renderMs, renderBucket);
    } else if (eventName === 'ux_api_request') {
      const endpoint = typeof body.metadata?.endpoint === 'string' ? body.metadata.endpoint : 'unknown-endpoint';
      const method = typeof body.metadata?.method === 'string' ? body.metadata.method.toUpperCase() : 'GET';
      await trackUxEvent('ux_api_request', `${method} ${endpoint}`);
    } else if (eventName === 'ux_api_error') {
      const endpoint = typeof body.metadata?.endpoint === 'string' ? body.metadata.endpoint : 'unknown-endpoint';
      const statusCode = Number(body.metadata?.statusCode);
      const method = typeof body.metadata?.method === 'string' ? body.metadata.method.toUpperCase() : 'GET';
      const key =
        Number.isFinite(statusCode) && statusCode > 0
          ? `${method} ${endpoint} :: ${Math.round(statusCode)}`
          : `${method} ${endpoint} :: network`;
      await trackUxEvent('ux_api_error', key);
    } else if (eventName === 'ux_route_dropoff') {
      const route = typeof body.metadata?.route === 'string' ? body.metadata.route : 'unknown-route';
      const dropped = body.metadata?.dropped === true;
      await trackUxEvent('ux_route_dropoff', dropped ? `${route} :: dropped` : `${route} :: navigated`);
    }

    return dataJson({ requestId, data: { ok: true } });
  } catch (error) {
    logger.error({ err: error }, '[analytics-track] error');
    return dataJson({ requestId, data: { ok: true } });
  }
}
