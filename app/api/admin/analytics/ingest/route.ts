import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { recordAuditEvent } from '@/lib/security/audit';

interface TrustedAnalyticsPayload {
  eventName?: unknown;
  metricKey?: unknown;
  metricValue?: unknown;
  schoolId?: unknown;
  metadata?: unknown;
}

function sanitizeMetricKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9:_./-]/g, '-').slice(0, 120);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin or developer session required.', requestId);

  let payload: TrustedAnalyticsPayload;
  try {
    payload = (await req.json()) as TrustedAnalyticsPayload;
  } catch {
    return errorJson({
      requestId,
      errorCode: 'invalid-body',
      message: 'Invalid JSON body.',
      status: 400,
    });
  }

  const eventName = typeof payload.eventName === 'string' ? payload.eventName.trim() : '';
  const metricKeyRaw = typeof payload.metricKey === 'string' ? payload.metricKey.trim() : '';
  const metricValue = Number(payload.metricValue);
  const metadata =
    payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};

  if (!eventName) {
    return errorJson({
      requestId,
      errorCode: 'event-name-required',
      message: 'eventName is required.',
      status: 400,
    });
  }
  if (!metricKeyRaw) {
    return errorJson({
      requestId,
      errorCode: 'metric-key-required',
      message: 'metricKey is required.',
      status: 400,
    });
  }
  if (!Number.isFinite(metricValue)) {
    return errorJson({
      requestId,
      errorCode: 'metric-value-invalid',
      message: 'metricValue must be a valid number.',
      status: 400,
    });
  }

  const schoolIdFromBody = typeof payload.schoolId === 'string' ? payload.schoolId.trim() : '';
  const schoolId =
    adminSession.role === 'admin'
      ? (adminSession.schoolId || '')
      : (schoolIdFromBody || adminSession.schoolId || '');
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'school-id-required',
      message: 'schoolId is required for trusted analytics ingestion.',
      status: 400,
    });
  }

  const metricKey = sanitizeMetricKey(metricKeyRaw);
  if (!metricKey) {
    return errorJson({
      requestId,
      errorCode: 'metric-key-invalid',
      message: 'metricKey contains only unsupported characters.',
      status: 400,
    });
  }

  void recordAuditEvent({
    requestId,
    endpoint: '/api/admin/analytics/ingest',
    action: 'trusted-analytics-ingest',
    statusCode: 200,
    actorRole: adminSession.role,
    actorAuthUserId: adminSession.authUserId,
    schoolId,
    metadata: {
      eventName: eventName.slice(0, 120),
      metricKey,
      metricValue,
      metadata,
    },
  }).catch(() => undefined);

  return dataJson({
    requestId,
    data: {
      accepted: true,
      trusted: true,
      eventName: eventName.slice(0, 120),
      metricKey,
      schoolId,
    },
  });
}
