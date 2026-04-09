import { NextResponse } from 'next/server';
import { attachAdminSessionCookie, createAdminSessionToken } from '@/lib/auth/session';
import { findAdminAuthIdentity, resolveRoleContextByAuthUserId } from '@/lib/platform-rbac-db';
import { attachSupabaseSessionCookies, signInWithPassword } from '@/lib/auth/supabase-auth';

function isValidAdminKey(key: string): boolean {
  const configured = process.env.ADMIN_PORTAL_KEY?.trim() || process.env.TEACHER_PORTAL_KEY?.trim();
  if (!configured) return false;
  return key.trim() === configured;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get('key')?.trim() ?? '';
  const body = await req.json().catch(() => null);
  const keyFromBody = typeof body?.key === 'string' ? body.key.trim() : '';
  const schoolCode = typeof body?.schoolCode === 'string'
    ? body.schoolCode.trim()
    : (process.env.DEFAULT_SCHOOL_CODE || '').trim();
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password.trim() : '';
  const key = keyFromQuery || keyFromBody;

  if (schoolCode && identifier && password) {
    const identity = await findAdminAuthIdentity({ schoolCode, identifier });
    if (!identity?.authEmail) {
      return NextResponse.json({ error: 'School admin identity not found.' }, { status: 404 });
    }
    try {
      const authSession = await signInWithPassword({
        email: identity.authEmail,
        password,
      });
      const roleContext = authSession.user?.id
        ? await resolveRoleContextByAuthUserId(authSession.user.id)
        : null;
      if (!roleContext || (roleContext.role !== 'admin' && roleContext.role !== 'developer')) {
        return NextResponse.json({ error: 'Authenticated user does not have admin access.' }, { status: 403 });
      }
      const response = NextResponse.json({
        ok: true,
        role: roleContext.role,
        schoolId: roleContext.schoolId,
      });
      attachSupabaseSessionCookies(response, authSession, roleContext.role);
      attachAdminSessionCookie(response, createAdminSessionToken());
      return response;
    } catch {
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 });
    }
  }

  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: 'Invalid admin bootstrap key.' }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  attachAdminSessionCookie(response, createAdminSessionToken());
  return response;
}
