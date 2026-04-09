import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getAdminOverview } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.');
  const overview = await getAdminOverview(adminSession.role === 'admin' ? adminSession.schoolId : undefined);
  return NextResponse.json(overview);
}
