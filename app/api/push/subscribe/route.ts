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
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { supabaseInsert, supabaseSelect } from '@/lib/supabase-rest';

const PUSH_TABLE = 'push_subscriptions';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth();
    if (authResponse) return authResponse;

    const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 8 * 1024);
    if (!bodyResult.ok) {
      return errorJson({ requestId, errorCode: bodyResult.reason, message: bodyResult.message, status: 400 });
    }

    const body = bodyResult.value;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    const keysRaw = body.keys && typeof body.keys === 'object' ? body.keys as Record<string, unknown> : {};
    const p256dh = typeof keysRaw.p256dh === 'string' ? keysRaw.p256dh : '';
    const auth = typeof keysRaw.auth === 'string' ? keysRaw.auth : '';

    if (!endpoint || !p256dh || !auth) {
      return errorJson({ requestId, errorCode: 'invalid-subscription', message: 'endpoint and keys (p256dh, auth) are required.', status: 400 });
    }

    // Upsert: delete old subscription for same endpoint then insert
    try {
      // Check for existing
      const existing = await supabaseSelect<Record<string, unknown>>(PUSH_TABLE, {
        select: 'id',
        filters: [{ column: 'endpoint', value: endpoint }],
        limit: 1,
      });
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

    await supabaseInsert(PUSH_TABLE, {
      user_id: context?.profileId || context?.authUserId || 'anonymous',
      role: context?.role || 'anonymous',
      school_id: context?.schoolId || null,
      endpoint,
      p256dh,
      auth,
      created_at: new Date().toISOString(),
    });

    return dataJson({ requestId, data: { subscribed: true, updated: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store push subscription.';
    return errorJson({ requestId, errorCode: 'push-subscribe-failed', message, status: 500 });
  }
}
