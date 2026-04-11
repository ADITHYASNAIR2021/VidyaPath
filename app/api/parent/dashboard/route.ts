import { cookies } from 'next/headers';
import { parseParentSession, PARENT_SESSION_COOKIE } from '@/lib/auth/parent-session';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { unauthorizedJson } from '@/lib/auth/guards';
import { getParentDashboard } from '@/lib/parent-portal-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const token = cookies().get(PARENT_SESSION_COOKIE)?.value;
  const parentSession = parseParentSession(token);
  if (!parentSession) return unauthorizedJson('Parent session required.', requestId);

  try {
    const dashboard = await getParentDashboard({
      studentId: parentSession.studentId,
      schoolId: parentSession.schoolId,
    });
    return dataJson({
      requestId,
      data: {
        parentName: parentSession.parentName,
        phone: parentSession.phone,
        ...dashboard,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load parent dashboard.';
    return errorJson({ requestId, errorCode: 'parent-dashboard-failed', message, status: 500 });
  }
}

