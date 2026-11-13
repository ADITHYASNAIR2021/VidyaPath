import { withAiMetrics } from '@/lib/ai/with-ai-metrics';
import { z } from 'zod';
import { requirePublicAiAccess } from '@/lib/ai/public-access';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { bodyReasonToStatus, parseAndValidateJsonBody } from '@/lib/http/request-body';
import { recordAiQualityFeedback } from '@/lib/ai/quality-store';

export const dynamic = 'force-dynamic';

const feedbackSchema = z.object({
  issueType: z.enum(['unsafe-answer', 'weak-grounding', 'missing-citation', 'hallucination-flag', 'other']),
  task: z.string().trim().max(80).optional(),
  chapterId: z.string().trim().max(120).optional(),
  responseId: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});

async function handlePost(req: Request) {
  const requestId = getRequestId(req);
  const { response } = await requirePublicAiAccess(req);
  if (response) return response;
  const bodyResult = await parseAndValidateJsonBody(req, 12 * 1024, feedbackSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }
  try {
    await recordAiQualityFeedback({
      task: (bodyResult.value.task as
        | 'chat'
        | 'flashcards'
        | 'mcq'
        | 'adaptive-test'
        | 'revision-plan'
        | 'paper-evaluate'
        | 'chapter-pack'
        | 'chapter-drill'
        | 'chapter-diagnose'
        | 'chapter-remediate'
        | 'unknown'
        | undefined) ?? 'unknown',
      chapterId: bodyResult.value.chapterId,
      responseId: bodyResult.value.responseId,
      issueType: bodyResult.value.issueType,
      note: bodyResult.value.note,
    });
    return dataJson({ requestId, data: { ok: true } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'ai-quality-feedback-failed',
      message: error instanceof Error ? error.message : 'Failed to record AI feedback.',
      status: 500,
    });
  }
}

export const POST = withAiMetrics('/api/ai/quality-feedback', handlePost);
