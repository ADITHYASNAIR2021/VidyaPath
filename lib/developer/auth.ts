import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Developer console access — the only protected area of VidyaPath.
 *
 * Students never log in. The operator sets DEVELOPER_DASHBOARD_KEY (24+ random chars)
 * and enters it once at /developer; the server issues a short-lived HttpOnly cookie
 * signed with that key. Rotating the key immediately invalidates every session.
 */

export const DEVELOPER_COOKIE = 'vp_dev_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_KEY_LENGTH = 24;

export type DeveloperKeyStatus = 'ok' | 'missing' | 'too-short';

export function getDeveloperKeyStatus(): DeveloperKeyStatus {
  const key = (process.env.DEVELOPER_DASHBOARD_KEY || '').trim();
  if (!key) return 'missing';
  if (key.length < MIN_KEY_LENGTH) return 'too-short';
  return 'ok';
}

function getKey(): string | null {
  return getDeveloperKeyStatus() === 'ok' ? (process.env.DEVELOPER_DASHBOARD_KEY || '').trim() : null;
}

function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

function sign(key: string, expiresAt: number): string {
  return createHmac('sha256', key).update(`vp-dev:${expiresAt}`).digest('base64url');
}

/** Constant-time comparison of a submitted key against DEVELOPER_DASHBOARD_KEY. */
export function isValidDeveloperKey(submitted: unknown): boolean {
  const key = getKey();
  if (!key || typeof submitted !== 'string' || !submitted) return false;
  return timingSafeEqual(sha256(submitted.trim()), sha256(key));
}

export function createDeveloperSessionValue(nowMs = Date.now()): { value: string; maxAgeSeconds: number } | null {
  const key = getKey();
  if (!key) return null;
  const expiresAt = nowMs + SESSION_TTL_MS;
  return { value: `${expiresAt}.${sign(key, expiresAt)}`, maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

export function verifyDeveloperSessionValue(value: string | undefined, nowMs = Date.now()): boolean {
  const key = getKey();
  if (!key || !value) return false;
  const [expiresRaw, signature] = value.split('.');
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs || !signature) return false;
  const expected = sign(key, expiresAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hasDeveloperSession(): Promise<boolean> {
  const store = await cookies();
  return verifyDeveloperSessionValue(store.get(DEVELOPER_COOKIE)?.value);
}

export function developerCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
