export interface JsonBodyParseSuccess<T> {
  ok: true;
  value: T;
}

export interface JsonBodyParseFailure {
  ok: false;
  reason: 'payload-too-large' | 'invalid-json' | 'empty-body';
  message: string;
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
