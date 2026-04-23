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
        { href: '/dashboard', label: 'Dash',      icon: Target    },
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
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-[#E8E4DC] dark:border-gray-700 z-50 pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const hrefPath = href.split('?')[0];
          const isActive = hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath);
          return (
            <Link
              key={href}
              href={href}
                className={clsx(
                  'flex flex-col items-center justify-center w-full py-1 gap-1 flex-1',
                  isActive ? 'text-saffron-600 dark:text-saffron-400' : 'text-[#8A8AAA] dark:text-gray-400 hover:text-navy-700 dark:hover:text-gray-100'
                )}
              >
                <div
                  className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
                    isActive ? 'bg-saffron-50 dark:bg-saffron-900/30' : 'bg-transparent'
                  )}
                >
                <Icon
                  className={clsx('w-5 h-5', isActive ? 'text-saffron-500' : '')}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={clsx('text-[10px] font-medium leading-none', isActive ? 'font-bold' : '')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
