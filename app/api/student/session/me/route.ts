import { NextResponse } from 'next/server';
import { getStudentSessionFromRequestCookies } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getStudentSessionFromRequestCookies();
  if (!session) {
    return NextResponse.json({ error: 'Student session not found.' }, { status: 401 });
  }
  return NextResponse.json(session);
}
