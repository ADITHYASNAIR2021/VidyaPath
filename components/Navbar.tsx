'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, Menu, X } from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';
import ClassPicker from '@/components/ClassPicker';
import { useTheme } from '@/components/ThemeProvider';
import { PRIMARY_NAV, STUDY_TOOLS_NAV, isNavItemActive, type NavItem } from '@/lib/ui/nav-links';

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-xl p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-soft)]"
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      )}
    </button>
  );
}

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const Icon = item.icon;
  const isActive = isNavItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap',
        isActive
          ? 'bg-saffron-50 text-saffron-700 shadow-sm dark:bg-saffron-900/30 dark:text-saffron-300'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)]'
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {item.label}
    </Link>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/82 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 group shrink-0" onClick={() => setMobileOpen(false)}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-saffron-500 via-amber-500 to-blue-600 text-white shadow-[0_8px_20px_rgba(232,81,26,0.32)]">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <div className="font-fraunces text-xl font-bold text-[var(--color-text)]">
                Vidya<span className="ui-gradient-text">Path</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Free · No login</div>
            </div>
          </Link>

          <div className="glass-nav no-scrollbar hidden max-w-[62vw] items-center gap-1 overflow-x-auto rounded-2xl p-1 lg:flex">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <ClassPicker />
            <ThemeToggle />
            <CommandPalette />
          </div>

          <div className="lg:hidden flex items-center gap-2">
            <ThemeToggle />
            <CommandPalette />
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded-xl p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-soft)]"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="glass-nav lg:hidden border-t border-[var(--color-border)]">
          <div className="px-4 py-3 space-y-1">
            <ClassPicker variant="full" className="mb-3" />
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} />
            ))}
            <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              Study tools
            </p>
            {STUDY_TOOLS_NAV.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setMobileOpen(false)} />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
