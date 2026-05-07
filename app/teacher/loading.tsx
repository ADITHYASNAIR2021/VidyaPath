import RoleStatusPanel from '@/components/RoleStatusPanel';

export default function TeacherLoading() {
  return (
    <RoleStatusPanel
      role="teacher"
      variant="loading"
      title="Loading Teacher Workspace"
      message="Fetching classes, assignments, and grading queues."
    />
  );
}

