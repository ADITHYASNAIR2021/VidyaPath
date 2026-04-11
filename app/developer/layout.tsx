import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import { DEVELOPER_SESSION_COOKIE, parseDeveloperSession } from '@/lib/auth/session';

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(DEVELOPER_SESSION_COOKIE)?.value;
  const session = parseDeveloperSession(token);

  // No session = login page; middleware already enforces auth on protected routes
  if (!session) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-[#FDFAF6]">
      <Sidebar role="developer" displayName={session.username} />
      <main className="flex-1 md:ml-60 transition-all duration-200 min-h-screen">
        {children}
      </main>
    </div>
  );
}
