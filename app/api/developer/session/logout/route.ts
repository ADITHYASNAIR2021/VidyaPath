import { clearAllRoleSessionCookies } from '@/lib/auth/session';
import { clearSupabaseSessionCookies } from '@/lib/auth/supabase-auth';
import { dataJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const response = dataJson({ requestId, data: { ok: true } });
  clearAllRoleSessionCookies(response);
  clearSupabaseSessionCookies(response);
  return response;
}
