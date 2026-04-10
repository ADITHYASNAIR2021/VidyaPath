'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function DeveloperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Developer Console Error"
      message={error?.message || 'Developer console failed to load.'}
      actionLabel="Retry Developer Console"
      onRetry={reset}
    />
  );
}
