'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      title="Admin Panel Error"
      message={error?.message || 'Admin panel failed to load.'}
      actionLabel="Retry Admin Panel"
      onRetry={reset}
    />
  );
}
