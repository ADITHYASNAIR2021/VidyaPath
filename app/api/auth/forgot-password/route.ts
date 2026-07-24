/**
 * POST /api/auth/forgot-password
 * Sends a password reset email via Supabase Auth.
 * Works for admin and teacher accounts (email-based).
 * Students (roll-code based) are directed to contact their school admin.
 */
import { errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { z } from 'zod';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { getClientIp, hasResolvedClientIp } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(256),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  // Rate limit: 3 requests per 15 minutes per IP
  const ip = getClientIp(req);
  if (hasResolvedClientIp(ip)) {
    const limit = await checkRateLimit({
      key: buildRateLimitKey('auth:forgot-password', [ip]),
      windowSeconds: 900,
      maxRequests: 3,
      blockSeconds: 1800,
    });
    if (!limit.allowed) {
      return errorJson({
        requestId,
        errorCode: 'rate-limit-exceeded',
        message: 'Too many reset attempts. Please try again in 15 minutes.',
        status: 429,
      });
    }
  }

  const bodyResult = await parseAndValidateJsonBody(req, 1024, forgotPasswordSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
    });
  }

  const identifier = bodyResult.value.identifier.trim().toLowerCase();

  // Students use roll codes, not emails — direct them to school admin
  if (/^aps\.stu\.|^c1[0-2]/i.test(identifier)) {
    return errorJson({
      requestId,
      errorCode: 'student-password-reset',
      message: 'Student passwords are managed by your school. Please contact your class teacher or school administrator to reset your password.',
      status: 400,
    });
  }

  // Only process email-based identifiers (admin/teacher)
  if (!identifier.includes('@')) {
    return errorJson({
      requestId,
      errorCode: 'invalid-identifier',
      message: 'Please enter your registered email address, or contact your school if you are a student.',
      status: 400,
    });
  }

  // Use Supabase Auth to send reset email
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    ''
  ).trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');

  if (!supabaseUrl || !anonKey || !appUrl) {
    return errorJson({
      requestId,
      errorCode: 'service-unavailable',
      message: 'Password reset is temporarily unavailable. Please try again later.',
      status: 503,
    });
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        email: identifier,
        redirect_to: `${appUrl}/reset-password`,
        gotrue_meta_security: {},
      }),
    });

    // Always return success to prevent email enumeration
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Log the real error but don't expose it
      console.warn(`[forgot-password] Supabase error for ${identifier}: ${res.status} ${body.slice(0, 200)}`);
    }

    return Response.json({
      ok: true,
      requestId,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (err) {
    console.error('[forgot-password] Failed:', err);
    return Response.json({
      ok: true,
      requestId,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  }
}
