'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Student Portal Error"
      message={error?.message || 'Student portal failed to load.'}
      actionLabel="Retry Student Portal"
      onRetry={reset}
    />
  );
}
