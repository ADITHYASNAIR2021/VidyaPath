'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  BarChart2,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  Layers,
  RefreshCw,
  School,
  Settings,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import clsx from 'clsx';
import RoleStatusPanel from '@/components/RoleStatusPanel';

interface AdminOverviewResponse {
  generatedAt?: string;
  totalTeachers: number;
  activeTeachers: number;
  totalStudents: number;
  activeStudents: number;
  scopesByClass: Array<{ classLevel: 10 | 12; count: number }>;
  topWeakTopics: Array<{ topic: string; count: number }>;
  assignmentCompletionsThisWeek: number;
  storageStatus?: { mode: 'connected' | 'degraded'; message: string };
  highRiskExamSessions?: number;
  attendanceRisk?: {
    trackedStudents: number;
    highRiskStudents: number;
  };
  assignmentCompliance?: {
    assigned: number;
    submitted: number;
    percent: number;
    pendingApprovals: number;
    unreleasedGraded: number;
  };
  teacherActivity?: {
    activeIn7d: number;
    inactiveIn7d: number;
    activityRatePercent: number;
  };
  tokenUsage?: {
    events: number;
    totalTokens: number;
    topEndpoints: Array<{ endpoint: string; totalTokens: number; events: number }>;
  };
  needActionQueue?: Array<{
    id: string;
    priority: 'high' | 'medium';
    title: string;
    description: string;
    href: string;
    riskReason?: string;
  }>;
  riskExplanations?: {
    attendanceRisk: string;
    inactiveTeachers: string;
    pendingApprovals: string;
    unreleasedGraded: string;
  };
  drilldowns?: {
    attendanceRisk: Array<{ classLevel: 10 | 12; section: string; highRiskStudents: number; trackedStudents: number }>;
    inactiveTeachers: Array<{ classLevel: 10 | 12; section: string; inactiveTeachers: number; totalTeachers: number }>;
    pendingApprovals: Array<{ classLevel: 10 | 12; section: string; count: number }>;
    unreleasedGraded: Array<{ classLevel: 10 | 12; section: string; count: number }>;
  };
  parentEngagement?: {
    linkedParents: number;
    parentLogins24h: number;
    unreadAnnouncementsEstimate: number;
    lowContactStudents: number;
  };
  slaMetrics?: {
    gradingTurnaroundHours: number;
    publishToSubmitConversionPercent: number;
    teacherResponseTimeHours: number;
  };
  dataFreshness?: {
    analyticsUpdatedAt?: string;
    latestAttendanceAt?: string;
    latestTeacherActivityAt?: string;
    latestSubmissionAt?: string;
    latestTokenUsageAt?: string;
    latestParentLoginAt?: string;
  };
}

interface AdminInterventionItem {
  id: string;
  queueId: string;
  priority: 'high' | 'medium';
  title: string;
  description: string;
  riskReason: string;
  href: string;
  owner?: string;
  note?: string;
  status: 'open' | 'resolved' | 'snoozed';
  snoozeUntil?: string;
  updatedAt: string;
}

interface AdminAiInsightsResponse {
  schoolId: string;
  quality: {
    avgGroundednessScore: number;
    avgCitationCoverageScore: number;
    avgRetrievalConfidence: number;
    retrievalMissRatePercent: number;
    lowQualityGenerationRatePercent: number;
    chapterCoverageGaps: Array<{ chapterId: string; subject: string; reason: string }>;
    routingRecommendations: Array<{ task: string; recommendedProvider: string; recommendedModel: string }>;
  };
  usage: {
    events: number;
    totalTokens: number;
    topEndpoints: Array<{ endpoint: string; totalTokens: number; events: number }>;
  };
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in (payload as Record<string, unknown>)) {
    const maybe = (payload as Record<string, unknown>).message;
    if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
  }
  return fallback;
}

