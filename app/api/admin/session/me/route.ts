import { NextResponse } from 'next/server';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.');
  return NextResponse.json({
    role: 'admin',
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
  });
}
