import { cookies } from 'next/headers';
import DeveloperPortalNav from '@/components/DeveloperPortalNav';
import RolePortalLayout from '@/components/RolePortalLayout';
import { DEVELOPER_SESSION_COOKIE, parseDeveloperSession } from '@/lib/auth/session';
import { getRequestAuthContext } from '@/lib/auth/guards';

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
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
    <RolePortalLayout role="developer" displayName={displayName} headerContent={<DeveloperPortalNav />}>
      {children}
    </RolePortalLayout>
  );
}
