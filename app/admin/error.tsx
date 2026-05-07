'use client';

import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RoleStatusPanel
      role="admin"
      variant="error"
      title="Admin Panel Error"
      message={error?.message || 'Admin panel failed to load.'}
      actionLabel="Retry Admin Panel"
      onAction={reset}
    />
  );
}
