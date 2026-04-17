import type { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PARENT_SESSION_COOKIE = 'vp_parent_session';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14;
const COOKIE_MAX_AGE_SECONDS = Math.max(
  300,
  Math.min(60 * 60 * 24 * 30, Number(process.env.SESSION_COOKIE_MAX_AGE_SECONDS) || DEFAULT_TTL_SECONDS)
);

export interface ParentSession {
  role: 'parent';
  studentId: string;
  schoolId?: string;
  phone: string;
  parentName?: string;
  issuedAt: number;
  expiresAt: number;
}

function getSessionSecret(): string {
  return (process.env.SESSION_SIGNING_SECRET || '').trim();
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signPayload(payload: string): string {
  const secret = getSessionSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function issueToken(payload: ParentSession): string {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token: string): ParentSession | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const [encoded, providedSig] = token.split('.');
  if (!encoded || !providedSig) return null;
  const expectedSig = signPayload(encoded);
  const expected = Buffer.from(expectedSig);
  const provided = Buffer.from(providedSig);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(encoded)) as ParentSession;
    if (!parsed || parsed.role !== 'parent') return null;
    if (typeof parsed.studentId !== 'string' || !parsed.studentId.trim()) return null;
    if (typeof parsed.phone !== 'string' || !parsed.phone.trim()) return null;
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createParentSessionToken(input: {
  studentId: string;
  phone: string;
  schoolId?: string;
  parentName?: string;
}, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const issuedAt = Date.now();
  return issueToken({
    role: 'parent',
    studentId: input.studentId,
    schoolId: input.schoolId,
    phone: input.phone,
    parentName: input.parentName,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds * 1000,
  });
}

export function parseParentSession(token?: string | null): ParentSession | null {
  if (!token) return null;
  return verifyToken(token);
}

export function attachParentSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: PARENT_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearParentSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: PARENT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

