import { NextResponse } from 'next/server';
import { clearTeacherSessionCookie } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearTeacherSessionCookie(response);
  return response;
}

