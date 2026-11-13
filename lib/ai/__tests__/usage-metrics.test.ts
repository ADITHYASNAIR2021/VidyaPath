import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__vidyapathRuntimeState__;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('usage metrics (memory backend)', () => {
  it('aggregates requests, outcomes, latency and tokens per endpoint and model', async () => {
    const { recordAiRequest, recordAiTokens, getUsageSummary } = await import('@/lib/ai/usage-metrics');
    recordAiRequest({ endpoint: '/api/generate-quiz', status: 200, latencyMs: 1000 });
    recordAiRequest({ endpoint: '/api/generate-quiz', status: 429, latencyMs: 10 });
    recordAiRequest({ endpoint: '/api/ai-tutor', status: 502, latencyMs: 3000 });
    recordAiTokens({ endpoint: '/api/generate-quiz', provider: 'gemini', model: 'gemini-3.5-flash-lite', totalTokens: 1200 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const summary = await getUsageSummary(2);
    expect(summary.backend).toBe('memory');
    expect(summary.days[0]).toMatchObject({ requests: 3, ok: 1, limited: 1, errors: 1, tokens: 1200 });
    const quiz = summary.today.endpoints.find((row) => row.endpoint === '/api/generate-quiz');
    expect(quiz).toMatchObject({ requests: 2, ok: 1, limited: 1, tokens: 1200, avgLatencyMs: 505 });
    expect(summary.today.models[0]).toMatchObject({ provider: 'gemini', model: 'gemini-3.5-flash-lite', calls: 1, tokens: 1200 });
  });
});
