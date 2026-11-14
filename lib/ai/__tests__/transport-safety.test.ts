import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { inspectSemanticPayload } from '@/lib/ai/semantic-guard';
import { getClientIp, errorJson } from '@/lib/http/api-response';
import { redactTelemetryEvent, redactSpanData } from '@/lib/observability/privacy';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('transport, privacy and optional classifier', () => {
  it('stops buffering an oversized chunked body even without Content-Length', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100)); }, cancel });
    const request = new Request('http://localhost/api/context-pack', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect((await parseJsonBodyWithLimit(request, 32)).ok).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });
  it('fails closed when a configured classifier is unavailable', async () => {
    vi.stubEnv('AI_INJECTION_GUARD_URL', 'http://127.0.0.1:8899/classify');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(inspectSemanticPayload('unique classifier outage sample', 'request')).rejects.toThrow(/unavailable/);
  });
  it('does not trust arbitrary forwarding headers in production', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL', ''); vi.stubEnv('TRUSTED_PROXY_HEADER', '');
    expect(getClientIp(new Request('https://example.com', { headers: { 'x-forwarded-for': '203.0.113.5', 'x-client-ip': '203.0.113.6' } }))).toBe('unknown');
  });
  it('uses the platform-controlled Vercel address ahead of a client-supplied value', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL', '1');
    expect(getClientIp(new Request('https://example.com', { headers: { 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': '198.51.100.8' } }))).toBe('203.0.113.5');
  });
  it('does not expose upstream errors in public hints', async () => {
    const response = errorJson({ requestId: 'test', errorCode: 'upstream', status: 502, message: 'failed', hint: 'provider echoed a private answer' });
    expect((await response.json()).hint).toBeUndefined();
  });
  it('strips student payloads, auth data and query strings from telemetry', () => {
    const event = redactTelemetryEvent({ request: { data: 'private student answer', headers: { Authorization: 'secret' }, cookies: 'secret', url: 'https://example.com/api/ai-tutor?key=secret' }, user: { email: 'private@example.com' }, extra: { image: 'private' }, breadcrumbs: ['private'] });
    expect(event).toEqual({ request: { url: 'https://example.com/api/ai-tutor' } });
    expect(redactSpanData({ data: { 'gen_ai.input.messages': 'private', 'http.url': 'https://api.example.com?key=secret', count: 1 } })).toEqual({ data: { 'http.url': 'https://api.example.com/', count: 1 } });
  });
});
