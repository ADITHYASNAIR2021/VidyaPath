import { clearAllRoleSessionCookies } from '@/lib/auth/session';
import { clearSupabaseSessionCookies, getSupabaseAccessTokenFromRequest, signOutSupabaseUser } from '@/lib/auth/supabase-auth';
import { dataJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const accessToken = getSupabaseAccessTokenFromRequest(req);
  if (accessToken) await signOutSupabaseUser(accessToken).catch(() => undefined);
  const response = dataJson({ requestId, data: { ok: true } });
  clearAllRoleSessionCookies(response);
  clearSupabaseSessionCookies(response);
  return response;
}
