import { cookies } from 'next/headers';
import RolePortalLayout from '@/components/RolePortalLayout';
import {
  ADMIN_SESSION_COOKIE,
  DEVELOPER_SESSION_COOKIE,
  parseAdminSession,
  parseDeveloperSession,
} from '@/lib/auth/session';
import { getAdminSessionFromRequestCookies } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
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

  return <RolePortalLayout role="admin" displayName={displayName}>{children}</RolePortalLayout>;
}
