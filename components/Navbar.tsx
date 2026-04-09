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
  Terminal,
} from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Chapters', icon: BookOpen },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/formulas', label: 'Formulas', icon: Calculator },
  { href: '/equations', label: 'Equations', icon: Calculator },
  { href: '/api-lab', label: 'API Lab', icon: Terminal },
  { href: '/dashboard', label: 'Dashboard', icon: Target },
  { href: '/career', label: 'Career', icon: Compass },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isExamRoute = pathname.startsWith('/exam/assignment/');

  if (isExamRoute) {
    return (
      <nav className="sticky top-0 z-50 border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-14 flex items-center justify-between">
            <Link href="/" className="font-fraunces text-lg font-bold text-navy-700">
              Vidya<span className="text-saffron-500">Path</span>
            </Link>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Proctored Exam Mode
            </span>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
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

          <div className="hidden xl:flex items-center gap-1 rounded-2xl border border-[#E8E4DC] bg-white p-1">
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
            <Link
              href="/student/login"
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Student Login
            </Link>
            <Link
              href="/teacher/login"
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              Teacher Login
            </Link>
            <Link
              href="/admin/login"
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              Admin Login
            </Link>
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
            <div className="pt-2 grid grid-cols-1 gap-2">
              <Link
                href="/student/login"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold text-center px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Student Login
              </Link>
              <Link
                href="/teacher/login"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold text-center px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700"
              >
                Teacher Login
              </Link>
              <Link
                href="/admin/login"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold text-center px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700"
              >
                Admin Login
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
