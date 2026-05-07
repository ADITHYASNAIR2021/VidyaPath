'use client';

import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function DeveloperError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RoleStatusPanel
      role="developer"
      variant="error"
      title="Developer Console Error"
      message={error?.message || 'Developer console failed to load.'}
      actionLabel="Retry Developer Console"
      onAction={reset}
    />
  );
}
