import { NextResponse } from 'next/server';
import { clearAdminSessionCookie, clearStudentSessionCookie, clearTeacherSessionCookie } from '@/lib/auth/session';
import { clearSupabaseSessionCookies } from '@/lib/auth/supabase-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminSessionCookie(response);
  clearTeacherSessionCookie(response);
  clearStudentSessionCookie(response);
  clearSupabaseSessionCookies(response);
  return response;
}
