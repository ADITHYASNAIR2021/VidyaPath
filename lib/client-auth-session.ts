'use client';

import type { PlatformRole } from '@/lib/auth/roles';

export type ClientAuthRole = PlatformRole;

export interface ClientAuthSession {
  role: ClientAuthRole;
  authenticated: boolean;
  displayName?: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  profileId?: string;
  authUserId?: string;
  availableRoles?: string[];
  sessionExpiry?: number;
}

interface CachedAuthSession {
  value: ClientAuthSession;
  expiresAt: number;
}

const SESSION_CACHE_TTL_MS = 45_000;

let cachedSession: CachedAuthSession | null = null;
let inFlightSession: Promise<ClientAuthSession> | null = null;

function toClientAuthSession(payload: unknown): ClientAuthSession {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === 'object'
    ? root.data as Record<string, unknown>
    : root;
  const roleRaw = typeof data?.role === 'string' ? data.role : 'anonymous';
  const role: ClientAuthRole =
    roleRaw === 'student' ||
    roleRaw === 'teacher' ||
    roleRaw === 'admin' ||
    roleRaw === 'developer'
      ? roleRaw
      : 'anonymous';

  return {
    role,
    authenticated: !!data?.authenticated && role !== 'anonymous',
    displayName: typeof data?.displayName === 'string' ? data.displayName : undefined,
    schoolId: typeof data?.schoolId === 'string' ? data.schoolId : undefined,
    schoolCode: typeof data?.schoolCode === 'string' ? data.schoolCode : undefined,
    schoolName: typeof data?.schoolName === 'string' ? data.schoolName : undefined,
    profileId: typeof data?.profileId === 'string' ? data.profileId : undefined,
    authUserId: typeof data?.authUserId === 'string' ? data.authUserId : undefined,
    availableRoles: Array.isArray(data?.availableRoles)
      ? data.availableRoles.filter((item): item is string => typeof item === 'string')
      : undefined,
    sessionExpiry: typeof data?.sessionExpiry === 'number' ? data.sessionExpiry : undefined,
  };
}

export async function fetchClientAuthSession(options?: { forceRefresh?: boolean }): Promise<ClientAuthSession> {
  const forceRefresh = options?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.value;
  }
  if (!forceRefresh && inFlightSession) return inFlightSession;

  inFlightSession = fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) {
        return { role: 'anonymous', authenticated: false } satisfies ClientAuthSession;
      }
      const payload = await response.json().catch(() => null);
      return toClientAuthSession(payload);
    })
    .catch(() => ({ role: 'anonymous', authenticated: false } satisfies ClientAuthSession))
    .finally(() => {
      inFlightSession = null;
    });

  const value = await inFlightSession;
  cachedSession = {
    value,
    expiresAt: now + SESSION_CACHE_TTL_MS,
  };
  return value;
}

export function clearClientAuthSessionCache(): void {
  cachedSession = null;
}
