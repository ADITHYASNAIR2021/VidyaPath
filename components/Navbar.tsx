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
  Zap,
  Upload,
  BarChart2,
  Search,
  FlaskConical,
} from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from '@/components/CommandPalette';
import type { PlatformRole } from '@/lib/auth/roles';

type ActiveRole = PlatformRole;

interface SessionState {
  role: ActiveRole;
  authenticated: boolean;
  displayName?: string;
}

/* ── Role meta (badge colour + label) ─────────────────────────────────── */
const ROLE_META: Record<Exclude<ActiveRole, 'anonymous'>, { label: string; chip: string }> = {
  student:   { label: 'Student',   chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  teacher:   { label: 'Teacher',   chip: 'bg-indigo-50  text-indigo-700  border-indigo-200'  },
  admin:     { label: 'Admin',     chip: 'bg-amber-50   text-amber-700   border-amber-200'   },
  developer: { label: 'Developer', chip: 'bg-violet-50  text-violet-700  border-violet-200'  },
};

/* ── Nav links per role ───────────────────────────────────────────────── */
function getNavLinks(role: ActiveRole) {
  switch (role) {
    case 'student':
      return [
        { href: '/',           label: 'Home',       icon: Home       },
        { href: '/chapters',   label: 'Chapters',   icon: BookOpen   },
        { href: '/dashboard',  label: 'Dashboard',  icon: Target     },
        { href: '/papers',     label: 'Papers',     icon: FileText   },
        { href: '/formulas',   label: 'Formulas',   icon: Calculator },
        { href: '/equations',  label: 'Equations',  icon: FlaskConical },
        { href: '/bookmarks',  label: 'Bookmarks',  icon: Bookmark   },
      ];

    case 'teacher':
      return [
        { href: '/',           label: 'Home',           icon: Home     },
        { href: '/teacher',    label: 'Teacher Desk',   icon: Users    },
        { href: '/chapters',   label: 'Chapters',       icon: BookOpen },
        { href: '/formulas',   label: 'Formulas',       icon: Calculator },
        { href: '/equations',  label: 'Equations',      icon: FlaskConical },
        { href: '/papers',     label: 'Papers',         icon: FileText },
      ];

    case 'admin':
      return [
        { href: '/',                    label: 'Home',           icon: Home       },
        { href: '/admin',               label: 'Admin Console',  icon: ShieldCheck },
        { href: '/admin/roster-import', label: 'Roster Import',  icon: Upload     },
        { href: '/chapters',            label: 'Chapters',       icon: BookOpen   },
        { href: '/formulas',            label: 'Formulas',       icon: Calculator },
      ];

    case 'developer':
      return [
        { href: '/',                    label: 'Home',           icon: Home       },
        { href: '/developer',           label: 'Dev Console',    icon: Wrench     },
        { href: '/developer/schools',   label: 'Schools',        icon: GraduationCap },
        { href: '/developer/usage',     label: 'Usage',          icon: BarChart2  },
        { href: '/developer/audit',     label: 'Audit',          icon: ShieldCheck },
        { href: '/api-lab',             label: 'API Lab',        icon: Terminal   },
        { href: '/chapters',            label: 'Chapters',       icon: BookOpen   },
      ];

    default: // anonymous
      return [
        { href: '/',          label: 'Home',      icon: Home        },
        { href: '/chapters',  label: 'Chapters',  icon: BookOpen    },
        { href: '/formulas',  label: 'Formulas',  icon: Calculator  },
        { href: '/equations', label: 'Equations', icon: FlaskConical },
        { href: '/papers',    label: 'Papers',    icon: FileText    },
        { href: '/career',    label: 'Career',    icon: Compass     },
      ];
  }
}

/* ── Logout endpoints ─────────────────────────────────────────────────── */
async function callLogout(role: ActiveRole) {
  const urls: Partial<Record<ActiveRole, string>> = {
    student:   '/api/student/session/logout',
    teacher:   '/api/teacher/session/logout',
    admin:     '/api/admin/session/logout',
    developer: '/api/developer/session/logout',
  };
  const url = urls[role];
  if (url) await fetch(url, { method: 'POST' }).catch(() => undefined);
}

/* ── Component ────────────────────────────────────────────────────────── */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [session, setSession] = useState<SessionState>({ role: 'anonymous', authenticated: false });
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isExamRoute = pathname.startsWith('/exam/assignment/');
  const isPortalRoute =
    pathname.startsWith('/teacher') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/developer');
  const navLinks = useMemo(() => getNavLinks(session.role), [session.role]);
  const roleMeta = session.role !== 'anonymous' ? ROLE_META[session.role] : null;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        const data = payload?.data ?? payload;
        if (!active || !data || typeof data.role !== 'string') return;
        const role = data.role as ActiveRole;
        setSession({
          role,
          authenticated: !!data.authenticated && role !== 'anonymous',
          displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
        });
      })
      .catch(() => undefined);
    return () => { active = false; controller.abort(); };
  }, [pathname]);

  async function logout() {
    if (session.role === 'anonymous') return;
    setLoggingOut(true);
    try {
      await callLogout(session.role);
    } finally {
      setLoggingOut(false);
      setMobileOpen(false);
      setSession({ role: 'anonymous', authenticated: false });
      router.replace('/');
      router.refresh();
    }
  }

  /* Portal routes — Sidebar handles navigation */
  if (isPortalRoute) return null;

  /* Exam mode — minimal nav */
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

  const NavLink = ({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) => {
    const hrefPath = href.split('?')[0];
    const isActive = hrefPath === '/' ? pathname === '/' : pathname.startsWith(hrefPath);
    return (
      <Link
        href={href}
        onClick={onClick}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
          isActive
            ? 'bg-saffron-50 text-saffron-700'
            : 'text-[#4A4A6A] hover:bg-[#F7F5F0] hover:text-[#1C1C2E]'
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-[#E8E4DC] bg-white/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">

          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 group shrink-0" onClick={() => setMobileOpen(false)}>
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

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-1 rounded-2xl border border-[#E8E4DC] bg-white p-1 overflow-x-auto max-w-[60vw]">
            {navLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} />
            ))}
          </div>

          {/* Desktop right area */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <CommandPalette />

            {session.authenticated ? (
              <div className="flex items-center gap-2">
                {/* Role + name badge */}
                {roleMeta && (
                  <span className={clsx('inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold', roleMeta.chip)}>
                    {session.role === 'developer' && <Wrench className="w-3 h-3" />}
                    {session.role === 'admin'     && <ShieldCheck className="w-3 h-3" />}
                    {session.role === 'teacher'   && <Users className="w-3 h-3" />}
                    {session.role === 'student'   && <GraduationCap className="w-3 h-3" />}
                    {session.displayName ? session.displayName : roleMeta.label}
                  </span>
                )}
                {/* AI access badge for non-students */}
                {(session.role === 'teacher' || session.role === 'admin' || session.role === 'developer') && (
                  <span className="inline-flex items-center gap-1 rounded-xl border border-saffron-200 bg-saffron-50 px-2 py-1.5 text-[11px] font-semibold text-saffron-700">
                    <Zap className="w-3 h-3" />
                    AI
                  </span>
                )}
                <button
                  onClick={logout}
                  disabled={loggingOut}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-60"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {loggingOut ? 'Signing out…' : 'Logout'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/student/login"  className="text-xs font-semibold px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">Student</Link>
                <Link href="/teacher/login"  className="text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">Teacher</Link>
                <Link href="/admin/login"    className="text-xs font-semibold px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">Admin</Link>
                <Link href="/developer/login" className="text-xs font-semibold px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">Developer</Link>
              </div>
            )}
          </div>

          {/* Mobile right area */}
          <div className="lg:hidden flex items-center gap-2">
            <CommandPalette />
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="p-2 rounded-xl text-[#4A4A6A] hover:bg-gray-100 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#E8E4DC] bg-white">
          <div className="px-4 py-3 space-y-1">

            {/* Role badge (mobile) */}
            {session.authenticated && roleMeta && (
              <div className={clsx('mb-2 inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold', roleMeta.chip)}>
                {session.displayName ? session.displayName : roleMeta.label}
                {(session.role === 'teacher' || session.role === 'admin' || session.role === 'developer') && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-saffron-600"><Zap className="w-3 h-3" />AI</span>
                )}
              </div>
            )}

            {navLinks.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} icon={icon} onClick={() => setMobileOpen(false)} />
            ))}

            {session.authenticated ? (
              <button
                onClick={logout}
                disabled={loggingOut}
                className="w-full mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                {loggingOut ? 'Signing out…' : 'Logout'}
              </button>
            ) : (
              <div className="pt-2 grid grid-cols-2 gap-2">
                <Link href="/student/login"   onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-center px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">Student</Link>
                <Link href="/teacher/login"   onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-center px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">Teacher</Link>
                <Link href="/admin/login"     onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-center px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700">Admin</Link>
                <Link href="/developer/login" onClick={() => setMobileOpen(false)} className="text-sm font-semibold text-center px-3 py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700">Developer</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
