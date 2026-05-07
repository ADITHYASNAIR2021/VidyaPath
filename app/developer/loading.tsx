import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function DeveloperLoading() {
  return (
    <RoleStatusPanel
      role="developer"
      variant="loading"
      title="Loading Developer Console"
      message="Collecting platform telemetry, school intelligence, and operational signals."
    />
  );
}

