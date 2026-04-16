import { getTeacherSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { archiveWeeklyPlan } from '@/lib/teacher-admin-db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const session = await getTeacherSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Teacher session required.', requestId);

  const planId = params.id?.trim();
  if (!planId) {
    return errorJson({ requestId, errorCode: 'missing-plan-id', message: 'Plan ID is required.', status: 400 });
  }

  try {
    const plan = await archiveWeeklyPlan(session.teacher.id, planId);
    if (!plan) {
      return errorJson({ requestId, errorCode: 'plan-not-found', message: 'Plan not found or already archived.', status: 404 });
    }
    return dataJson({ requestId, data: { plan } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to archive weekly plan.';
    return errorJson({ requestId, errorCode: 'weekly-plan-archive-failed', message, status: 500 });
  }
}
