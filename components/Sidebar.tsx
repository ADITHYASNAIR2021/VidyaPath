'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  BookOpen, Users, LogOut, Upload, BarChart2, Terminal, GraduationCap,
  ClipboardList, PenSquare, FileCheck, Megaphone, Wand2, HelpCircle,
  BookMarked, CalendarDays, Package, LayoutDashboard, School, Activity,
  Settings, ScrollText, Menu, X, ChevronLeft, ChevronRight,
  Bell, ClipboardCheck, Layers, Bookmark, MessageSquare, BrainCircuit,
} from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/components/ThemeProvider';

type Role = 'student' | 'teacher' | 'admin' | 'developer';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const TEACHER_NAV: NavItem[] = [
  { href: '/teacher',               label: 'Overview',       icon: LayoutDashboard },
  { href: '/teacher/announcements', label: 'Announcements',  icon: Megaphone },
  { href: '/teacher/assignments',   label: 'Assignments',    icon: Package },
  { href: '/teacher/grading',       label: 'Grading Desk',   icon: PenSquare },
  { href: '/teacher/my-class',       label: 'My Class',       icon: GraduationCap },
  { href: '/teacher/students',      label: 'Students',       icon: Users },
  { href: '/teacher/question-bank', label: 'Question Bank',  icon: HelpCircle },
  { href: '/teacher/ai-tools',         label: 'AI Tools',        icon: Wand2 },
  { href: '/teacher/chapter-toolkit', label: 'Chapter Toolkit', icon: BookOpen },
  { href: '/teacher/weekly-plans',    label: 'Weekly Plans',    icon: CalendarDays },
  { href: '/teacher/resources',       label: 'Resources',       icon: BookMarked },
  { href: '/teacher/attendance',      label: 'Attendance',      icon: ClipboardCheck },
  { href: '/teacher/gradebook',       label: 'Gradebook',       icon: ScrollText },
  { href: '/teacher/calendar',        label: 'Calendar',        icon: CalendarDays },
  { href: '/teacher/questions',       label: 'Student Q&A',     icon: MessageSquare },
];

const STUDENT_NAV: NavItem[] = [
  { href: '/dashboard',         label: 'Overview',      icon: LayoutDashboard },
  { href: '/chapters',          label: 'Study',         icon: BookOpen },
  { href: '/formulas',          label: 'Formulas',      icon: BookMarked },
  { href: '/equations',         label: 'Equations',     icon: HelpCircle },
  { href: '/papers',            label: 'Papers',        icon: ClipboardList },
  { href: '/bookmarks',         label: 'Bookmarks',     icon: Bookmark },
  { href: '/student/grades',    label: 'Grades',        icon: ScrollText },
  { href: '/student/attendance',label: 'Attendance',    icon: ClipboardCheck },
  { href: '/student/timetable', label: 'Timetable',     icon: CalendarDays },
  { href: '/student/resources', label: 'Resources',     icon: BookMarked },
  { href: '/student/calendar',  label: 'Calendar',      icon: CalendarDays },
  { href: '/student/achievements', label: 'Achievements', icon: Activity },
  { href: '/student/notes',        label: 'My Notes',      icon: PenSquare },
  { href: '/student/ai-tools',     label: 'AI Study Tools', icon: BrainCircuit },
  { href: '/student/questions',    label: 'My Questions',  icon: MessageSquare },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin',                 label: 'Overview',       icon: LayoutDashboard },
  { href: '/admin/teachers',        label: 'Teachers',       icon: Users },
  { href: '/admin/students',        label: 'Students',       icon: GraduationCap },
  { href: '/admin/class-sections',  label: 'Class Sections', icon: Layers },
  { href: '/admin/analytics',       label: 'Analytics',      icon: BarChart2 },
  { href: '/admin/gradebook',       label: 'Gradebook',      icon: ScrollText },
  { href: '/admin/announcements',   label: 'Announcements',  icon: Bell },
  { href: '/admin/timetable',       label: 'Timetable',      icon: CalendarDays },
  { href: '/admin/events',          label: 'Events',         icon: Activity },
  { href: '/admin/roster-import',   label: 'Roster Import',  icon: Upload },
  { href: '/admin/settings',        label: 'Settings',       icon: Settings },
];

const DEVELOPER_NAV: NavItem[] = [
  { href: '/developer',                   label: 'Overview',       icon: LayoutDashboard },
  { href: '/developer/schools',           label: 'Schools',        icon: School },
  { href: '/developer/usage',             label: 'Token Usage',    icon: BarChart2 },
  { href: '/developer/audit',             label: 'Audit Log',      icon: ScrollText },
  { href: '/developer/observability',     label: 'Observability',  icon: Activity },
  { href: '/developer/career-health',     label: 'Career Health',  icon: ClipboardList },
  { href: '/api-lab',                     label: 'API Lab',        icon: Terminal },
  { href: '/developer/onboarding',        label: 'Affiliate Queue',icon: FileCheck },
];

