/**
 * POST /api/push/subscribe
 * Stores a browser push subscription for the current user.
 *
 * Requires a push_subscriptions table in Supabase:
 * CREATE TABLE IF NOT EXISTS push_subscriptions (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id     TEXT NOT NULL,
 *   role        TEXT NOT NULL,
 *   school_id   TEXT,
 *   endpoint    TEXT NOT NULL UNIQUE,
 *   p256dh      TEXT NOT NULL,
 *   auth        TEXT NOT NULL,
 *   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 */
import { NextRequest } from 'next/server';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { pushSubscribeSchema } from '@/lib/schemas/engagement';
import { decodeJwtPayload, getSupabaseAccessTokenFromRequest } from '@/lib/auth/supabase-auth';
import { getUserClient } from '@/lib/supabase-rest';

const PUSH_TABLE = 'push_subscriptions';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, pushSubscribeSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const accessToken = getSupabaseAccessTokenFromRequest(req);
    if (!accessToken) {
      return errorJson({
        requestId,
        errorCode: 'supabase-session-required',
        message: 'Supabase access token is required for push subscription updates.',
        status: 401,
      });
    }
    const client = getUserClient(accessToken);
    const tokenPayload = decodeJwtPayload(accessToken);
    if (!tokenPayload?.sub) {
      return errorJson({
        requestId,
        errorCode: 'invalid-supabase-session',
        message: 'Supabase session is invalid or expired.',
        status: 401,
      });
    }

    const body = bodyResult.value;
    const endpoint = body.endpoint.trim();
    const p256dh = body.keys.p256dh.trim();
    const auth = body.keys.auth.trim();

    // Upsert: delete old subscription for same endpoint then insert
    try {
      // Check for existing
      const { data: existing, error: selectError } = await client
        .from(PUSH_TABLE)
        .select('id')
        .eq('endpoint', endpoint)
        .limit(1);
      if (selectError) throw selectError;
      if (existing.length > 0) {
        // Already stored, update user association if needed
        return dataJson({ requestId, data: { subscribed: true, updated: false } });
      }
    } catch {
      // Table might not exist yet — return a helpful error
      return errorJson({
        requestId,
        errorCode: 'push-table-missing',
        message: 'Push subscriptions table not set up. Run the SQL migration in the Supabase editor.',
        status: 503,
      });
    }

    const { error: insertError } = await client.from(PUSH_TABLE).insert({
      user_id: tokenPayload.sub,
      role: context.role,
      school_id: context?.schoolId || null,
      endpoint,
      p256dh,
      auth,
      created_at: new Date().toISOString(),
    });
    if (insertError) {
      return errorJson({
        requestId,
        errorCode: 'push-subscribe-failed',
        message: insertError.message || 'Failed to store push subscription.',
        status: 500,
      });
    }

    return dataJson({ requestId, data: { subscribed: true, updated: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store push subscription.';
    return errorJson({ requestId, errorCode: 'push-subscribe-failed', message, status: 500 });
  }
}
