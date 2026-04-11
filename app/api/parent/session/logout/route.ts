import { NextResponse } from 'next/server';
import { clearParentSessionCookie } from '@/lib/auth/parent-session';
import { getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const response = NextResponse.json({ ok: true, requestId, data: { loggedOut: true } });
  clearParentSessionCookie(response);
  return response;
}

