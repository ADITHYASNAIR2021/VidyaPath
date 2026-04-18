import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import DeveloperPortalNav from '@/components/DeveloperPortalNav';
import { DEVELOPER_SESSION_COOKIE, parseDeveloperSession } from '@/lib/auth/session';
import { getRequestAuthContext } from '@/lib/auth/guards';

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(DEVELOPER_SESSION_COOKIE)?.value;
  const legacySession = parseDeveloperSession(token);
  const authContext = await getRequestAuthContext().catch(() => null);
  const hasDeveloperAccess = Boolean(
    legacySession ||
      authContext?.role === 'developer' ||
      (process.env.SINGLE_ENV_MODE === '1' && authContext?.role === 'admin')
  );

  // No session = login page; middleware already enforces auth on protected routes
  if (!hasDeveloperAccess) return <>{children}</>;

  const displayName =
    authContext?.displayName ||
    legacySession?.username ||
    (authContext?.role === 'admin' ? 'Admin' : 'Developer');

  return (
    <div className="flex min-h-screen bg-[#FDFAF6]">
      <Sidebar role="developer" displayName={displayName} />
      <main className="flex-1 md:ml-60 transition-all duration-200 min-h-screen">
        <DeveloperPortalNav />
        {children}
      </main>
    </div>
  );
}
