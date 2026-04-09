import { NextResponse } from 'next/server';
import { clearStudentSessionCookie } from '@/lib/auth/session';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearStudentSessionCookie(response);
  return response;
}

