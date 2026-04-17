import { cookies } from 'next/headers';
import { getRequestAuthContext, unauthorizedJson } from '@/lib/auth/guards';
import { clearAllRoleSessionCookies } from '@/lib/auth/session';
import {
  clearSupabaseSessionCookies,
  getSupabaseUser,
  signInWithPassword,
  SUPABASE_ACCESS_COOKIE,
  updateSupabasePassword,
} from '@/lib/auth/supabase-auth';
import { assertPasswordPolicy } from '@/lib/auth/password-policy';
import { dataJson, errorJson, getClientIp, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { passwordChangeSchema } from '@/lib/schemas/auth';
import { recordAuditEvent } from '@/lib/security/audit';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { markStudentPasswordChangeCompleted } from '@/lib/teacher-admin-db';
import { markTeacherPasswordChangeCompleted } from '@/lib/teacher/auth.db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const context = await getRequestAuthContext();
  if (!context) return unauthorizedJson('Authentication required.', requestId);
  if (!context.authUserId) {
    return errorJson({
      requestId,
      errorCode: 'password-change-supabase-required',
      message: 'This account does not support password change yet. Please use a Supabase-backed login.',
      status: 403,
    });
  }

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit({
    key: buildRateLimitKey('auth:password-change', [ip, context.authUserId]),
    windowSeconds: 60,
    maxRequests: 8,
    blockSeconds: 180,
  });
  if (!rateLimit.allowed) {
    return errorJson({
      requestId,
      errorCode: 'rate-limit-exceeded',
      message: 'Too many password change attempts. Please try again later.',
      hint: `Retry after ${rateLimit.retryAfterSeconds}s`,
      status: 429,
    });
  }

  const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, passwordChangeSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const currentPassword = typeof bodyResult.value.currentPassword === 'string'
    ? bodyResult.value.currentPassword.trim()
    : '';
  const newPassword = typeof bodyResult.value.newPassword === 'string'
    ? bodyResult.value.newPassword.trim()
    : '';

  if (!currentPassword || !newPassword) {
    return errorJson({
      requestId,
      errorCode: 'missing-password-fields',
      message: 'Both currentPassword and newPassword are required.',
      status: 400,
    });
  }
  if (currentPassword === newPassword) {
    return errorJson({
      requestId,
      errorCode: 'password-unchanged',
      message: 'New password must be different from current password.',
      status: 400,
    });
  }

  try {
    assertPasswordPolicy(newPassword);
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'invalid-password-policy',
      message: error instanceof Error ? error.message : 'Invalid password format.',
      status: 400,
    });
  }

  const accessToken = cookies().get(SUPABASE_ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return errorJson({
      requestId,
      errorCode: 'missing-access-token',
      message: 'Active session missing. Please login again.',
      status: 401,
    });
  }

  try {
    const user = await getSupabaseUser(accessToken);
    if (!user?.email) {
      return errorJson({
        requestId,
        errorCode: 'missing-auth-email',
        message: 'Unable to resolve account email for password change.',
        status: 400,
      });
    }

    await signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    await updateSupabasePassword(accessToken, newPassword);
    if (context.role === 'student' && context.profileId) {
      await markStudentPasswordChangeCompleted(context.profileId);
    }
    if (context.role === 'teacher' && context.profileId) {
      await markTeacherPasswordChangeCompleted(context.profileId);
    }

    const response = dataJson({
      requestId,
      data: {
        ok: true,
        reLoginRequired: true,
      },
    });
    clearAllRoleSessionCookies(response);
    clearSupabaseSessionCookies(response);

    await recordAuditEvent({
      requestId,
      endpoint: '/api/auth/password/change',
      action: 'password-change-success',
      statusCode: 200,
      actorRole: context.role,
      actorAuthUserId: context.authUserId,
      schoolId: context.schoolId,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Password change failed.';
    const invalidCurrentPassword = /invalid login credentials|invalid credentials|invalid.*password/i.test(message);
    await recordAuditEvent({
      requestId,
      endpoint: '/api/auth/password/change',
      action: invalidCurrentPassword ? 'password-change-old-password-invalid' : 'password-change-failed',
      statusCode: invalidCurrentPassword ? 401 : 500,
      actorRole: context.role,
      actorAuthUserId: context.authUserId,
      schoolId: context.schoolId,
      metadata: {
        message: message.slice(0, 300),
      },
    });
    return errorJson({
      requestId,
      errorCode: invalidCurrentPassword ? 'invalid-current-password' : 'password-change-failed',
      message: invalidCurrentPassword ? 'Current password is incorrect.' : message,
      status: invalidCurrentPassword ? 401 : 500,
    });
  }
}
