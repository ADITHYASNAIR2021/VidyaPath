'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { isPortalPath, isSharedRoleShellPath, isStudentShellPath } from '@/lib/ui/layout-shell';
import { fetchClientAuthSession } from '@/lib/client-auth-session';
import RoleSwitcher from '@/components/auth/RoleSwitcher';

interface AuthSnapshot {
  role: 'student' | 'teacher' | 'admin' | 'developer' | 'anonymous';
  authenticated: boolean;
  displayName?: string;
}

const ROLE_HEADER: Record<Exclude<AuthSnapshot['role'], 'anonymous'>, { title: string; subtitle: string }> = {
  student: { title: 'Student Hub', subtitle: 'Study and practice workspace' },
  teacher: { title: 'Teacher Workspace', subtitle: 'Teaching and class controls' },
  admin: { title: 'Admin Console', subtitle: 'School operations and settings' },
  developer: { title: 'Developer Console', subtitle: 'Platform operations and diagnostics' },
};

function shouldShowRoleSidebar(pathname: string, auth: AuthSnapshot): boolean {
  if (isPortalPath(pathname)) return false;
  if (!auth.authenticated || auth.role === 'anonymous') return false;
  if (auth.role === 'student') return isStudentShellPath(pathname);
  return isSharedRoleShellPath(pathname);
}

export default function AppMainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthSnapshot>({ role: 'anonymous', authenticated: false });

  useEffect(() => {
    let active = true;
    fetchClientAuthSession()
      .then((data) => {
        if (!active) return;
        if (data.role !== 'student' && data.role !== 'teacher' && data.role !== 'admin' && data.role !== 'developer') {
          setAuth({ role: 'anonymous', authenticated: false });
          return;
        }
        setAuth({
          role: data.role,
          authenticated: !!data.authenticated,
          displayName: data.displayName,
        });
      })
      .catch(() => {
        if (active) setAuth({ role: 'anonymous', authenticated: false });
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const showRoleSidebar = shouldShowRoleSidebar(pathname, auth);

  if (showRoleSidebar && auth.role !== 'anonymous') {
    const roleHeader = ROLE_HEADER[auth.role];
    return (
      <div className="app-shell-bg flex min-h-screen bg-[var(--color-background)]">
        <Sidebar role={auth.role} displayName={auth.displayName} />
        <div className="flex min-h-screen flex-1 flex-col page-enter md:ml-60 transition-all duration-200">
          <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/82 px-4 py-3 backdrop-blur-xl md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                  {roleHeader.title}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{roleHeader.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <RoleSwitcher />
                {auth.displayName ? (
                  <div className="ui-chip rounded-full px-3 py-1 text-xs font-semibold">
                    {auth.displayName}
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 min-h-[calc(100vh-65px)]">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <main id="main-content" tabIndex={-1}>
      {children}
    </main>
  );
}
