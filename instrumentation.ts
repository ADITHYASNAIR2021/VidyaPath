import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
    return;
  }
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('./sentry.server.config');

  const { assertRequiredEnv } = await import('@/lib/config/env-validation');
  assertRequiredEnv();

  const version = process.env.npm_package_version ?? '0.1.0';
  const env = process.env.NODE_ENV ?? 'unknown';
  const region = process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local';
  console.info(`[VidyaPath] v${version} starting - env=${env} region=${region}`);
}

export const onRequestError = Sentry.captureRequestError;
