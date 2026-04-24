import { clearAllRoleSessionCookies } from '@/lib/auth/session';
import { clearSupabaseSessionCookies, getSupabaseAccessTokenFromRequest, signOutSupabaseUser } from '@/lib/auth/supabase-auth';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const accessToken = getSupabaseAccessTokenFromRequest(req);
    if (accessToken) await signOutSupabaseUser(accessToken);
    const response = dataJson({
      requestId,
      data: { loggedOut: true },
      meta: { committedAt: new Date().toISOString() },
    });
    clearAllRoleSessionCookies(response);
    clearSupabaseSessionCookies(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to logout session.';
    return errorJson({
      requestId,
      errorCode: 'admin-logout-failed',
      message,
      status: 500,
    });
  }
}
