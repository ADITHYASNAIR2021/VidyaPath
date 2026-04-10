import { NextResponse } from 'next/server';
import { getRequestAuthContext } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getRequestAuthContext();
  if (!context) {
    return NextResponse.json({
      role: 'anonymous',
      authenticated: false,
    });
  }
  return NextResponse.json({
    role: context.role,
    authenticated: true,
    schoolId: context.schoolId,
    schoolCode: context.schoolCode,
    schoolName: context.schoolName,
    profileId: context.profileId,
    displayName: context.displayName,
    authUserId: context.authUserId,
    availableRoles: context.availableRoles ?? [context.role],
    sessionExpiry: context.expiresAt,
  });
}
