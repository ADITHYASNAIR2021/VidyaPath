'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { MOBILE_TAB_NAV, isNavItemActive } from '@/lib/ui/nav-links';

export default function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden fixed bottom-2 left-0 right-0 z-50 px-3 pb-safe">
      <div className="floating-dock mx-auto flex max-w-xl items-center justify-around rounded-2xl px-2 py-2">
        {MOBILE_TAB_NAV.map(({ href, label, icon: Icon }) => {
          const isActive = isNavItemActive(pathname, href);
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
                <Icon className={clsx('w-5 h-5', isActive ? 'text-saffron-500' : '')} strokeWidth={isActive ? 2.5 : 2} />
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
