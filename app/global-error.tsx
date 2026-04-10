'use client';

import ErrorFallback from '@/components/ErrorFallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorFallback
          title="Critical App Error"
          message={error?.message || 'A critical error occurred while rendering the app.'}
          actionLabel="Retry App"
          onRetry={reset}
        />
      </body>
    </html>
  );
}
