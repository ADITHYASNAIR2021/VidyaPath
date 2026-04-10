'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Teacher Workspace Error"
      message={error?.message || 'Teacher workspace failed to load.'}
      actionLabel="Retry Teacher Workspace"
      onRetry={reset}
    />
  );
}
