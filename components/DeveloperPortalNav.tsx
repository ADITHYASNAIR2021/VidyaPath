'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Code2, Compass, FileText, Home, LayoutDashboard, LineChart, School } from 'lucide-react';
import clsx from 'clsx';

interface NavLinkItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const NAV_LINKS: NavLinkItem[] = [
  { href: '/developer', label: 'Console', icon: LayoutDashboard },
  { href: '/developer/schools', label: 'Schools', icon: School },
  { href: '/developer/observability', label: 'Observability', icon: LineChart },
  { href: '/api-lab', label: 'API Lab', icon: Code2 },
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Chapters', icon: BookOpen },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/career', label: 'Career', icon: Compass },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/developer') return pathname === '/developer';
  return pathname.startsWith(href);
}

export default function DeveloperPortalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto whitespace-nowrap" aria-label="Developer portal navigation">
      {NAV_LINKS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/50 dark:bg-violet-500/20 dark:text-violet-100'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
