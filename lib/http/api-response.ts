import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export interface ApiErrorBody {
  ok: false;
  errorCode: string;
  message: string;
  error?: string;
  requestId: string;
  hint?: string;
}

export interface ApiSuccessBody<T> {
  ok: true;
  requestId: string;
  data: T;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
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
}): NextResponse {
  const status = Number.isFinite(input.status) ? Number(input.status) : 400;
  const body: ApiErrorBody = {
    ok: false,
    errorCode: input.errorCode,
    message: input.message,
    error: input.message,
    requestId: input.requestId,
    hint: input.hint,
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
