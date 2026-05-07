import { cookies } from 'next/headers';
import RolePortalLayout from '@/components/RolePortalLayout';
import { TEACHER_SESSION_COOKIE, parseTeacherSession } from '@/lib/auth/session';
import { getTeacherById } from '@/lib/teacher/auth.db';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TEACHER_SESSION_COOKIE)?.value;
  const session = parseTeacherSession(token);

  // No session = login page; middleware already enforces auth on protected routes
  if (!session) return <>{children}</>;

  let displayName: string | undefined;
  try {
    const teacher = await getTeacherById(session.teacherId);
    displayName = teacher?.name ?? undefined;
  } catch {
    // Sidebar shows role initial as fallback
  }

  return <RolePortalLayout role="teacher" displayName={displayName}>{children}</RolePortalLayout>;
}
