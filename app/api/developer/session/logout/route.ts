import { clearDeveloperSessionCookie } from '@/lib/auth/session';
import { dataJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const response = dataJson({ requestId, data: { ok: true } });
  clearDeveloperSessionCookie(response);
  return response;
}
