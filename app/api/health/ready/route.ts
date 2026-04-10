import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { validateRuntimeEnv } from '@/lib/runtime-env';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const validation = validateRuntimeEnv();

  if (!validation.ok) {
    return errorJson({
      requestId,
      errorCode: 'runtime-env-invalid',
      message: 'Runtime environment validation failed.',
      status: 503,
      hint: validation.issues.map((issue) => `${issue.name}:${issue.reason}`).join(', '),
    });
  }

  return dataJson({
    requestId,
    data: {
      status: 'ready',
      checkedAt: validation.checkedAt,
      mode: validation.mode,
    },
  });
}
