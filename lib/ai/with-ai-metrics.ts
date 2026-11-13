import { recordAiRequest } from '@/lib/ai/usage-metrics';

/**
 * Wraps a public AI route handler to record request count, outcome (ok / 4xx / 429 / 5xx)
 * and latency for the developer console. Never changes the response.
 */
export function withAiMetrics<R extends Request>(endpoint: string, handler: (req: R) => Promise<Response>) {
  return async (req: R): Promise<Response> => {
    const started = Date.now();
    let status = 500;
    try {
      const response = await handler(req);
      status = response.status;
      return response;
    } finally {
      recordAiRequest({ endpoint, status, latencyMs: Date.now() - started });
    }
  };
}
