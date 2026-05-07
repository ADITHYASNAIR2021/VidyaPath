'use client';

import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RoleStatusPanel
      role="teacher"
      variant="error"
      title="Teacher Workspace Error"
      message={error?.message || 'Teacher workspace failed to load.'}
      actionLabel="Retry Teacher Workspace"
      onAction={reset}
    />
  );
}
