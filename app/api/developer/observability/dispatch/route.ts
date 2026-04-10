import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { dispatchObservabilityAlerts } from '@/lib/observability-alert-routing';
import { getObservabilitySummary } from '@/lib/observability-summary';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getDeveloperSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Developer session required.', requestId);

  const hours = Number(new URL(req.url).searchParams.get('hours') || 24);
  const safeHours = Number.isFinite(hours) ? Math.max(1, Math.min(168, hours)) : 24;

  try {
    const summary = await getObservabilitySummary(safeHours);
    const dispatch = await dispatchObservabilityAlerts(summary);
    return dataJson({
      requestId,
      data: {
        summary,
        dispatch,
      },
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch observability alerts.';
    return errorJson({
      requestId,
      errorCode: 'observability-dispatch-failed',
      message,
      status: 500,
    });
  }
}
