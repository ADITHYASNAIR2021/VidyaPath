'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Users,
  ShieldCheck,
  Wrench,
  LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';
import type { PlatformRole } from '@/lib/auth/roles';

type ActiveRole = PlatformRole;

interface SessionPayload {
  role: ActiveRole;
  authenticated: boolean;
}

function getNavLinks(role: ActiveRole) {
  if (role === 'student') {
    return [
      { href: '/', label: 'Home', icon: Home },
      { href: '/chapters', label: 'Chapters', icon: BookOpen },
      { href: '/papers', label: 'Papers', icon: FileText },
      { href: '/formulas', label: 'Formulas', icon: Calculator },
      { href: '/equations', label: 'Equations', icon: Calculator },
      { href: '/dashboard', label: 'Dashboard', icon: Target },
      { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
    ];
  }
  if (role === 'teacher') {
    return [
      { href: '/', label: 'Home', icon: Home },
      { href: '/teacher', label: 'Teacher Desk', icon: Users },
      { href: '/teacher?tab=assignments', label: 'Assignments', icon: FileText },
      { href: '/teacher?tab=results', label: 'Results', icon: Target },
      { href: '/teacher?tab=question-builder', label: 'Question Builder', icon: BookOpen },
    ];
  }
  if (role === 'admin') {
    return [
      { href: '/', label: 'Home', icon: Home },
      { href: '/admin', label: 'Admin Console', icon: ShieldCheck },
      { href: '/admin?tab=teachers', label: 'Teachers', icon: Users },
      { href: '/admin?tab=students', label: 'Students', icon: GraduationCap },
      { href: '/admin?tab=analytics', label: 'School Analytics', icon: Target },
    ];
  }
  if (role === 'developer') {
    return [
      { href: '/', label: 'Home', icon: Home },
      { href: '/developer', label: 'Developer Console', icon: Wrench },
      { href: '/developer?tab=schools', label: 'Schools', icon: GraduationCap },
      { href: '/developer?tab=usage', label: 'Platform Usage', icon: Target },
      { href: '/developer?tab=audit', label: 'Audit', icon: ShieldCheck },
      { href: '/api-lab', label: 'API Lab', icon: Terminal },
    ];
  }
  return [
    { href: '/', label: 'Home', icon: Home },
    { href: '/chapters', label: 'Chapters', icon: BookOpen },
    { href: '/papers', label: 'Papers', icon: FileText },
    { href: '/career', label: 'Career', icon: Compass },
  ];
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState<SessionPayload>({ role: 'anonymous', authenticated: false });
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isExamRoute = pathname.startsWith('/exam/assignment/');
  const navLinks = useMemo(() => getNavLinks(session.role), [session.role]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!active || !payload || typeof payload.role !== 'string') return;
        const role = payload.role as ActiveRole;
        setSession({ role, authenticated: !!payload.authenticated && role !== 'anonymous' });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
    };
  }, [pathname]);

  async function logout() {
    if (session.role === 'anonymous') return;
    setLoggingOut(true);
    try {
      if (session.role === 'student') {
        await fetch('/api/student/session/logout', { method: 'POST' });
      } else if (session.role === 'teacher') {
        await fetch('/api/teacher/session/logout', { method: 'POST' });
      } else {
        await fetch('/api/admin/session/logout', { method: 'POST' });
      }
    } finally {
      setLoggingOut(false);
      setMobileOpen(false);
      setSession({ role: 'anonymous', authenticated: false });
      router.replace('/');
      router.refresh();
    }
  }

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
            {navLinks.map(({ href, label, icon: Icon }) => {
              const hrefPath = href.split('?')[0];
              const isActive = hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath);
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
            {session.authenticated ? (
              <button
                onClick={logout}
                disabled={loggingOut}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" />
                {loggingOut ? 'Signing out...' : 'Logout'}
              </button>
            ) : (
              <>
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
              </>
            )}
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
            {navLinks.map(({ href, label, icon: Icon }) => {
              const hrefPath = href.split('?')[0];
              const isActive = hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath);
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
            {session.authenticated ? (
              <button
                onClick={logout}
                disabled={loggingOut}
                className="w-full mt-2 text-sm font-semibold text-center px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 disabled:opacity-60"
              >
                {loggingOut ? 'Signing out...' : 'Logout'}
              </button>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
