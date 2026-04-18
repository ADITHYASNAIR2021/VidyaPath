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
    <div className="sticky top-0 z-30 border-b border-[#E8E4DC] bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-2">
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
                    ? 'border-violet-200 bg-violet-50 text-violet-700'
                    : 'border-[#E8E4DC] bg-white text-[#4A4A6A] hover:bg-gray-50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

