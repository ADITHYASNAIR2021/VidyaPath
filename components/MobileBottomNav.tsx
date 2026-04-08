'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, FileText, Compass, Bookmark, Target } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Study', icon: BookOpen },
  { href: '/dashboard', label: 'Dash', icon: Target },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/career', label: 'Career', icon: Compass },
  { href: '/bookmarks', label: 'Saved', icon: Bookmark },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E4DC] z-50 pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-col items-center justify-center w-full py-1 gap-1 flex-1',
                isActive ? 'text-saffron-600' : 'text-[#8A8AAA] hover:text-navy-700'
              )}
            >
              <div
                className={clsx(
                  'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
                  isActive ? 'bg-saffron-50' : 'bg-transparent'
                )}
              >
                <Icon className={clsx('w-5 h-5', isActive ? 'text-saffron-500' : '')} strokeWidth={isActive ? 2.5 : 2} />
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
