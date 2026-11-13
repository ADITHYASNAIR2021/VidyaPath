import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDeveloper } from '@/lib/developer/guard';
import { getProviderCatalog, pingModel, findRegisteredModel } from '@/lib/developer/provider-catalog';
import { getUnavailableModels, resetUnavailableModels } from '@/lib/ai/generator';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';

export const dynamic = 'force-dynamic';

/** Live provider catalog: which registered models each key can still use. */
export async function GET() {
  const denied = await requireDeveloper();
  if (denied) return denied;
  const catalog = await getProviderCatalog();
  return NextResponse.json({ ok: true, data: { ...catalog, circuitBreaker: getUnavailableModels() } });
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ping'), alias: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal('ping-model'),
    provider: z.enum(['nvidia', 'gemini', 'groq', 'cerebras', 'mistral']),
    model: z.string().trim().min(1).max(160),
  }),
  z.object({ action: z.literal('reset-breaker') }),
]);

/** Ping a registered model (or any model id), or clear the model circuit breaker. */
export async function POST(req: Request) {
  const denied = await requireDeveloper();
  if (denied) return denied;
  const body = await parseAndValidateJsonBody(req, 4 * 1024, actionSchema);
  if (!body.ok) {
    return NextResponse.json({ ok: false, errorCode: body.reason, message: body.message }, { status: bodyReasonToStatus(body.reason) });
  }
  const input = body.value;
  if (input.action === 'reset-breaker') {
    resetUnavailableModels();
    return NextResponse.json({ ok: true, data: { reset: true } });
  }
  if (input.action === 'ping') {
    const model = findRegisteredModel(input.alias);
    if (!model) return NextResponse.json({ ok: false, errorCode: 'unknown-alias', message: 'Unknown model alias.' }, { status: 404 });
    return NextResponse.json({ ok: true, data: await pingModel(model.provider, model.model) });
  }
  return NextResponse.json({ ok: true, data: await pingModel(input.provider, input.model) });
}
