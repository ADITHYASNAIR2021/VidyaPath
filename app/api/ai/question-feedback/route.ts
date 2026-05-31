import { recordQuestionOutcomes } from '@/lib/ai/question-history';
import { recordAiQualityFeedback } from '@/lib/ai/quality-store';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { logger } from '@/lib/logger';
import { questionFeedbackRequestSchema } from '@/lib/schemas/ai';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth(req);
    if (authResponse) return authResponse;

    const limit = await checkRateLimit({
      key: buildRateLimitKey('ai:question-feedback', [context?.authUserId || getClientIp(req), context?.schoolId]),
      windowSeconds: 60,
      maxRequests: 30,
      blockSeconds: 120,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many quiz feedback requests. Please retry shortly.',
        status: 429,
        hint: `Retry after ${limit.retryAfterSeconds}s`,
      });
    }

    const bodyResult = await parseAndValidateJsonBody(req, 24 * 1024, questionFeedbackRequestSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const payload = bodyResult.value;
    await recordQuestionOutcomes({
      authUserId: context?.authUserId,
      chapterId: payload.chapterId,
      results: payload.results,
    });

    if (payload.issueType || payload.retrievalMiss === true || payload.hallucinationFlag === true) {
      await recordAiQualityFeedback({
        schoolId: context?.schoolId,
        authUserId: context?.authUserId,
        role: context?.role,
        task: payload.task ?? 'unknown',
        chapterId: payload.chapterId,
        subject: payload.subject,
        provider: payload.provider,
        model: payload.model,
        responseId: payload.responseId,
        retrievalMiss: payload.retrievalMiss === true,
        hallucinationFlag: payload.hallucinationFlag === true,
        issueType:
          payload.issueType ??
          (payload.hallucinationFlag === true
            ? 'hallucination-flag'
            : payload.retrievalMiss === true
              ? 'weak-grounding'
              : 'other'),
        note: payload.note,
      });
    }

    return dataJson({
      requestId,
      data: {
        recorded: payload.results.length,
        chapterId: payload.chapterId,
        qualityFeedbackRecorded:
          !!payload.issueType || payload.retrievalMiss === true || payload.hallucinationFlag === true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, '[question-feedback] error');
    return errorJson({
      requestId,
      errorCode: 'question-feedback-failed',
      message: 'Unable to record quiz feedback right now.',
      status: 500,
    });
  }
}
