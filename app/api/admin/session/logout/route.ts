import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  return response;
}

