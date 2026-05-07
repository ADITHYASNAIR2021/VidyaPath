/**
 * POST /api/push/send   (developer/admin only — internal trigger)
 * Sends a push notification to all subscribers for a school.
 *
 * Requires env vars:
 *   VAPID_PUBLIC_KEY=<base64url>
 *   VAPID_PRIVATE_KEY=<base64url>
 *   VAPID_CONTACT_EMAIL=mailto:admin@yourapp.com
 *
 * Generate keys:   node -e "const webpush = require('web-push'); console.log(webpush.generateVAPIDKeys())"
 */
import webpush from 'web-push';
import { NextRequest } from 'next/server';
import { requireInteractiveAuth } from '@/lib/auth/interactive';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { pushSendSchema } from '@/lib/schemas/engagement';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { recordAuditEvent } from '@/lib/security/audit';

const PUSH_TABLE = 'push_subscriptions';
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 2000;
const DEFAULT_SEND_CONCURRENCY = 25;

function toPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function getVapidConfig(): { publicKey: string; privateKey: string; email: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || '';
  const email = process.env.VAPID_CONTACT_EMAIL?.trim() || '';
  if (!publicKey || !privateKey || !email) return null;
  return { publicKey, privateKey, email };
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const ip = getClientIp(req);
  try {
    const { context, response: authResponse } = await requireInteractiveAuth(req);
    if (authResponse) return authResponse;

    if (context?.role !== 'developer' && context?.role !== 'admin') {
      return errorJson({ requestId, errorCode: 'forbidden', message: 'Developer or admin access required.', status: 403 });
    }
    const baseScope = context.schoolId || 'global';
    const rateLimit = await checkRateLimit({
      key: buildRateLimitKey('push:send', [context.authUserId || ip, baseScope]),
      windowSeconds: 60,
      maxRequests: 6,
      blockSeconds: 120,
      metadata: { endpoint: '/api/push/send' },
    });
    if (!rateLimit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many push broadcast attempts. Please retry shortly.',
        status: 429,
        hint: `Retry after ${rateLimit.retryAfterSeconds}s`,
      });
    }

    const vapid = getVapidConfig();
    if (!vapid) {
      return errorJson({
        requestId,
        errorCode: 'vapid-not-configured',
        message: 'VAPID keys not set. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL to your env.',
        status: 503,
      });
    }

    const vapidContact = vapid.email.startsWith('mailto:') ? vapid.email : `mailto:${vapid.email}`;
    webpush.setVapidDetails(vapidContact, vapid.publicKey, vapid.privateKey);

    const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, pushSendSchema);
    if (!bodyResult.ok) {
      return errorJson({
        requestId,
        errorCode: bodyResult.reason,
        message: bodyResult.message,
        status: bodyReasonToStatus(bodyResult.reason),
        issues: bodyResult.issues,
      });
    }

    const body = bodyResult.value;
    const title = typeof body.title === 'string' ? body.title.trim() : 'VidyaPath';
    const message = body.message.trim();
    const url = typeof body.url === 'string' ? body.url.trim() : '/dashboard';
    const schoolId = context.role === 'admin' ? (context.schoolId || '') : (typeof body.schoolId === 'string' ? body.schoolId : '');
    const raw = body as Record<string, unknown>;
    const offset = toPositiveInt(raw.offset, 0, 0, 500_000);
    const limit = toPositiveInt(raw.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const concurrency = toPositiveInt(raw.concurrency, DEFAULT_SEND_CONCURRENCY, 1, 80);

    const resolvedClient = resolveRequestSupabaseClient(req, 'service-first');
    if (!resolvedClient) {
      return errorJson({
        requestId,
        errorCode: 'supabase-unavailable',
        message: 'Push storage backend is unavailable.',
        status: 503,
      });
    }
    let query = resolvedClient.client
      .from(PUSH_TABLE)
      .select('endpoint,p256dh,auth')
      .range(offset, offset + limit - 1);
    if (schoolId) query = query.eq('school_id', schoolId);
    const { data: subscriptions, error: subscriptionsError } = await query;
    if (subscriptionsError) {
      return errorJson({
        requestId,
        errorCode: 'push-subscriptions-read-failed',
        message: subscriptionsError.message || 'Failed to load push subscriptions.',
        status: 500,
      });
    }

    const payload = JSON.stringify({ title, body: message, url, icon: '/icon.png' });
    let sent = 0;
    let failed = 0;
    const targets = subscriptions || [];

    for (let index = 0; index < targets.length; index += concurrency) {
      const slice = targets.slice(index, index + concurrency);
      await Promise.allSettled(
        slice.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            sent++;
          } catch {
            failed++;
          }
        })
      );
    }

    const hasMore = targets.length === limit;
    const nextOffset = hasMore ? offset + targets.length : null;
    await recordAuditEvent({
      requestId,
      endpoint: '/api/push/send',
      action: 'push-broadcast-sent',
      statusCode: 200,
      actorRole: context.role === 'developer' ? 'developer' : 'admin',
      actorAuthUserId: context.authUserId,
      schoolId: schoolId || context.schoolId,
      metadata: {
        sent,
        failed,
        requestedLimit: limit,
        offset,
        hasMore,
        nextOffset,
      },
    });

    return dataJson({
      requestId,
      data: {
        sent,
        failed,
        total: targets.length,
        offset,
        limit,
        hasMore,
        nextOffset,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send push notifications.';
    return errorJson({ requestId, errorCode: 'push-send-failed', message: msg, status: 500 });
  }
}
