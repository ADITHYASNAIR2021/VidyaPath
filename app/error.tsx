'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="App Error"
      message={error?.message || 'The page failed to load.'}
      actionLabel="Reload Section"
      onRetry={reset}
    />
  );
}
