import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function StudentLoading() {
  return (
    <RoleStatusPanel
      role="student"
      variant="loading"
      title="Loading Student Hub"
      message="Preparing your chapters, assignments, and learning insights."
    />
  );
}

