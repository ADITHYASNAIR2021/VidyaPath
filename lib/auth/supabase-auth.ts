import type { NextResponse } from 'next/server';

export const SUPABASE_ACCESS_COOKIE = 'vp_sb_access_token';
export const SUPABASE_REFRESH_COOKIE = 'vp_sb_refresh_token';
export const SUPABASE_ROLE_HINT_COOKIE = 'vp_role_hint';

interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
  serviceKey?: string;
}

export interface SupabaseAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type?: string;
  user?: {
    id: string;
    email?: string;
  };
}

export interface JwtPayload {
  sub: string;
  exp?: number;
  iat?: number;
  email?: string;
  role?: string;
}

function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rawValue] = part.split('=');
    if (!rawName || rawValue.length === 0) continue;
    if (rawName.trim() !== name) continue;
    const value = rawValue.join('=').trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function readSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceKey: serviceKey || undefined };
}

function decodeBase64Url(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string | undefined | null): JwtPayload | null {
  if (!token) return null;
  const segments = token.split('.');
  if (segments.length < 2) return null;
  const decoded = decodeBase64Url(segments[1]);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as JwtPayload;
    if (!payload || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSupabaseAccessTokenFromRequest(req: Request): string | null {
  return readCookieValue(req.headers.get('cookie'), SUPABASE_ACCESS_COOKIE);
}

export function getSupabaseRefreshTokenFromRequest(req: Request): string | null {
  return readCookieValue(req.headers.get('cookie'), SUPABASE_REFRESH_COOKIE);
}

export function isAccessTokenExpired(token: string | undefined | null, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

export function isSupabaseAuthConfigured(): boolean {
  return !!readSupabaseAuthConfig();
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<SupabaseAuthSession> {
  const config = readSupabaseAuthConfig();
  if (!config) throw new Error('Supabase Auth is not configured.');
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !json || typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    const message =
      typeof json?.msg === 'string'
        ? json.msg
        : typeof json?.error_description === 'string'
          ? json.error_description
          : typeof json?.error === 'string'
            ? json.error
            : 'Supabase login failed.';
    throw new Error(message);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: Number(json.expires_in) || 3600,
    expires_at: Number(json.expires_at) || undefined,
    token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
    user:
      json.user && typeof json.user === 'object'
        ? {
            id: String((json.user as Record<string, unknown>).id || ''),
            email: typeof (json.user as Record<string, unknown>).email === 'string'
              ? String((json.user as Record<string, unknown>).email)
              : undefined,
          }
        : undefined,
  };
}

export async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseAuthSession> {
  const config = readSupabaseAuthConfig();
  if (!config) throw new Error('Supabase Auth is not configured.');
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !json || typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    throw new Error('Supabase session refresh failed.');
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: Number(json.expires_in) || 3600,
    expires_at: Number(json.expires_at) || undefined,
    token_type: typeof json.token_type === 'string' ? json.token_type : undefined,
    user:
      json.user && typeof json.user === 'object'
        ? {
            id: String((json.user as Record<string, unknown>).id || ''),
            email: typeof (json.user as Record<string, unknown>).email === 'string'
              ? String((json.user as Record<string, unknown>).email)
              : undefined,
          }
        : undefined,
  };
}

export async function getSupabaseUser(accessToken: string): Promise<{ id: string; email?: string } | null> {
  const config = readSupabaseAuthConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!json || typeof json.id !== 'string') return null;
  return {
    id: json.id,
    email: typeof json.email === 'string' ? json.email : undefined,
  };
}

export async function updateSupabasePassword(accessToken: string, newPassword: string): Promise<void> {
  const config = readSupabaseAuthConfig();
  if (!config) throw new Error('Supabase Auth is not configured.');
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
    cache: 'no-store',
  });
  if (response.ok) return;
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const message =
    typeof json?.msg === 'string'
      ? json.msg
      : typeof json?.error_description === 'string'
        ? json.error_description
        : typeof json?.error === 'string'
          ? json.error
          : 'Failed to update password.';
  throw new Error(message);
}

