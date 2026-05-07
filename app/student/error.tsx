'use client';

import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RoleStatusPanel
      role="student"
      variant="error"
      title="Student Portal Error"
      message={error?.message || 'Student portal failed to load.'}
      actionLabel="Retry Student Portal"
      onAction={reset}
    />
  );
}
