export const dynamic = 'force-dynamic';
import { getAdminSessionFromRequestCookies, getTeacherSessionFromRequestCookies } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getSheetsStatus } from '@/lib/sheets-bridge';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const admin = await getAdminSessionFromRequestCookies();
  const teacher = await getTeacherSessionFromRequestCookies();
  if (!admin && !teacher) {
    return errorJson({
      requestId,
      errorCode: 'unauthorized',
      message: 'Unauthorized access.',
      status: 401,
    });
  }
  const status = await getSheetsStatus();
  return dataJson({ requestId, data: status });
}
