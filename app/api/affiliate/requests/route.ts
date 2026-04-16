import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createAffiliateRequest } from '@/lib/onboarding-db';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const endpoint = '/api/affiliate/requests';
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('affiliate:request', [ip]),
    windowSeconds: 3600,
    maxRequests: 5,
    blockSeconds: 3600,
  });
  if (!rateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many requests. Please try again later.',
      status: 429,
    });
  }
  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  try {
    const request = await createAffiliateRequest({
      schoolName: typeof body.schoolName === 'string' ? body.schoolName : '',
      schoolCodeHint: typeof body.schoolCodeHint === 'string' ? body.schoolCodeHint : undefined,
      board: typeof body.board === 'string' ? body.board : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      affiliateNo: typeof body.affiliateNo === 'string' ? body.affiliateNo : undefined,
      websiteUrl: typeof body.websiteUrl === 'string' ? body.websiteUrl : undefined,
      contactName: typeof body.contactName === 'string' ? body.contactName : '',
      contactPhone: typeof body.contactPhone === 'string' ? body.contactPhone : '',
      contactEmail: typeof body.contactEmail === 'string' ? body.contactEmail : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'affiliate-request-created',
      statusCode: 201,
      actorRole: 'system',
      metadata: {
        affiliateRequestId: request.id,
        schoolName: request.schoolName,
      },
    });
    logServerEvent({
      event: 'affiliate-request-created',
      requestId,
      endpoint,
      statusCode: 201,
      details: { affiliateRequestId: request.id },
    });
    return dataJson({
      requestId,
      status: 201,
      data: {
        request,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit affiliate request.';
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'affiliate-request-create-failed',
      statusCode: /required|valid/i.test(message) ? 400 : 500,
      actorRole: 'system',
      metadata: {
        message: message.slice(0, 300),
        ip: getClientIp(req),
      },
    });
    return errorJson({
      requestId,
      errorCode: 'affiliate-request-create-failed',
      message,
      status: /required|valid/i.test(message) ? 400 : 500,
    });
  }
}
