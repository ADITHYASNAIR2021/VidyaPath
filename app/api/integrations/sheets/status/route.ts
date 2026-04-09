import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { getSheetsStatus } from '@/lib/sheets-bridge';

export async function GET() {
  const admin = getAdminSessionFromRequestCookies();
  const teacher = await getTeacherSessionFromRequestCookies();
  if (!admin && !teacher) {
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }
  const status = await getSheetsStatus();
  return NextResponse.json(status);
}