function formatRelativeTimestamp(value?: string): string {
  if (!value) return 'No data yet';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'No data yet';
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(value?: string): string {
  if (!value) return 'No data yet';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'No data yet';
  return new Date(parsed).toLocaleString();
}

function Sparkline({ values, tone = 'indigo' }: { values: number[]; tone?: 'indigo' | 'rose' | 'emerald' | 'amber' }) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = Math.max(1, max - min);
  const points = clean
    .map((value, index) => {
      const x = (index / Math.max(1, clean.length - 1)) * 100;
      const y = 100 - (((value - min) / range) * 100);
      return `${x},${y}`;
    })
    .join(' ');
  const stroke = tone === 'rose' ? '#e11d48' : tone === 'emerald' ? '#059669' : tone === 'amber' ? '#d97706' : '#4f46e5';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-6 w-full opacity-85">
      <polyline fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

const QUICK_LINKS = [
  { href: '/admin/onboarding', label: 'Onboarding', icon: School, desc: 'Setup wizard and readiness', color: 'from-cyan-500 to-blue-500' },
  { href: '/admin/teachers', label: 'Teachers', icon: Users, desc: 'Manage teacher accounts', color: 'from-indigo-500 to-blue-500' },
  { href: '/admin/students', label: 'Students', icon: GraduationCap, desc: 'Manage student roster', color: 'from-emerald-500 to-teal-500' },
  { href: '/admin/class-sections', label: 'Class Sections', icon: Layers, desc: 'Configure classes and batches', color: 'from-violet-500 to-purple-500' },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart2, desc: 'School-wide insights', color: 'from-amber-500 to-orange-500' },
  { href: '/admin/announcements', label: 'Announcements', icon: Bell, desc: 'Broadcast school notices', color: 'from-rose-500 to-pink-500' },
  { href: '/admin/timetable', label: 'Timetable', icon: CalendarDays, desc: 'Class schedule builder', color: 'from-sky-500 to-blue-600' },
  { href: '/admin/events', label: 'Events', icon: Activity, desc: 'School events and holidays', color: 'from-lime-500 to-green-500' },
  { href: '/admin/gradebook', label: 'Gradebook', icon: BarChart2, desc: 'Cross-class score insights', color: 'from-fuchsia-500 to-violet-600' },
  { href: '/admin/roster-import', label: 'Roster Import', icon: Upload, desc: 'Bulk import students', color: 'from-cyan-500 to-sky-500' },
  { href: '/admin/recovery', label: 'Recovery Tools', icon: AlertCircle, desc: 'Checkpoint and correction queue', color: 'from-rose-500 to-red-500' },
  { href: '/admin/settings', label: 'Settings', icon: Settings, desc: 'School configuration', color: 'from-slate-500 to-gray-600' },
];

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [interventions, setInterventions] = useState<AdminInterventionItem[]>([]);
  const [interventionDrafts, setInterventionDrafts] = useState<Record<string, { owner: string; note: string }>>({});
  const [updatingInterventionId, setUpdatingInterventionId] = useState('');
  const [interventionsWarning, setInterventionsWarning] = useState('');
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [aiInsights, setAiInsights] = useState<AdminAiInsightsResponse | null>(null);

  async function patchIntervention(
    id: string,
    patch: {
      owner?: string;
      note?: string;
      status?: 'open' | 'resolved' | 'snoozed';
      snoozeUntil?: string;
    }
  ) {
    setUpdatingInterventionId(id);
    try {
      const res = await fetch(`/api/admin/interventions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const rawBody = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractApiMessage(rawBody, 'Failed to update intervention.'));
        return false;
      }
      const body = unwrap<{ intervention?: AdminInterventionItem } | null>(rawBody);
      if (body?.intervention) {
        setInterventions((prev) => prev.map((item) => (item.id === body.intervention?.id ? body.intervention : item)));
        setInterventionDrafts((prev) => ({
          ...prev,
          [id]: {
            owner: body.intervention?.owner ?? '',
            note: body.intervention?.note ?? '',
          },
        }));
      }
      return true;
    } catch {
      setError('Failed to update intervention.');
      return false;
    } finally {
      setUpdatingInterventionId('');
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      setInterventionsWarning('');
      try {
        const [sessionRes, overviewRes, aiInsightsRes] = await Promise.all([
          fetch('/api/admin/session/me', { cache: 'no-store' }),
          fetch('/api/admin/overview', { cache: 'no-store' }),
          fetch('/api/admin/ai-insights?hours=168', { cache: 'no-store' }),
        ]);
        if (!sessionRes.ok) {
          setError('Session expired. Please sign in again.');
          return;
        }
        const sessionBody = unwrap<{ schoolName?: string; displayName?: string } | null>(await sessionRes.json().catch(() => null));
        setSchoolName(sessionBody?.schoolName ?? sessionBody?.displayName ?? 'School Admin');

        const ovBody = await overviewRes.json().catch(() => null);
        if (!overviewRes.ok) {
          setError(
            ovBody && typeof ovBody === 'object' && 'message' in (ovBody as Record<string, unknown>)
              ? String((ovBody as Record<string, unknown>).message)
              : 'Failed to load admin overview.'
          );
          setOverview(null);
          return;
        }
        const ov = unwrap<AdminOverviewResponse | null>(ovBody);
        if (!ov) return;
        setOverview(ov);
        setLastSuccessfulRefresh(new Date().toISOString());

        const aiBody = await aiInsightsRes.json().catch(() => null);
        if (aiInsightsRes.ok) {
          setAiInsights(unwrap<AdminAiInsightsResponse | null>(aiBody));
        } else {
          setAiInsights(null);
        }

        const queue = ov.needActionQueue ?? [];
        const syncRes = await fetch('/api/admin/interventions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queue: queue.map((item) => ({
              id: item.id,
              priority: item.priority,
              title: item.title,
              description: item.description,
              href: item.href,
              riskReason: item.riskReason,
            })),
          }),
        }).catch(() => null);
        const syncBodyRaw = syncRes ? await syncRes.json().catch(() => null) : null;

        if (syncRes?.ok) {
          const syncBody = unwrap<{ interventions?: AdminInterventionItem[] } | null>(syncBodyRaw);
          if (Array.isArray(syncBody?.interventions)) {
            setInterventions(syncBody.interventions);
            const nextDrafts: Record<string, { owner: string; note: string }> = {};
            for (const item of syncBody.interventions) {
              nextDrafts[item.id] = { owner: item.owner ?? '', note: item.note ?? '' };
            }
            setInterventionDrafts(nextDrafts);
          }
          return;
        }
        if (syncRes && !syncRes.ok) {
          setInterventionsWarning(
            extractApiMessage(syncBodyRaw, 'Intervention queue sync failed; loading saved interventions.')
          );
        } else if (!syncRes) {
          setInterventionsWarning('Intervention queue sync unavailable; loading saved interventions.');
        }

        const listRes = await fetch('/api/admin/interventions', { cache: 'no-store' }).catch(() => null);
        const listBodyRaw = listRes ? await listRes.json().catch(() => null) : null;
        if (!listRes?.ok) {
          if (!interventionsWarning) {
            setInterventionsWarning(
              extractApiMessage(listBodyRaw, 'Saved interventions are unavailable right now.')
            );
          }
          return;
        }
        const listBody = unwrap<{ interventions?: AdminInterventionItem[] } | null>(listBodyRaw);
        if (!Array.isArray(listBody?.interventions)) {
          if (!interventionsWarning) setInterventionsWarning('Saved interventions returned no usable data.');
          return;
        }
        setInterventions(listBody.interventions);
        const nextDrafts: Record<string, { owner: string; note: string }> = {};
        for (const item of listBody.interventions) {
          nextDrafts[item.id] = { owner: item.owner ?? '', note: item.note ?? '' };
        }
        setInterventionDrafts(nextDrafts);
      } catch {
        setError('Failed to load admin dashboard.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const overviewRes = await fetch('/api/admin/overview', { cache: 'no-store' });
          const ovBody = await overviewRes.json().catch(() => null);
          if (!overviewRes.ok) return;
          const ov = unwrap<AdminOverviewResponse | null>(ovBody);
          if (!ov) return;
          setOverview(ov);
          setLastSuccessfulRefresh(new Date().toISOString());
        } catch {
          // keep last successful snapshot visible
        }
      })();
    }, 60_000);
    return () => clearInterval(timer);
  }, [autoRefreshEnabled]);

  const degradedSources = useMemo(() => {
    const warnings: string[] = [];
    if (!overview) return warnings;
    if (!overview.assignmentCompliance) warnings.push('Assignment compliance feed');
    if (!overview.teacherActivity) warnings.push('Teacher activity feed');
    if (!overview.attendanceRisk) warnings.push('Attendance risk feed');
    if (!overview.parentEngagement) warnings.push('Parent engagement feed');
    if (!overview.slaMetrics) warnings.push('SLA metrics feed');
    if (!overview.dataFreshness) warnings.push('Data freshness metadata');
    return warnings;
  }, [overview]);

  const attendanceTrend = (overview?.drilldowns?.attendanceRisk ?? [])
    .slice(0, 6)
    .map((item) => item.highRiskStudents);
  const teacherInactivityTrend = (overview?.drilldowns?.inactiveTeachers ?? [])
    .slice(0, 6)
    .map((item) => item.inactiveTeachers);
  const approvalTrend = (overview?.drilldowns?.pendingApprovals ?? [])
    .slice(0, 6)
    .map((item) => item.count);
  const tokenTrend = (overview?.tokenUsage?.topEndpoints ?? [])
    .slice(0, 6)
    .map((item) => item.totalTokens);

  if (loading && !overview && !error) {
    return (
      <RoleStatusPanel
        role="admin"
        variant="loading"
        title="Loading Admin Console"
        message="Fetching school-wide operational data."
      />
    );
  }

  if (!loading && !overview && !error) {
    return (
      <RoleStatusPanel
        role="admin"
        variant="empty"
        title="No Admin Data Yet"
        message="No overview data is available for this school right now."
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 px-6 py-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-fraunces text-2xl font-bold sm:text-3xl">Admin Console</h1>
            <p className="mt-1.5 text-sm text-indigo-100">{schoolName} - manage teachers, students, and school settings.</p>
            <p className="mt-1 text-xs text-indigo-200">
              Last synced: {lastSuccessfulRefresh ? formatDateTime(lastSuccessfulRefresh) : 'Not synced yet'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefreshEnabled((value) => !value)}
              className="rounded-lg border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              Auto refresh: {autoRefreshEnabled ? 'On' : 'Off'}
            </button>
            <School className="h-8 w-8 flex-shrink-0 text-white/40" />
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {interventionsWarning ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{interventionsWarning}</div>
      ) : null}
      {degradedSources.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Partial Data Warning</p>
          <p className="mt-1 text-xs">Some dashboard feeds are unavailable: {degradedSources.join(', ')}.</p>
        </div>
      ) : null}

      {overview?.storageStatus ? (
        <div
          className={clsx(
            'mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs',
            overview.storageStatus.mode === 'connected'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          )}
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Storage:</span> {overview.storageStatus.message}
          </span>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Total Teachers', value: overview?.totalTeachers ?? '-', icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Active Teachers', value: overview?.activeTeachers ?? '-', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total Students', value: overview?.totalStudents ?? '-', icon: GraduationCap, color: 'text-cyan-600 bg-cyan-50' },
          { label: 'Completions (Week)', value: overview?.assignmentCompletionsThisWeek ?? '-', icon: BarChart2, color: 'text-amber-600 bg-amber-50' },
          { label: 'High Risk Sessions', value: overview?.highRiskExamSessions ?? 0, icon: AlertCircle, color: 'text-rose-600 bg-rose-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
            <div className={clsx('mb-2 flex h-9 w-9 items-center justify-center rounded-xl', color)}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '-' : value}</p>
            <p className="mt-0.5 text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm lg:col-span-2">
          <p className="text-sm font-semibold text-gray-800">Command Center</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/analytics" className="block rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 hover:bg-rose-100">
              <p className="text-[11px] font-semibold text-rose-800">Attendance Risk</p>
              <p className="text-sm font-bold text-rose-900">{overview?.attendanceRisk?.highRiskStudents ?? 0}</p>
              <p className="mt-1 text-[10px] text-rose-700">
                {overview?.riskExplanations?.attendanceRisk ?? 'Low attendance usually precedes weak exam performance.'}
              </p>
              {overview?.drilldowns?.attendanceRisk?.[0] ? (
                <p className="mt-1 text-[10px] text-rose-700">
                  Top: Class {overview.drilldowns.attendanceRisk[0].classLevel} {overview.drilldowns.attendanceRisk[0].section} ({overview.drilldowns.attendanceRisk[0].highRiskStudents} at-risk)
                </p>
              ) : null}
              <Sparkline values={attendanceTrend} tone="rose" />
            </Link>

            <Link href="/admin/analytics" className="block rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 hover:bg-indigo-100">
              <p className="text-[11px] font-semibold text-indigo-800">Assignment Compliance</p>
              <p className="text-sm font-bold text-indigo-900">{overview?.assignmentCompliance?.percent ?? 0}%</p>
              <p className="mt-1 text-[10px] text-indigo-700">Publish-to-submit conversion.</p>
              {overview?.drilldowns?.pendingApprovals?.[0] ? (
                <p className="mt-1 text-[10px] text-indigo-700">
                  Pending top: Class {overview.drilldowns.pendingApprovals[0].classLevel} {overview.drilldowns.pendingApprovals[0].section} ({overview.drilldowns.pendingApprovals[0].count})
                </p>
              ) : null}
              <Sparkline values={approvalTrend} tone="indigo" />
            </Link>

            <Link href="/admin/teachers" className="block rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 hover:bg-emerald-100">
              <p className="text-[11px] font-semibold text-emerald-800">Teacher Activity (7d)</p>
              <p className="text-sm font-bold text-emerald-900">{overview?.teacherActivity?.activityRatePercent ?? 0}%</p>
              <p className="mt-1 text-[10px] text-emerald-700">
                {overview?.riskExplanations?.inactiveTeachers ?? 'Inactive teachers delay intervention loops.'}
              </p>
              {overview?.drilldowns?.inactiveTeachers?.[0] ? (
                <p className="mt-1 text-[10px] text-emerald-700">
                  Top: Class {overview.drilldowns.inactiveTeachers[0].classLevel} {overview.drilldowns.inactiveTeachers[0].section} ({overview.drilldowns.inactiveTeachers[0].inactiveTeachers} inactive)
                </p>
              ) : null}
              <Sparkline values={teacherInactivityTrend} tone="emerald" />
            </Link>

            <Link href="/admin/analytics" className="block rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 hover:bg-amber-100">
              <p className="text-[11px] font-semibold text-amber-800">Token Usage</p>
              <p className="text-sm font-bold text-amber-900">{overview?.tokenUsage?.totalTokens ?? 0}</p>
              <p className="mt-1 text-[10px] text-amber-700">Freshness: {formatRelativeTimestamp(overview?.dataFreshness?.latestTokenUsageAt)}</p>
              <Sparkline values={tokenTrend} tone="amber" />
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">Need Action Now</p>
          <div className="mt-3 space-y-2">
            {interventions.length === 0 ? <p className="text-xs text-gray-500">No urgent action items right now.</p> : null}
            {interventions.slice(0, 6).map((item) => {
              const draft = interventionDrafts[item.id] ?? { owner: '', note: '' };
              const disabled = updatingInterventionId === item.id;
              const snoozeFor24h = () => {
                const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                return patchIntervention(item.id, { status: 'snoozed', snoozeUntil: until });
              };
              return (
                <div
                  key={item.id}
                  className={clsx(
                    'rounded-xl border px-3 py-2',
                    item.priority === 'high' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('text-[11px] font-semibold', item.priority === 'high' ? 'text-rose-800' : 'text-amber-800')}>
                      {item.title}
                    </p>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-700">{item.description}</p>
                  <p className="mt-1 text-[10px] text-gray-700">Why risky: {item.riskReason || 'Review this queue item for operational risk.'}</p>
                  <p className="mt-1 text-[10px] text-gray-600">
                    Updated: {formatRelativeTimestamp(item.updatedAt)}
                    {item.snoozeUntil ? ` | Snoozed until ${formatDateTime(item.snoozeUntil)}` : ''}
                  </p>

                  <div className="mt-2 grid gap-1">
                    <input
                      value={draft.owner}
                      onChange={(event) =>
                        setInterventionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, owner: event.target.value } }))
                      }
                      className="w-full rounded-lg border border-[#E8E4DC] bg-white px-2 py-1 text-xs text-gray-800"
                      placeholder="Assign owner (name or role)"
                    />
                    <textarea
                      value={draft.note}
                      onChange={(event) =>
                        setInterventionDrafts((prev) => ({ ...prev, [item.id]: { ...draft, note: event.target.value } }))
                      }
                      className="w-full rounded-lg border border-[#E8E4DC] bg-white px-2 py-1 text-xs text-gray-800"
                      placeholder="Intervention note"
                      rows={2}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void patchIntervention(item.id, { owner: draft.owner, note: draft.note, status: 'open' })}
                      className="rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void patchIntervention(item.id, { status: item.status === 'resolved' ? 'open' : 'resolved' })}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
                    >
                      {item.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void snoozeFor24h()}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 disabled:opacity-60"
                    >
                      Snooze 24h
                    </button>
                    <Link href={item.href} className="rounded-lg border border-[#E8E4DC] bg-white px-2 py-1 text-[11px] font-semibold text-gray-700">
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">Parent Engagement</p>
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            <p>Linked parents: <span className="font-semibold">{overview?.parentEngagement?.linkedParents ?? 0}</span></p>
            <p>Parent logins (24h): <span className="font-semibold">{overview?.parentEngagement?.parentLogins24h ?? 0}</span></p>
            <p>Unread announcements (est.): <span className="font-semibold">{overview?.parentEngagement?.unreadAnnouncementsEstimate ?? 0}</span></p>
            <p>Low-contact students: <span className="font-semibold">{overview?.parentEngagement?.lowContactStudents ?? 0}</span></p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">SLA Metrics</p>
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            <p>Grading turnaround: <span className="font-semibold">{overview?.slaMetrics?.gradingTurnaroundHours ?? 0}h</span></p>
            <p>Publish-to-submit conversion: <span className="font-semibold">{overview?.slaMetrics?.publishToSubmitConversionPercent ?? 0}%</span></p>
            <p>Teacher response time: <span className="font-semibold">{overview?.slaMetrics?.teacherResponseTimeHours ?? 0}h</span></p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">Data Freshness</p>
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            <p>Overview generated: <span className="font-semibold">{formatDateTime(overview?.generatedAt)}</span></p>
            <p>Attendance: <span className="font-semibold">{formatRelativeTimestamp(overview?.dataFreshness?.latestAttendanceAt)}</span></p>
            <p>Teacher activity: <span className="font-semibold">{formatRelativeTimestamp(overview?.dataFreshness?.latestTeacherActivityAt)}</span></p>
            <p>Submissions: <span className="font-semibold">{formatRelativeTimestamp(overview?.dataFreshness?.latestSubmissionAt)}</span></p>
            <p>Parent login: <span className="font-semibold">{formatRelativeTimestamp(overview?.dataFreshness?.latestParentLoginAt)}</span></p>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">AI Classroom Health</p>
        <p className="mt-1 text-xs text-gray-500">School-scoped grounded-answer quality, token usage, and chapter coverage signals.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs">
            <p className="text-gray-500">Groundedness</p>
            <p className="font-semibold text-gray-900">{aiInsights?.quality.avgGroundednessScore ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs">
            <p className="text-gray-500">Citation Coverage</p>
            <p className="font-semibold text-gray-900">{aiInsights?.quality.avgCitationCoverageScore ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs">
            <p className="text-gray-500">Retrieval Confidence</p>
            <p className="font-semibold text-gray-900">{aiInsights?.quality.avgRetrievalConfidence ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs">
            <p className="text-gray-500">Low-quality Rate</p>
            <p className="font-semibold text-gray-900">{aiInsights?.quality.lowQualityGenerationRatePercent ?? 0}%</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs">
            <p className="text-gray-500">AI Token Events</p>
            <p className="font-semibold text-gray-900">{aiInsights?.usage.events ?? 0}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700">Top AI endpoints</p>
            {(aiInsights?.usage.topEndpoints ?? []).slice(0, 5).map((item) => (
              <p key={item.endpoint} className="text-xs text-gray-600">
                {item.endpoint}: {item.events} events, {item.totalTokens.toLocaleString()} tokens
              </p>
            ))}
            {(aiInsights?.usage.topEndpoints ?? []).length === 0 ? (
              <p className="text-xs text-gray-400">No school-scoped AI usage yet.</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700">Coverage gaps and routing picks</p>
            {(aiInsights?.quality.chapterCoverageGaps ?? []).slice(0, 3).map((item) => (
              <p key={`${item.chapterId}-${item.subject}`} className="text-xs text-gray-600">
                {item.subject} / {item.chapterId}: {item.reason}
              </p>
            ))}
            {(aiInsights?.quality.routingRecommendations ?? []).slice(0, 3).map((item) => (
              <p key={`${item.task}-${item.recommendedProvider}`} className="text-xs text-gray-600">
                {item.task}: {item.recommendedProvider}/{item.recommendedModel}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Quick Navigation</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {QUICK_LINKS.map(({ href, label, icon: Icon, desc, color }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-[#E8E4DC] bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-md"
              >
                <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm', color)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-indigo-700">{label}</p>
                  <p className="truncate text-xs text-gray-400">{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-indigo-400" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Top Weak Topics</h2>
          {loading ? (
            <div className="flex h-32 items-center justify-center text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (overview?.topWeakTopics ?? []).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
              <BarChart2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No analytics yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {overview!.topWeakTopics.slice(0, 6).map(({ topic, count }) => (
                <div key={topic} className="flex items-center gap-3 rounded-xl border border-[#E8E4DC] bg-white px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize text-gray-800">{topic}</p>
                  </div>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600">{count}</span>
                </div>
              ))}
              <Link href="/admin/analytics" className="block py-1 text-center text-xs font-medium text-indigo-600 hover:text-indigo-700">
                View full analytics
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">Micro Access</p>
        <p className="mt-1 text-xs text-gray-500">High-signal shortcuts for daily operations and risk control.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/analytics" className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 hover:bg-indigo-100">
            <p className="text-[11px] font-semibold text-indigo-800">Weekly Completions</p>
            <p className="text-sm font-bold text-indigo-900">{overview?.assignmentCompletionsThisWeek ?? 0}</p>
          </Link>
          <Link href="/admin/analytics" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 hover:bg-rose-100">
            <p className="text-[11px] font-semibold text-rose-800">High Risk Sessions</p>
            <p className="text-sm font-bold text-rose-900">{overview?.highRiskExamSessions ?? 0}</p>
          </Link>
          <Link href="/admin/teachers" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 hover:bg-emerald-100">
            <p className="text-[11px] font-semibold text-emerald-800">Active Teachers</p>
            <p className="text-sm font-bold text-emerald-900">{overview?.activeTeachers ?? 0}</p>
          </Link>
          <Link href="/admin/students" className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 hover:bg-amber-100">
            <p className="text-[11px] font-semibold text-amber-800">Active Students</p>
            <p className="text-sm font-bold text-amber-900">{overview?.activeStudents ?? 0}</p>
          </Link>
        </div>
      </div>

      <div className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[#E8E4DC] bg-white/95 p-2 shadow-lg backdrop-blur sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-2 py-2 text-[11px] font-semibold text-gray-700"
          >
            <Clock3 className="h-3.5 w-3.5" /> Top
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2 text-[11px] font-semibold text-indigo-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <Link
            href="/admin/analytics"
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] font-semibold text-amber-700"
          >
            <BarChart2 className="h-3.5 w-3.5" /> Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
