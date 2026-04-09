import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.');
  return NextResponse.json({
    role: session.role,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    schoolId: session.schoolId,
    authUserId: session.authUserId,
  });
}
