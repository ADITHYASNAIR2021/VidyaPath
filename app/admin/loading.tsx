import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function AdminLoading() {
  return (
    <RoleStatusPanel
      role="admin"
      variant="loading"
      title="Loading Admin Console"
      message="Gathering school operations, staffing, and analytics."
    />
  );
}

