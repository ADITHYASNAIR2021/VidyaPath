import { recordAiRequest } from '@/lib/ai/usage-metrics';
import { NextResponse } from 'next/server';
import { AI_BOUNDARY_POLICY_VERSION, inspectAiPayload, recordBoundaryBlock } from '@/lib/ai/boundary-policy';
import { inspectSemanticPayload } from '@/lib/ai/semantic-guard';

/**
 * Wraps a public AI route handler to record request count, outcome (ok / 4xx / 429 / 5xx)
 * and latency for the developer console. Also rejects unsafe successful JSON results.
 */
export function withAiMetrics<R extends Request>(endpoint: string, handler: (req: R) => Promise<Response>) {
  return async (req: R): Promise<Response> => {
    const started = Date.now();
    let status = 500;
    try {
      const response = await handler(req);
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const payload = await response.clone().json();
        try {
          if (!await inspectSemanticPayload(payload, 'output')) {
            status = 502;
            return NextResponse.json({ ok: false, errorCode: 'unsafe-ai-output', message: 'The result did not pass the safety check.' }, { status });
          }
        } catch {
          status = 503;
          return NextResponse.json({ ok: false, errorCode: 'guard-unavailable', message: 'The safety check is unavailable. Try again later.' }, { status });
        }
        const issue = inspectAiPayload(payload, 'output');
        if (issue) {
          recordBoundaryBlock('output', issue);
          status = 502;
          return NextResponse.json({ ok: false, errorCode: 'unsafe-ai-output', message: 'The generated result did not pass safety checks. Please try a curriculum question again.' }, { status, headers: { 'Cache-Control': 'no-store' } });
        }
      }
      response.headers.set('X-AI-Policy-Version', AI_BOUNDARY_POLICY_VERSION);
      response.headers.set('Cache-Control', 'private, no-store');
      status = response.status;
      return response;
    } finally {
      recordAiRequest({ endpoint, status, latencyMs: Date.now() - started });
    }
  };
}
