/**
 * Next.js Instrumentation Hook
 * Runs once at server startup (Node.js runtime only, not Edge).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this to:
 *  1. Validate required environment variables — fail fast if misconfigured.
 *  2. Log the startup banner so deployment logs are self-documenting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertRequiredEnv } = await import('@/lib/config/env-validation');
    assertRequiredEnv();

    const version = process.env.npm_package_version ?? '0.1.0';
    const env = process.env.NODE_ENV ?? 'unknown';
    const region = process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local';
    console.info(`[VidyaPath] v${version} starting — env=${env} region=${region}`);
  }
}
