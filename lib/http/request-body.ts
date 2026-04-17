import type { ZodTypeAny, infer as ZodInfer } from 'zod';

export interface JsonBodyParseSuccess<T> {
  ok: true;
  value: T;
}

export interface JsonBodyParseFailure {
  ok: false;
  reason: 'payload-too-large' | 'invalid-json' | 'empty-body' | 'validation-failed';
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

  const raw = await req.text().catch(() => '');
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
  return { ok: true, value: parsed.data };
}

/** Map a body-parse reason to an HTTP status code. */
export function bodyReasonToStatus(reason: JsonBodyParseFailure['reason']): number {
  switch (reason) {
    case 'payload-too-large':
      return 413;
    case 'validation-failed':
      return 422;
    case 'invalid-json':
    case 'empty-body':
    default:
      return 400;
  }
}
