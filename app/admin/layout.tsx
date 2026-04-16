import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import {
  ADMIN_SESSION_COOKIE,
  DEVELOPER_SESSION_COOKIE,
  parseAdminSession,
  parseDeveloperSession,
} from '@/lib/auth/session';
import { getAdminSessionFromRequestCookies } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const devToken = cookieStore.get(DEVELOPER_SESSION_COOKIE)?.value;

  const adminSession = parseAdminSession(adminToken);
  const devSession = parseDeveloperSession(devToken);

  // No session = login page; middleware already enforces auth on protected routes
  if (!adminSession && !devSession) return <>{children}</>;

  let displayName: string | undefined;
  try {
    const fullSession = await getAdminSessionFromRequestCookies();
    displayName = fullSession?.displayName ?? (devSession ? devSession.username : undefined);
  } catch {
    displayName = devSession ? devSession.username : undefined;
  }

  return (
    <div className="flex min-h-screen bg-[#FDFAF6]">
      <Sidebar role="admin" displayName={displayName} />
      <main className="flex-1 md:ml-60 transition-all duration-200 min-h-screen">
        {children}
      </main>
    </div>
  );
}