export async function createSupabaseAuthUser(input: {
  email: string;
  password: string;
  emailConfirm?: boolean;
  userMetadata?: Record<string, unknown>;
}): Promise<{ id: string; email?: string }> {
  const config = readSupabaseAuthConfig();
  if (!config?.serviceKey) throw new Error('Supabase service key is required to create auth users.');
  const response = await fetch(`${config.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm ?? true,
      user_metadata: input.userMetadata ?? {},
    }),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !json || typeof json.id !== 'string') {
    const message =
      typeof json?.msg === 'string'
        ? json.msg
        : typeof json?.error_description === 'string'
          ? json.error_description
          : typeof json?.error === 'string'
            ? json.error
            : 'Failed to provision Supabase user.';
    throw new Error(message);
  }
  return {
    id: json.id,
    email: typeof json.email === 'string' ? json.email : undefined,
  };
}

export async function updateSupabaseAuthUser(input: {
  id: string;
  password?: string;
  email?: string;
  emailConfirm?: boolean;
  userMetadata?: Record<string, unknown>;
}): Promise<{ id: string; email?: string }> {
  const config = readSupabaseAuthConfig();
  if (!config?.serviceKey) throw new Error('Supabase service key is required to update auth users.');
  const userId = String(input.id || '').trim();
  if (!userId) throw new Error('Auth user id is required.');
  const payload: Record<string, unknown> = {};
  if (typeof input.password === 'string' && input.password.trim().length > 0) payload.password = input.password;
  if (typeof input.email === 'string' && input.email.trim().length > 0) payload.email = input.email.trim().toLowerCase();
  if (input.emailConfirm !== undefined) payload.email_confirm = !!input.emailConfirm;
  if (input.userMetadata && typeof input.userMetadata === 'object') payload.user_metadata = input.userMetadata;
  if (Object.keys(payload).length === 0) throw new Error('At least one auth user update field is required.');

  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const row = json && typeof json.user === 'object'
    ? (json.user as Record<string, unknown>)
    : json;
  if (!response.ok || !row || typeof row.id !== 'string') {
    const message =
      typeof json?.msg === 'string'
        ? json.msg
        : typeof json?.error_description === 'string'
          ? json.error_description
          : typeof json?.error === 'string'
            ? json.error
            : 'Failed to update Supabase user.';
    throw new Error(message);
  }
  return {
    id: row.id,
    email: typeof row.email === 'string' ? row.email : undefined,
  };
}

export function attachSupabaseSessionCookies(
  response: NextResponse,
  session: Pick<SupabaseAuthSession, 'access_token' | 'refresh_token' | 'expires_in'>,
  roleHint?: string
): void {
  const accessMaxAge = Math.max(60, session.expires_in);
  const refreshMaxAge = 30 * 24 * 60 * 60;
  const expires = new Date(Date.now() + accessMaxAge * 1000);
  response.cookies.set({
    name: SUPABASE_ACCESS_COOKIE,
    value: session.access_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
    maxAge: accessMaxAge,
  });
  response.cookies.set({
    name: SUPABASE_REFRESH_COOKIE,
    value: session.refresh_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + refreshMaxAge * 1000),
    maxAge: refreshMaxAge,
  });
  // Role-hint cookie is intentionally disabled by default.
  // Middleware and guards should derive role from verified auth context only.
  if (roleHint && process.env.ENABLE_SUPABASE_ROLE_HINT_COOKIE === '1') {
    response.cookies.set({
      name: SUPABASE_ROLE_HINT_COOKIE,
      value: roleHint,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires,
      maxAge: accessMaxAge,
    });
  }
}

export async function signOutSupabaseUser(accessToken: string): Promise<void> {
  const config = readSupabaseAuthConfig();
  if (!config || !accessToken) return;
  await fetch(`${config.url}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scope: 'global' }),
    cache: 'no-store',
  }).catch(() => undefined);
}

export function clearSupabaseSessionCookies(response: NextResponse): void {
  const expired = new Date(0);
  const baseOptions = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expired,
    maxAge: 0,
  };
  response.cookies.set({ name: SUPABASE_ACCESS_COOKIE, value: '', ...baseOptions });
  response.cookies.set({ name: SUPABASE_REFRESH_COOKIE, value: '', ...baseOptions });
  response.cookies.set({ name: SUPABASE_ROLE_HINT_COOKIE, value: '', ...baseOptions });
}
