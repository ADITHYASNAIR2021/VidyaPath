import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import { applyAiRequestPolicy } from '@/lib/ai/request-policy';
import { getAiToolPolicy } from '@/lib/ai/tool-registry';
import { inspectSemanticPayload } from '@/lib/ai/semantic-guard';

export interface JsonBodyParseSuccess<T> {
  ok: true;
  value: T;
}

export interface JsonBodyParseFailure {
  ok: false;
  reason: 'payload-too-large' | 'invalid-json' | 'empty-body' | 'validation-failed' | 'unsafe-input' | 'guard-unavailable';
  message: string;
  /** Populated only when `reason === 'validation-failed'`. */
  issues?: Array<{ path: string; message: string }>;
}

export type JsonBodyParseResult<T> = JsonBodyParseSuccess<T> | JsonBodyParseFailure;

export async function parseJsonBodyWithLimit<T = unknown>(
  req: Request,
  maxBytes: number
): Promise<JsonBodyParseResult<T>> {
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      reason: 'payload-too-large',
      message: `Payload too large. Max allowed is ${maxBytes} bytes.`,
    };
  }

  // Count streamed bytes before buffering; Content-Length may be missing or false.
  const reader = req.body?.getReader();
  const buffers: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: 'payload-too-large', message: `Payload too large. Max allowed is ${maxBytes} bytes.` };
        }
        buffers.push(value);
      }
    } catch {
      return { ok: false, reason: 'invalid-json', message: 'Could not read request body.' };
    } finally { reader.releaseLock(); }
  }
  const raw = Buffer.concat(buffers).toString('utf8');
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      reason: 'empty-body',
      message: 'Request body is required.',
    };
  }

  const actualBytes = Buffer.byteLength(raw, 'utf8');
  if (actualBytes > maxBytes) {
    return {
      ok: false,
      reason: 'payload-too-large',
      message: `Payload too large. Max allowed is ${maxBytes} bytes.`,
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(raw) as T,
    };
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      message: 'Invalid JSON payload.',
    };
  }
}

/**
 * Parse a JSON body and validate it against a Zod schema. Returns the same
 * shape as {@link parseJsonBodyWithLimit} so routes can migrate with a
 * single line change:
 *
 * ```diff
 * - const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 16 * 1024);
 * + const bodyResult = await parseAndValidateJsonBody(req, 16 * 1024, loginSchema);
 * ```
 *
 * On validation failure, `reason === 'validation-failed'` and `issues` is
 * populated. Callers that use `errorJson({ reason, message, status })` will
 * want to map that reason to 422.
 */
export async function parseAndValidateJsonBody<S extends ZodTypeAny>(
  req: Request,
  maxBytes: number,
  schema: S
): Promise<JsonBodyParseResult<ZodInfer<S>>> {
  const raw = await parseJsonBodyWithLimit<unknown>(req, maxBytes);
  if (!raw.ok) return raw;
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation-failed',
      message: 'Request body failed validation.',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }
  const policy = applyAiRequestPolicy(new URL(req.url).pathname, parsed.data);
  if (policy.error) return { ok: false, reason: 'unsafe-input', message: policy.error };
  if (getAiToolPolicy(new URL(req.url).pathname)) {
    try {
      if (!await inspectSemanticPayload(policy.value, 'request')) return { ok: false, reason: 'unsafe-input', message: 'The request did not pass the instruction safety check.' };
    } catch { return { ok: false, reason: 'guard-unavailable', message: 'The safety check is unavailable. Please try again later.' }; }
  }
  return { ok: true, value: policy.value as ZodInfer<S> };
}

/** Map a body-parse reason to an HTTP status code. */
export function bodyReasonToStatus(reason: JsonBodyParseFailure['reason']): number {
  switch (reason) {
    case 'guard-unavailable':
      return 503;
    case 'payload-too-large':
      return 413;
    case 'validation-failed':
    case 'unsafe-input':
      return 422;
    case 'invalid-json':
    case 'empty-body':
    default:
      return 400;
  }
}
