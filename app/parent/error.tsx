'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Parent Portal Error"
      message={error?.message || 'Parent portal failed to load.'}
      actionLabel="Retry Parent Portal"
      onRetry={reset}
    />
  );
}

