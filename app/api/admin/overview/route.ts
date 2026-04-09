import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getAdminOverview } from '@/lib/teacher-admin-db';

export async function GET() {
  if (!getAdminSessionFromRequestCookies()) return unauthorizedJson('Admin session required.');
  const overview = await getAdminOverview();
  return NextResponse.json(overview);
}

