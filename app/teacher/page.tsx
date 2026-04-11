'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ALL_CHAPTERS } from '@/lib/data';
import type {
  TeacherAssignmentAnalytics,
  TeacherAssignmentPack,
  TeacherScope,
  TeacherStorageStatus,
  TeacherActionHistoryEntry,
} from '@/lib/teacher-types';
import {
  LayoutDashboard, Package, PenSquare, Users, Megaphone,
  HelpCircle, Wand2, BookMarked, ClipboardCheck, ScrollText,
  CalendarDays, RefreshCw, TrendingUp, Clock, AlertCircle,
  ChevronRight,
} from 'lucide-react';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

const QUICK_LINKS = [
  { href: '/teacher/announcements',label: 'Announcements', icon: Megaphone,     desc: 'Send class notices',        color: 'from-violet-500 to-purple-500'  },
  { href: '/teacher/assignments',  label: 'Assignments',   icon: Package,       desc: 'Create & publish packs',    color: 'from-amber-500 to-orange-500'   },
  { href: '/teacher/grading',      label: 'Grading Desk',  icon: PenSquare,     desc: 'Review submissions',        color: 'from-blue-500 to-indigo-500'    },
  { href: '/teacher/students',     label: 'Students',      icon: Users,         desc: 'Performance tracking',      color: 'from-emerald-500 to-teal-500'   },
  { href: '/teacher/ai-tools',     label: 'AI Tools',      icon: Wand2,         desc: 'Generate content',          color: 'from-rose-500 to-pink-500'      },
  { href: '/teacher/question-bank',label: 'Question Bank', icon: HelpCircle,    desc: 'Manage questions',          color: 'from-cyan-500 to-sky-500'       },
  { href: '/teacher/attendance',   label: 'Attendance',    icon: ClipboardCheck,desc: 'Mark daily attendance',     color: 'from-lime-500 to-green-500'     },
  { href: '/teacher/gradebook',    label: 'Gradebook',     icon: ScrollText,    desc: 'Consolidated grades',       color: 'from-orange-500 to-amber-600'   },
  { href: '/teacher/resources',    label: 'Resources',     icon: BookMarked,    desc: 'Teaching materials',        color: 'from-fuchsia-500 to-violet-500' },
  { href: '/teacher/calendar',     label: 'Calendar',      icon: CalendarDays,  desc: 'School events',             color: 'from-sky-500 to-blue-600'       },
];

export default function TeacherOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState('Teacher');
  const [analytics, setAnalytics] = useState<TeacherAssignmentAnalytics | null>(null);
  const [packs, setPacks] = useState<TeacherAssignmentPack[]>([]);
  const [history, setHistory] = useState<TeacherActionHistoryEntry[]>([]);
  const [storageStatus, setStorageStatus] = useState<TeacherStorageStatus | null>(null);
  const [scopes, setScopes] = useState<TeacherScope[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sessionRes, configRes] = await Promise.all([
          fetch('/api/teacher/session/me', { cache: 'no-store' }),
          fetch('/api/teacher', { cache: 'no-store' }),
        ]);
        if (!sessionRes.ok) { router.replace('/teacher/login'); return; }
        const sessionData = unwrap<Record<string, unknown> | null>(await sessionRes.json().catch(() => null));
        const teacherInfo = sessionData?.teacher as { name?: string } | undefined;
        setTeacherName(typeof teacherInfo?.name === 'string' && teacherInfo.name.trim() ? teacherInfo.name : 'Teacher');
        setScopes(Array.isArray(sessionData?.effectiveScopes) ? sessionData.effectiveScopes as TeacherScope[] : []);

        const cfgBody = await configRes.json().catch(() => null);
        const cfg = unwrap<{
          assignmentAnalytics?: TeacherAssignmentAnalytics;
          assignmentPacks?: TeacherAssignmentPack[];
          actionHistory?: TeacherActionHistoryEntry[];
          storageStatus?: TeacherStorageStatus;
        } | null>(cfgBody);
        if (configRes.ok && cfg) {
          setAnalytics(cfg.assignmentAnalytics ?? null);
          setPacks(cfg.assignmentPacks ?? []);
          setHistory(cfg.actionHistory ?? []);
          setStorageStatus(cfg.storageStatus ?? null);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const activeSubjects = useMemo(() => {
    const seen = new Set<string>();
    scopes.forEach((s) => { if (s.isActive) seen.add(`${s.classLevel} ${s.subject}`); });
    return [...seen];
  }, [scopes]);

  const recentPacks = packs.slice(0, 3);
  const pendingGrades = packs.filter((p) => p.status === 'published' || p.status === 'review').length;
  const draftCount = packs.filter((p) => p.status === 'draft').length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white px-6 py-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-fraunces text-2xl sm:text-3xl font-bold">Welcome back, {teacherName}</h1>
            <p className="text-amber-100 text-sm mt-1.5">Teacher Assessment Desk — manage your classes, assignments, and students.</p>
            {activeSubjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {activeSubjects.map((s) => (
                  <span key={s} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/20 border border-white/30">{s}</span>
                ))}
              </div>
            )}
          </div>
          <LayoutDashboard className="w-8 h-8 text-white/40 flex-shrink-0" />
        </div>
      </div>

      {/* Storage & alerts */}
      {storageStatus && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs mb-4 flex items-center gap-2 ${storageStatus.mode === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span><span className="font-semibold">Storage:</span> {storageStatus.message}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Packs', value: packs.length, icon: Package, color: 'text-amber-600 bg-amber-50' },
          { label: 'Drafts', value: draftCount, icon: Clock, color: 'text-amber-600 bg-amber-50' },
          { label: 'Active/Approved', value: pendingGrades, icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
          { label: 'Subjects', value: activeSubjects.length, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${color}`}>
              <Icon className="w-4.5 h-4.5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '—' : value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Quick nav */}
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Quick Navigation</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {QUICK_LINKS.map(({ href, label, icon: Icon, desc, color }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-[#E8E4DC] bg-white p-4 hover:border-amber-300 hover:shadow-md transition-all"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">{label}</p>
                  <p className="text-xs text-gray-400 truncate">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Recent Assignments</h2>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : recentPacks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No assignments yet.</p>
              <Link href="/teacher/assignments" className="text-amber-600 hover:text-amber-700 text-xs font-medium mt-1 block">Create one →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPacks.map((pack) => {
                const ch = ALL_CHAPTERS.find((c) => c.id === pack.chapterId);
                return (
                  <Link
                    key={pack.packId}
                    href="/teacher/assignments"
                    className="flex items-center gap-3 rounded-xl border border-[#E8E4DC] bg-white p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{ch?.title ?? pack.chapterId}</p>
                      <p className="text-[11px] text-gray-400">{pack.status} · {new Date(pack.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </Link>
                );
              })}
              <Link href="/teacher/assignments" className="text-xs font-medium text-amber-600 hover:text-amber-700 block text-center py-1">
                View all assignments →
              </Link>
            </div>
          )}

          {history.length > 0 && (
            <>
              <h2 className="font-semibold text-gray-700 mb-3 mt-5 text-sm">Recent Activity</h2>
              <div className="space-y-2">
                {history.slice(0, 4).map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <span className="flex-1">{entry.action} {entry.chapterId ? `· ${ALL_CHAPTERS.find((c) => c.id === entry.chapterId)?.title ?? entry.chapterId}` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
