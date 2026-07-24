/**
 * GET /api/sentry-test
 * Triggers a controlled server-side error to verify Sentry is working.
 * Developer-authenticated and only available outside production.
 */
import * as Sentry from '@sentry/nextjs';
import { getDeveloperSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const developer = await getDeveloperSessionFromRequestCookies();
  if (!developer) return unauthorizedJson('Developer session required.', requestId);

  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    // @ts-expect-error — deliberate test error
    myUndefinedFunction();
    return Response.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2_000);
    return Response.json({
      ok: false,
      message: (error as Error).message,
      sentry: 'Check your Sentry dashboard for this error',
    });
  }
}
