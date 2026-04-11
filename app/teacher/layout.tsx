import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import FloatingAIButton from '@/components/FloatingAIButton';
import { TEACHER_SESSION_COOKIE, parseTeacherSession } from '@/lib/auth/session';
import { getTeacherById } from '@/lib/teacher-admin-db';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
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

  return (
    <div className="flex min-h-screen bg-[#FDFAF6]">
      <Sidebar role="teacher" displayName={displayName} />
      <main className="flex-1 md:ml-60 transition-all duration-200 min-h-screen">
        {children}
      </main>
      <FloatingAIButton />
    </div>
  );
}
