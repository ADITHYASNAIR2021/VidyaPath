import { NextResponse } from 'next/server';
import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.');
  return NextResponse.json({
    teacher: session.teacher,
    effectiveScopes: session.effectiveScopes,
  });
}
