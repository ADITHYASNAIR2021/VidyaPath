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
    profileId: context.profileId,
    authUserId: context.authUserId,
    availableRoles: context.availableRoles ?? [context.role],
  });
}
