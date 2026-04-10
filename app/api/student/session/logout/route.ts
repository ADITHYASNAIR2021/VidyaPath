import { clearAdminSessionCookie, clearStudentSessionCookie, clearTeacherSessionCookie } from '@/lib/auth/session';
import { clearSupabaseSessionCookies } from '@/lib/auth/supabase-auth';
import { dataJson, getRequestId } from '@/lib/http/api-response';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const response = dataJson({
    requestId,
    data: { loggedOut: true },
    meta: { committedAt: new Date().toISOString() },
  });
  clearAdminSessionCookie(response);
  clearTeacherSessionCookie(response);
  clearStudentSessionCookie(response);
  clearSupabaseSessionCookies(response);
  return response;
}
