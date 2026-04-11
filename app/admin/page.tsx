'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, GraduationCap, Layers, BarChart2,
  Bell, CalendarDays, Activity, Upload, Settings, ChevronRight,
  RefreshCw, AlertCircle, TrendingUp, School,
} from 'lucide-react';

interface AdminOverviewResponse {
  totalTeachers: number;
  activeTeachers: number;
  scopesByClass: Array<{ classLevel: 10 | 12; count: number }>;
  topWeakTopics: Array<{ topic: string; count: number }>;
  assignmentCompletionsThisWeek: number;
  storageStatus?: { mode: 'connected' | 'degraded'; message: string };
  highRiskExamSessions?: number;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) return (payload as { data: T }).data;
  return payload as T;
}

const QUICK_LINKS = [
  { href: '/admin/teachers',        label: 'Teachers',        icon: Users,         desc: 'Manage teacher accounts',     color: 'from-indigo-500 to-blue-500'     },
  { href: '/admin/students',        label: 'Students',        icon: GraduationCap, desc: 'Manage student roster',       color: 'from-emerald-500 to-teal-500'    },
  { href: '/admin/class-sections',  label: 'Class Sections',  icon: Layers,        desc: 'Configure classes & batches', color: 'from-violet-500 to-purple-500'   },
  { href: '/admin/analytics',       label: 'Analytics',       icon: BarChart2,     desc: 'School-wide insights',        color: 'from-amber-500 to-orange-500'    },
  { href: '/admin/announcements',   label: 'Announcements',   icon: Bell,          desc: 'Broadcast school notices',    color: 'from-rose-500 to-pink-500'       },
  { href: '/admin/timetable',       label: 'Timetable',       icon: CalendarDays,  desc: 'Class schedule builder',      color: 'from-sky-500 to-blue-600'        },
  { href: '/admin/events',          label: 'Events',          icon: Activity,      desc: 'School events & holidays',    color: 'from-lime-500 to-green-500'      },
  { href: '/admin/roster-import',   label: 'Roster Import',   icon: Upload,        desc: 'Bulk import students',        color: 'from-cyan-500 to-sky-500'        },
  { href: '/admin/settings',        label: 'Settings',        icon: Settings,      desc: 'School configuration',        color: 'from-slate-500 to-gray-600'      },
];

export default function AdminOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [schoolName, setSchoolName] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [sessionRes, overviewRes] = await Promise.all([
          fetch('/api/admin/session/me', { cache: 'no-store' }),
          fetch('/api/admin/overview', { cache: 'no-store' }),
        ]);
        if (!sessionRes.ok) { router.replace('/admin/login'); return; }
        const sessionBody = unwrap<{ schoolName?: string; displayName?: string } | null>(await sessionRes.json().catch(() => null));
        setSchoolName(sessionBody?.schoolName ?? sessionBody?.displayName ?? 'School Admin');

        const ovBody = await overviewRes.json().catch(() => null);
        const ov = unwrap<AdminOverviewResponse | null>(ovBody);
        if (overviewRes.ok && ov) setOverview(ov);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white px-6 py-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-fraunces text-2xl sm:text-3xl font-bold">Admin Console</h1>
            <p className="text-indigo-100 text-sm mt-1.5">{schoolName} — manage teachers, students, and school settings.</p>
          </div>
          <School className="w-8 h-8 text-white/40 flex-shrink-0" />
        </div>
      </div>

      {/* Storage */}
      {overview?.storageStatus && (
        <div className={`rounded-xl border px-4 py-2.5 text-xs mb-4 flex items-center gap-2 ${overview.storageStatus.mode === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span><span className="font-semibold">Storage:</span> {overview.storageStatus.message}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Teachers', value: overview?.totalTeachers ?? '—', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Active Teachers', value: overview?.activeTeachers ?? '—', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Completions (Week)', value: overview?.assignmentCompletionsThisWeek ?? '—', icon: BarChart2, color: 'text-amber-600 bg-amber-50' },
          { label: 'High Risk Sessions', value: overview?.highRiskExamSessions ?? 0, icon: AlertCircle, color: 'text-rose-600 bg-rose-50' },
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
                className="group flex items-center gap-3 rounded-2xl border border-[#E8E4DC] bg-white p-4 hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">{label}</p>
                  <p className="text-xs text-gray-400 truncate">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Weak topics */}
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 text-sm">Top Weak Topics</h2>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (overview?.topWeakTopics ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No analytics yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {overview!.topWeakTopics.slice(0, 6).map(({ topic, count }) => (
                <div key={topic} className="flex items-center gap-3 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate capitalize">{topic}</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">{count}</span>
                </div>
              ))}
              <Link href="/admin/analytics" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 block text-center py-1">
                View full analytics →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
