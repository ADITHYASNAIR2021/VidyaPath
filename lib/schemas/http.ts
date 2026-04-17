/**
 * HTTP validation helpers for Next.js route handlers.
 *
 * Usage:
 *
 * ```ts
 * // app/api/teacher/foo/route.ts
 * import { z } from 'zod';
 * import { validateJson, apiError } from '@/lib/schemas/http';
 *
 * const schema = z.object({ title: z.string().min(1) });
 *
 * export async function POST(req: Request) {
 *   const parsed = await validateJson(req, schema);
 *   if (!parsed.ok) return parsed.response;
 *   const { title } = parsed.data;
 *   // ... use `title`
 * }
 * ```
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

export interface ApiErrorBody {
  ok: false;
  errorCode: string;
  message: string;
  issues?: Array<{ path: string; message: string }>;
}

export function apiError(
  errorCode: string,
  message: string,
  status = 400,
  extra?: Partial<ApiErrorBody>
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { ok: false, errorCode, message, ...extra },
    { status }
  );
}

export type Validated<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<ApiErrorBody> };

function formatZodIssues(err: z.ZodError): ApiErrorBody['issues'] {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Parse + validate a JSON request body. */
export async function validateJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<Validated<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError('invalid-json', 'Request body is not valid JSON.', 400),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: apiError('validation-failed', 'Request body failed validation.', 422, {
        issues: formatZodIssues(result.error),
      }),
    };
  }
  return { ok: true, data: result.data };
}

/** Validate URL search params as a typed object. */
export function validateSearchParams<T extends z.ZodTypeAny>(
  url: URL | Request,
  schema: T
): Validated<z.infer<T>> {
  const search =
    url instanceof URL ? url.searchParams : new URL(url.url).searchParams;
  const obj: Record<string, string | string[]> = {};
  for (const key of search.keys()) {
    const values = search.getAll(key);
    obj[key] = values.length > 1 ? values : values[0];
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    return {
      ok: false,
      response: apiError('validation-failed', 'Query parameters failed validation.', 422, {
        issues: formatZodIssues(result.error),
      }),
    };
  }
  return { ok: true, data: result.data };
}

/** Validate Next.js dynamic route params (already an object). */
export function validateParams<T extends z.ZodTypeAny>(
  params: unknown,
  schema: T
): Validated<z.infer<T>> {
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      ok: false,
      response: apiError('validation-failed', 'Path parameters failed validation.', 422, {
        issues: formatZodIssues(result.error),
      }),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Convenience wrapper for JSON POST/PUT/PATCH handlers.
 *
 * ```ts
 * export const POST = withJsonSchema(schema, async (body, req) => {
 *   return NextResponse.json({ ok: true, body });
 * });
 * ```
 */
export function withJsonSchema<S extends z.ZodTypeAny, R>(
  schema: S,
  handler: (body: z.infer<S>, req: Request) => Promise<R>
) {
  return async (req: Request): Promise<R | NextResponse<ApiErrorBody>> => {
    const parsed = await validateJson(req, schema);
    if (!parsed.ok) return parsed.response;
    return handler(parsed.data, req);
  };
}
