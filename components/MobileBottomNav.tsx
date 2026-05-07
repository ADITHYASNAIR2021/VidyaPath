'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  BookOpen,
  FileText,
  Target,
  Users,
  Calculator,
  ShieldCheck,
  Wrench,
  Bookmark,
} from 'lucide-react';
import clsx from 'clsx';
import { isPortalPath, isSharedRoleShellPath, isStudentShellPath } from '@/lib/ui/layout-shell';
import { fetchClientAuthSession } from '@/lib/client-auth-session';

type Role = 'student' | 'teacher' | 'admin' | 'developer' | 'anonymous';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

function getNavItems(role: Role): NavItem[] {
  switch (role) {
    case 'student':
      return [
        { href: '/',          label: 'Home',      icon: Home      },
        { href: '/chapters',  label: 'Study',     icon: BookOpen  },
        { href: '/student/today', label: 'Today', icon: Target    },
        { href: '/papers',    label: 'Papers',    icon: FileText  },
        { href: '/bookmarks', label: 'Saved',     icon: Bookmark  },
      ];
    case 'teacher':
      return [
        { href: '/',          label: 'Home',      icon: Home      },
        { href: '/teacher',   label: 'Desk',      icon: Users     },
        { href: '/chapters',  label: 'Study',     icon: BookOpen  },
        { href: '/formulas',  label: 'Formulas',  icon: Calculator },
        { href: '/papers',    label: 'Papers',    icon: FileText  },
      ];
    case 'admin':
      return [
        { href: '/',          label: 'Home',      icon: Home      },
        { href: '/admin',     label: 'Console',   icon: ShieldCheck },
        { href: '/chapters',  label: 'Study',     icon: BookOpen  },
        { href: '/formulas',  label: 'Formulas',  icon: Calculator },
        { href: '/papers',    label: 'Papers',    icon: FileText  },
      ];
    case 'developer':
      return [
        { href: '/',          label: 'Home',      icon: Home      },
        { href: '/developer', label: 'Dev',       icon: Wrench    },
        { href: '/api-lab',   label: 'API Lab',   icon: ShieldCheck },
        { href: '/chapters',  label: 'Study',     icon: BookOpen  },
        { href: '/papers',    label: 'Papers',    icon: FileText  },
      ];
    default: // anonymous
      return [
        { href: '/',          label: 'Home',      icon: Home      },
        { href: '/chapters',  label: 'Study',     icon: BookOpen  },
        { href: '/formulas',  label: 'Formulas',  icon: Calculator },
        { href: '/dashboard', label: 'Dash',      icon: Target    },
        { href: '/papers',    label: 'Papers',    icon: FileText  },
      ];
  }
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<Role>('anonymous');
  const isExamRoute = pathname.startsWith('/exam/');
  const isPortalRoute = isPortalPath(pathname);
  const isRoleSidebarMode =
    (role === 'student' && isStudentShellPath(pathname)) ||
    (role !== 'student' && role !== 'anonymous' && isSharedRoleShellPath(pathname));

  useEffect(() => {
    let active = true;
    fetchClientAuthSession()
      .then((session) => {
        if (!active) return;
        const nextRole =
          session.role === 'student' ||
          session.role === 'teacher' ||
          session.role === 'admin' ||
          session.role === 'developer'
            ? session.role
            : 'anonymous';
        if (active) setRole(nextRole);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);

  if (isExamRoute || isPortalRoute || isRoleSidebarMode) return null;

  const navItems = getNavItems(role);

  return (
    <div className="md:hidden fixed bottom-2 left-0 right-0 z-50 px-3 pb-safe">
      <div className="floating-dock mx-auto flex max-w-xl items-center justify-around rounded-2xl px-2 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const hrefPath = href.split('?')[0];
          const isActive = hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath);
          return (
            <Link
              key={href}
              href={href}
                className={clsx(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 transition-colors duration-200',
                  isActive ? 'text-saffron-600 dark:text-saffron-300' : 'text-[var(--color-text-muted)]'
                )}
              >
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200',
                    isActive ? 'bg-saffron-50 shadow-sm dark:bg-saffron-900/30' : 'bg-transparent'
                  )}
                >
                <Icon
                  className={clsx('w-5 h-5', isActive ? 'text-saffron-500' : '')}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={clsx('text-[10px] font-medium leading-none', isActive ? 'font-bold' : 'opacity-85')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
