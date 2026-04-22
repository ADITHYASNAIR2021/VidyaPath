import type { NextRequest } from 'next/server';
import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getServiceClient } from '@/lib/supabase-rest';

const PUSH_TABLE = 'push_subscriptions';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await req.json() as typeof body;
  } catch {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'Invalid JSON body.', status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh.trim() : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth.trim() : '';

  if (!endpoint || !p256dh || !auth) {
    return errorJson({ requestId, errorCode: 'missing-fields', message: 'endpoint, keys.p256dh, and keys.auth are required.', status: 400 });
  }

  const client = getServiceClient();
  if (!client) {
    return errorJson({ requestId, errorCode: 'db-unavailable', message: 'Database not configured.', status: 503 });
  }

  try {
    const { data: existing } = await client
      .from(PUSH_TABLE)
      .select('id')
      .eq('endpoint', endpoint)
      .limit(1);

    if (existing && existing.length > 0) {
      return dataJson({ requestId, data: { subscribed: true, updated: false } });
    }

    const { error: insertError } = await client.from(PUSH_TABLE).insert({
      user_id: studentSession.studentId,
      role: 'student',
      school_id: studentSession.schoolId ?? null,
      endpoint,
      p256dh,
      auth,
    });

    if (insertError) {
      return errorJson({ requestId, errorCode: 'push-subscribe-failed', message: insertError.message, status: 500 });
    }

    return dataJson({ requestId, data: { subscribed: true, updated: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store push subscription.';
    return errorJson({ requestId, errorCode: 'push-subscribe-failed', message, status: 500 });
  }
}
