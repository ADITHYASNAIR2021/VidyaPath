import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  ok: false;
  errorCode: string;
  message: string;
  error?: string;
  requestId: string;
  hint?: string;
  /** Populated for schema-validation failures (reason = 'validation-failed'). */
  issues?: Array<{ path: string; message: string }>;
}

export interface ApiSuccessBody<T> {
  ok: true;
  requestId: string;
  data: T;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

function sanitizeServerErrorMessage(message: string): string {
  const clean = String(message || '').trim();
  if (!clean) return 'Internal server error. Please try again later.';
  if (/temporarily unavailable|service unavailable|please try again later/i.test(clean)) {
    return clean.slice(0, 180);
  }
  return 'Internal server error. Please try again later.';
}

const SENSITIVE_ERROR_PATTERN =
  /(supabase|postgres|postgresql|redis|upstash|database|sql|table|column|relation|schema|econn|enoent|eacces|permission denied|scripts\/sql|stack trace|traceback|[a-z]:\\|\/(?:var|home|tmp|usr|opt|etc)\b)/i;

function sanitizePublicErrorMessage(message: string, status: number): string {
  const clean = String(message || '').trim();
  if (status >= 500) return sanitizeServerErrorMessage(clean);
  if (!clean) return 'Request failed.';
  if (clean.length > 220 || SENSITIVE_ERROR_PATTERN.test(clean)) {
    return 'Request could not be processed. Please review input and try again.';
  }
  return clean;
}

function extractLegacyAliases(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const aliases: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key === 'ok' || key === 'requestId' || key === 'data' || key === 'meta') continue;
    aliases[key] = entry;
  }
  return aliases;
}

export function getRequestId(req: Request): string {
  const raw = req.headers.get('x-request-id')?.trim();
  if (raw && raw.length <= 120) return raw;
  return randomUUID();
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.trim();
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

export function withRequestIdHeader<T extends Response>(response: T, requestId: string): T {
  response.headers.set('x-request-id', requestId);
  return response;
}

export function errorJson(input: {
  requestId: string;
  errorCode: string;
  message: string;
  status?: number;
  hint?: string;
  issues?: Array<{ path: string; message: string }>;
}): NextResponse {
  const status = Number.isFinite(input.status) ? Number(input.status) : 400;
  const safeMessage = sanitizePublicErrorMessage(input.message, status);
  const body: ApiErrorBody = {
    ok: false,
    errorCode: input.errorCode,
    message: safeMessage,
    error: safeMessage,
    requestId: input.requestId,
    hint: input.hint,
    issues: input.issues,
  };
  return withRequestIdHeader(NextResponse.json(body, { status }), input.requestId);
}

export function dataJson<T>(input: {
  requestId: string;
  data: T;
  status?: number;
  meta?: Record<string, unknown>;
}): NextResponse {
  const status = Number.isFinite(input.status) ? Number(input.status) : 200;
  const body: ApiSuccessBody<T> = {
    ok: true,
    requestId: input.requestId,
    data: input.data,
    meta: input.meta,
    ...extractLegacyAliases(input.data),
  };
  return withRequestIdHeader(NextResponse.json(body, { status }), input.requestId);
}
