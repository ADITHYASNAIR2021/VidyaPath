import { z } from 'zod';
import { getRequestAuthContext, unauthorizedJson } from '@/lib/auth/guards';
import { attachActiveRoleCookie, type ActivePlatformRole } from '@/lib/auth/session';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { resolveRoleContextByAuthUserId } from '@/lib/platform-rbac-db';

export const dynamic = 'force-dynamic';

const switchRoleSchema = z.object({
  role: z.enum(['student', 'teacher', 'admin', 'developer']),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const context = await getRequestAuthContext();
  if (!context) return unauthorizedJson('Authenticated session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 8 * 1024, switchRoleSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const nextRole = bodyResult.value.role as ActivePlatformRole;
  if (!context.authUserId) {
    return errorJson({
      requestId,
      errorCode: 'role-switch-requires-supabase-auth',
      message: 'Role switching requires an active Supabase session.',
      status: 403,
    });
  }

  const freshContext = await resolveRoleContextByAuthUserId(context.authUserId).catch(() => null);
  if (!freshContext) {
    return unauthorizedJson('Authenticated session required.', requestId);
  }
  const availableRoles = freshContext.availableRoles || [freshContext.role];
  if (!availableRoles.includes(nextRole)) {
    return errorJson({
      requestId,
      errorCode: 'role-not-available',
      message: 'This account does not have access to the requested role.',
      status: 403,
    });
  }
  const switchedContext = await resolveRoleContextByAuthUserId(context.authUserId, nextRole).catch(() => null);
  if (!switchedContext || switchedContext.role !== nextRole) {
    return errorJson({
      requestId,
      errorCode: 'role-not-available',
      message: 'Requested role is no longer active for this account.',
      status: 403,
    });
  }

  const response = dataJson({
    requestId,
    data: {
      selectedRole: nextRole,
      availableRoles,
      currentRole: freshContext.role,
      schoolId: switchedContext.schoolId,
      schoolCode: switchedContext.schoolCode,
    },
  });
  attachActiveRoleCookie(response, nextRole);
  return response;
}
