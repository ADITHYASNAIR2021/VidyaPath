'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  FileText,
  Compass,
  GraduationCap,
  Menu,
  X,
  Bookmark,
  Target,
  Calculator,
  Home,
} from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Chapters', icon: BookOpen },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/formulas', label: 'Formulas', icon: Calculator },
  { href: '/dashboard', label: 'Dashboard', icon: Target },
  { href: '/career', label: 'Career', icon: Compass },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-saffron-500 to-amber-500 text-white flex items-center justify-center shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <div className="font-fraunces text-xl font-bold text-navy-700">
                Vidya<span className="text-saffron-500">Path</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-[#8A8AAA]">Board prep toolkit</div>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-1 rounded-2xl border border-[#E8E4DC] bg-white p-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-saffron-50 text-saffron-700'
                      : 'text-[#4A4A6A] hover:bg-[#F7F5F0] hover:text-[#1C1C2E]'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <CommandPalette />
            <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Free forever
            </span>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <CommandPalette />
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="p-2 rounded-xl text-[#4A4A6A] hover:bg-gray-100 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#E8E4DC] bg-white">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                    isActive ? 'bg-saffron-50 text-saffron-700' : 'text-[#4A4A6A] hover:bg-[#F7F5F0]'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            <div className="pt-2 pb-1">
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium">
                100% free and no login required
              </span>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
