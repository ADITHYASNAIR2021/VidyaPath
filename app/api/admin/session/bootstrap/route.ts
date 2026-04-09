import { NextResponse } from 'next/server';
import { attachAdminSessionCookie, createAdminSessionToken } from '@/lib/auth/session';

function isValidAdminKey(key: string): boolean {
  const configured = process.env.ADMIN_PORTAL_KEY?.trim() || process.env.TEACHER_PORTAL_KEY?.trim();
  if (!configured) return false;
  return key.trim() === configured;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get('key')?.trim() ?? '';
  const body = await req.json().catch(() => null);
  const keyFromBody = typeof body?.key === 'string' ? body.key.trim() : '';
  const key = keyFromQuery || keyFromBody;
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: 'Invalid admin bootstrap key.' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  attachAdminSessionCookie(response, createAdminSessionToken());
  return response;
}

