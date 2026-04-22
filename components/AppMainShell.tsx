'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { isPortalPath, isSharedRoleShellPath, isStudentShellPath } from '@/lib/ui/layout-shell';

interface AuthSnapshot {
  role: 'student' | 'teacher' | 'admin' | 'developer' | 'anonymous';
  authenticated: boolean;
  displayName?: string;
}

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
    fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        if (!active || !data) return;
        const roleRaw = typeof data.role === 'string' ? data.role : 'anonymous';
        const role =
          roleRaw === 'student' || roleRaw === 'teacher' || roleRaw === 'admin' || roleRaw === 'developer'
            ? roleRaw
            : 'anonymous';
        setAuth({
          role,
          authenticated: !!data.authenticated && role !== 'anonymous',
          displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
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
    return (
      <div className="flex min-h-screen bg-[#FDFAF6] dark:bg-gray-900">
        <Sidebar role={auth.role} displayName={auth.displayName} />
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-screen md:ml-60 transition-all duration-200">
          {children}
        </main>
      </div>
    );
  }

  return (
    <main id="main-content" tabIndex={-1}>
      {children}
    </main>
  );
}