const ROLE_CONFIG: Record<Role, {
  nav: NavItem[];
  label: string;
  gradient: string;
  ring: string;
  logoutUrl: string;
  logoutRedirect: string;
}> = {
  student: {
    nav: STUDENT_NAV,
    label: 'Student Hub',
    gradient: 'from-emerald-600 to-teal-600',
    ring: 'ring-emerald-400/30',
    logoutUrl: '/api/student/session/logout',
    logoutRedirect: '/login?portal=student&logout=1',
  },
  teacher: {
    nav: TEACHER_NAV,
    label: 'Teacher Portal',
    gradient: 'from-amber-600 to-orange-600',
    ring: 'ring-amber-400/30',
    logoutUrl: '/api/teacher/session/logout',
    logoutRedirect: '/login?portal=teacher&logout=1',
  },
  admin: {
    nav: ADMIN_NAV,
    label: 'Admin Console',
    gradient: 'from-indigo-600 to-indigo-700',
    ring: 'ring-indigo-400/30',
    logoutUrl: '/api/admin/session/logout',
    logoutRedirect: '/login?portal=admin&logout=1',
  },
  developer: {
    nav: DEVELOPER_NAV,
    label: 'Developer Console',
    gradient: 'from-violet-600 to-violet-700',
    ring: 'ring-violet-400/30',
    logoutUrl: '/api/developer/session/logout',
    logoutRedirect: '/login?portal=developer',
  },
};

function ThemeToggleInSidebar({ collapsed }: { collapsed: boolean }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={clsx(
        'flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors',
        collapsed && 'justify-center px-2'
      )}
      title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      )}
      {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}

interface SidebarProps {
  role: Role;
  displayName?: string;
}

export default function Sidebar({ role, displayName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const cfg = ROLE_CONFIG[role];

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch(cfg.logoutUrl, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    router.replace(cfg.logoutRedirect);
  }

  function isActive(href: string) {
    if (href === '/teacher' || href === '/admin' || href === '/developer') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`bg-gradient-to-br ${cfg.gradient} px-4 py-5 flex-shrink-0`}>
        <div className="flex items-center justify-between">
          <div className={clsx('transition-all duration-200 overflow-hidden', collapsed ? 'w-0 opacity-0' : 'w-full opacity-100')}>
            <p className="text-white font-fraunces font-bold text-sm leading-tight">Vidya<span className="text-white/70">Path</span></p>
            <p className="text-white/70 text-[11px] mt-0.5 truncate">{cfg.label}</p>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex flex-shrink-0 w-7 h-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden flex-shrink-0 w-7 h-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white"
            aria-label="Close menu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {!collapsed && displayName && (
          <p className="mt-2 text-white/80 text-xs font-medium truncate">{displayName}</p>
        )}
        {collapsed && (
          <div className="mt-2 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
            {(displayName ?? role)[0].toUpperCase()}
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Sidebar navigation">
        {cfg.nav.map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative',
                active
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/60 hover:bg-white/8 hover:text-white/90',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className={clsx('flex-shrink-0 transition-colors', active ? 'w-4.5 h-4.5' : 'w-4 h-4', active ? 'text-white' : 'text-white/50 group-hover:text-white/80')} strokeWidth={active ? 2.5 : 2} />
              {!collapsed && (
                <span className="truncate">{label}</span>
              )}
              {!collapsed && badge && (
                <span className="ml-auto bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
              )}
              {/* Active indicator */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Quick links to study content */}
      {!collapsed && (
        <div className="px-3 pb-2 border-t border-white/10 pt-2">
          <Link href="/chapters" className="flex items-center gap-2 px-2 py-1.5 text-white/50 hover:text-white/80 text-xs rounded-lg hover:bg-white/8 transition-colors">
            <BookOpen className="w-3.5 h-3.5" />
            View Chapters
          </Link>
        </div>
      )}

      {/* Dark mode toggle + Logout */}
      <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-1">
        <ThemeToggleInSidebar collapsed={collapsed} />
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className={clsx(
            'flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{loggingOut ? 'Logging out…' : 'Logout'}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger button (outside sidebar) */}
      <button
        onClick={() => setMobileOpen(true)}
        className={`md:hidden fixed top-4 left-4 z-[60] w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg text-white`}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[65] bg-black/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer */}
      <div className={clsx(
        'md:hidden fixed top-0 left-0 bottom-0 z-[70] w-72 flex flex-col',
        `bg-gradient-to-b ${cfg.gradient}`,
        'transform transition-transform duration-300 ease-in-out shadow-2xl',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <NavContent />
      </div>

      {/* Desktop sidebar */}
      <div className={clsx(
        'hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-[50]',
        `bg-gradient-to-b ${cfg.gradient}`,
        'transition-all duration-200 ease-in-out shadow-xl',
        collapsed ? 'w-16' : 'w-60'
      )}>
        <NavContent />
      </div>
    </>
  );
}
