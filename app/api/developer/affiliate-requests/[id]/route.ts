import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { updateAffiliateRequestSchema } from '@/lib/schemas/developer-ops';
import { reviewAffiliateRequest } from '@/lib/onboarding-db';
import { logServerEvent } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const endpoint = '/api/developer/affiliate-requests/[id]';
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);
  const affiliateRequestId = params.id?.trim();
  if (!affiliateRequestId) {
    return errorJson({
      requestId,
      errorCode: 'missing-affiliate-request-id',
      message: 'Affiliate request id is required.',
      status: 400,
    });
  }
  const bodyResult = await parseAndValidateJsonBody(req, 48 * 1024, updateAffiliateRequestSchema);
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
  const decision = body.decision === 'approve' || body.decision === 'reject' ? body.decision : '';
  if (!decision) {
    return errorJson({
      requestId,
      errorCode: 'invalid-affiliate-review-decision',
      message: 'decision must be either approve or reject.',
      status: 400,
    });
  }

  try {
    const reviewed = await reviewAffiliateRequest({
      requestId: affiliateRequestId,
      decision,
      reviewerAuthUserId: session.authUserId,
      reviewNotes: typeof body.reviewNotes === 'string' ? body.reviewNotes : undefined,
      schoolCode: typeof body.schoolCode === 'string' ? body.schoolCode : undefined,
      board: typeof body.board === 'string' ? body.board : undefined,
      city: typeof body.city === 'string' ? body.city : undefined,
      state: typeof body.state === 'string' ? body.state : undefined,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint,
      action: `developer-affiliate-request-${decision}`,
      statusCode: 200,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      schoolId: reviewed.linkedSchool?.id,
      metadata: {
        affiliateRequestId,
        decision,
        committedAt,
      },
    });
    logServerEvent({
      event: 'developer-affiliate-request-reviewed',
      requestId,
      endpoint,
      role: 'developer',
      schoolId: reviewed.linkedSchool?.id,
      statusCode: 200,
      details: {
        affiliateRequestId,
        decision,
      },
    });
    return dataJson({
      requestId,
      data: reviewed,
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to review affiliate request.';
    await recordAuditEvent({
      requestId,
      endpoint,
      action: 'developer-affiliate-request-review-failed',
      statusCode: /required|invalid|not found/i.test(message) ? 400 : 500,
      actorRole: 'developer',
      actorAuthUserId: session.authUserId,
      metadata: {
        affiliateRequestId,
        decision,
        message: message.slice(0, 300),
        ip: getClientIp(req),
      },
    });
    return errorJson({
      requestId,
      errorCode: 'developer-affiliate-request-review-failed',
      message,
      status: /required|invalid/i.test(message) ? 400 : (/not found/i.test(message) ? 404 : 500),
    });
  }
}
