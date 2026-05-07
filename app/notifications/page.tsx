'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Mail, MessageCircleWarning, RefreshCw, Smartphone } from 'lucide-react';

type Role = 'student' | 'teacher' | 'admin' | 'developer' | 'parent' | 'anonymous';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  href: string;
  severity: 'info' | 'warning' | 'critical';
};

type ChannelPreferences = {
  dashboard: boolean;
  webPush: boolean;
  email: boolean;
};

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function formatRelative(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'recently';
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function severityTone(severity: NotificationItem['severity']): string {
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-900';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-[#E8E4DC] bg-white text-[#1C1C2E]';
}

export default function NotificationCenterPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<Role>('anonymous');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [channelPrefs, setChannelPrefs] = useState<ChannelPreferences>({ dashboard: true, webPush: true, email: true });

  async function loadState() {
    const res = await fetch('/api/notifications/state', { cache: 'no-store' });
    const body = unwrap<{ state?: { readIds?: string[]; channelPreferences?: ChannelPreferences } } | null>(await res.json().catch(() => null));
    if (!res.ok || !body?.state) return;
    setReadIds(Array.isArray(body.state.readIds) ? body.state.readIds : []);
    setChannelPrefs(body.state.channelPreferences ?? { dashboard: true, webPush: true, email: true });
  }

  async function loadRole(): Promise<Role> {
    const sessionRes = await fetch('/api/auth/session', { cache: 'no-store' });
    const session = unwrap<{ role?: Role; authenticated?: boolean } | null>(await sessionRes.json().catch(() => null));
    if (session?.authenticated && session.role && session.role !== 'anonymous') return session.role;

    const parentRes = await fetch('/api/parent/dashboard', { cache: 'no-store' });
    if (parentRes.ok) return 'parent';
    return 'anonymous';
  }

  async function loadNotifications() {
    setLoading(true);
    setError('');
    try {
      const resolvedRole = await loadRole();
      setRole(resolvedRole);
      const now = new Date().toISOString();
      const nextItems: NotificationItem[] = [];

      if (resolvedRole === 'student') {
        const [summaryRes, announcementRes, assignmentRes] = await Promise.all([
          fetch('/api/student/notifications/summary', { cache: 'no-store' }),
          fetch('/api/student/announcements?limit=8', { cache: 'no-store' }),
          fetch('/api/student/assignments', { cache: 'no-store' }),
        ]);
        const summary = unwrap<{ newGradesCount?: number } | null>(await summaryRes.json().catch(() => null));
        const announcements = unwrap<{ announcements?: Array<{ id: string; title: string; createdAt: string }> } | null>(await announcementRes.json().catch(() => null));
        const assignments = unwrap<{ assignments?: Array<{ packId: string; title: string; subject: string; dueDate?: string }> } | null>(await assignmentRes.json().catch(() => null));

        const newGrades = Number(summary?.newGradesCount || 0);
        if (newGrades > 0) {
          nextItems.push({
            id: `student:grades:${newGrades}`,
            title: 'New grade updates',
            message: `${newGrades} new grade update(s) were published this week.`,
            createdAt: now,
            href: '/student/grades',
            severity: 'info',
          });
        }

        for (const announcement of announcements?.announcements?.slice(0, 5) || []) {
          nextItems.push({
            id: `student:announcement:${announcement.id}`,
            title: announcement.title,
            message: 'School or teacher announcement posted.',
            createdAt: announcement.createdAt,
            href: '/student/announcements',
            severity: 'info',
          });
        }

        for (const assignment of assignments?.assignments?.slice(0, 5) || []) {
          if (!assignment.dueDate) continue;
          const dueAt = Date.parse(assignment.dueDate);
          if (!Number.isFinite(dueAt)) continue;
          const hoursRemaining = Math.round((dueAt - Date.now()) / 3600000);
          nextItems.push({
            id: `student:assignment:${assignment.packId}`,
            title: assignment.title,
            message: hoursRemaining <= 24
              ? `Due soon in ${Math.max(0, hoursRemaining)}h.`
              : `Upcoming due date on ${new Date(assignment.dueDate).toLocaleDateString()}.`,
            createdAt: assignment.dueDate,
            href: '/student/assignments',
            severity: hoursRemaining <= 24 ? 'warning' : 'info',
          });
        }
      }

      if (resolvedRole === 'teacher') {
        const [summaryRes, questionRes] = await Promise.all([
          fetch('/api/teacher/notifications/summary', { cache: 'no-store' }),
          fetch('/api/teacher/questions?status=pending', { cache: 'no-store' }),
        ]);
        const summary = unwrap<{ pendingQuestions?: number; ungradedSubmissions?: number } | null>(await summaryRes.json().catch(() => null));
        const questions = unwrap<Array<{ id: string; chapterId: string; question: string; createdAt: string }> | null>(await questionRes.json().catch(() => null));

        const pendingQuestions = Number(summary?.pendingQuestions || 0);
        const ungradedSubmissions = Number(summary?.ungradedSubmissions || 0);
        if (ungradedSubmissions > 0) {
          nextItems.push({
            id: `teacher:ungraded:${ungradedSubmissions}`,
            title: 'Ungraded submissions pending',
            message: `${ungradedSubmissions} submission(s) need grading review.`,
            createdAt: now,
            href: '/teacher/grading',
            severity: ungradedSubmissions > 10 ? 'critical' : 'warning',
          });
        }
        if (pendingQuestions > 0) {
          nextItems.push({
            id: `teacher:questions:${pendingQuestions}`,
            title: 'Pending student questions',
            message: `${pendingQuestions} question(s) are waiting for responses.`,
            createdAt: now,
            href: '/teacher/questions',
            severity: pendingQuestions > 8 ? 'critical' : 'warning',
          });
        }
        for (const question of questions?.slice(0, 5) || []) {
          nextItems.push({
            id: `teacher:question:${question.id}`,
            title: `Question from ${question.chapterId}`,
            message: question.question.slice(0, 120),
            createdAt: question.createdAt,
            href: '/teacher/questions',
            severity: 'info',
          });
        }
      }

      if (resolvedRole === 'admin') {
        const [summaryRes, overviewRes] = await Promise.all([
          fetch('/api/admin/notifications/summary', { cache: 'no-store' }),
          fetch('/api/admin/overview', { cache: 'no-store' }),
        ]);
        const summary = unwrap<{ pendingQuestions?: number; ungradedSubmissions?: number } | null>(await summaryRes.json().catch(() => null));
        const overview = unwrap<{ needActionQueue?: Array<{ id: string; title: string; description: string; href: string; priority: 'high' | 'medium' }>; generatedAt?: string } | null>(await overviewRes.json().catch(() => null));

        const pendingQuestions = Number(summary?.pendingQuestions || 0);
        const ungradedSubmissions = Number(summary?.ungradedSubmissions || 0);
        if (pendingQuestions > 0) {
          nextItems.push({
            id: `admin:pending-questions:${pendingQuestions}`,
            title: 'Pending student support queue',
            message: `${pendingQuestions} pending student question(s) across school.`,
            createdAt: now,
            href: '/admin',
            severity: pendingQuestions > 20 ? 'critical' : 'warning',
          });
        }
        if (ungradedSubmissions > 0) {
          nextItems.push({
            id: `admin:ungraded:${ungradedSubmissions}`,
            title: 'Ungraded submissions open',
            message: `${ungradedSubmissions} submissions pending teacher review.`,
            createdAt: now,
            href: '/admin/analytics',
            severity: ungradedSubmissions > 25 ? 'critical' : 'warning',
          });
        }
        for (const queueItem of overview?.needActionQueue?.slice(0, 8) || []) {
          nextItems.push({
            id: `admin:action:${queueItem.id}`,
            title: queueItem.title,
            message: queueItem.description,
            createdAt: overview?.generatedAt || now,
            href: queueItem.href,
            severity: queueItem.priority === 'high' ? 'critical' : 'warning',
          });
        }
      }

      if (resolvedRole === 'developer') {
        const controlRes = await fetch('/api/developer/control-tower?hours=24', { cache: 'no-store' });
        const control = unwrap<{ observabilityCounters?: { authFailures?: number; fiveXxEvents?: number; blockedThrottleBuckets?: number }; aiQuality?: { hallucinationFlags?: number }; generatedAt?: string } | null>(await controlRes.json().catch(() => null));
        const counters = control?.observabilityCounters;
        const generatedAt = control?.generatedAt || now;
        if ((counters?.fiveXxEvents ?? 0) > 0) {
          nextItems.push({
            id: `developer:5xx:${counters?.fiveXxEvents ?? 0}`,
            title: '5xx incidents detected',
            message: `${counters?.fiveXxEvents ?? 0} server error event(s) in the last 24h.`,
            createdAt: generatedAt,
            href: '/developer/observability',
            severity: 'critical',
          });
        }
        if ((counters?.authFailures ?? 0) > 0) {
          nextItems.push({
            id: `developer:auth-fail:${counters?.authFailures ?? 0}`,
            title: 'Auth failures observed',
            message: `${counters?.authFailures ?? 0} authentication failure(s) in the last 24h.`,
            createdAt: generatedAt,
            href: '/developer/observability',
            severity: 'warning',
          });
        }
        if ((control?.aiQuality?.hallucinationFlags ?? 0) > 0) {
          nextItems.push({
            id: `developer:ai-flags:${control?.aiQuality?.hallucinationFlags ?? 0}`,
            title: 'AI hallucination flags',
            message: `${control?.aiQuality?.hallucinationFlags ?? 0} AI quality flag(s) need triage.`,
            createdAt: generatedAt,
            href: '/developer',
            severity: 'warning',
          });
        }
      }

      if (resolvedRole === 'parent') {
        const parentRes = await fetch('/api/parent/dashboard', { cache: 'no-store' });
        const dashboard = unwrap<{
          grades?: Array<{ subject: string; score: number; createdAt: string }>;
          announcements?: Array<{ id: string; title: string; createdAt: string }>;
          upcomingEvents?: Array<{ id: string; title: string; eventDate: string }>;
          attendance?: { percentage: number };
        } | null>(await parentRes.json().catch(() => null));

        if ((dashboard?.attendance?.percentage ?? 100) < 85) {
          nextItems.push({
            id: `parent:attendance-risk:${dashboard?.attendance?.percentage ?? 0}`,
            title: 'Attendance needs attention',
            message: `Current attendance is ${dashboard?.attendance?.percentage ?? 0}%.`,
            createdAt: now,
            href: '/parent',
            severity: 'warning',
          });
        }

        for (const item of dashboard?.upcomingEvents?.slice(0, 5) || []) {
          nextItems.push({
            id: `parent:event:${item.id}`,
            title: item.title,
            message: 'Upcoming school event.',
            createdAt: item.eventDate,
            href: '/parent',
            severity: 'info',
          });
        }

        for (const item of dashboard?.announcements?.slice(0, 5) || []) {
          nextItems.push({
            id: `parent:announcement:${item.id}`,
            title: item.title,
            message: 'School announcement for parents.',
            createdAt: item.createdAt,
            href: '/parent',
            severity: 'info',
          });
        }
      }

      nextItems.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      setItems(nextItems.slice(0, 40));

      await loadState();

      if (resolvedRole === 'anonymous') {
        setError('Sign in to access notification center.');
      }
    } catch {
      setError('Failed to load notification center.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !readIds.includes(item.id)).length, [items, readIds]);

  async function patchState(payload: Record<string, unknown>) {
    const res = await fetch('/api/notifications/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const body = unwrap<{ state?: { readIds?: string[]; channelPreferences?: ChannelPreferences } } | null>(await res.json().catch(() => null));
    if (!body?.state) return;
    setReadIds(Array.isArray(body.state.readIds) ? body.state.readIds : []);
    if (body.state.channelPreferences) setChannelPrefs(body.state.channelPreferences);
  }

  function isRead(id: string): boolean {
    return readIds.includes(id);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Notification Center</h1>
          <p className="mt-1 text-sm text-gray-500">Unified updates across dashboard, web push, and email channels.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadNotifications()}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50"
        >
          <span className="inline-flex items-center gap-1.5"><RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh</span>
        </button>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Role</p>
          <p className="mt-1 text-lg font-semibold text-[#1C1C2E] capitalize">{role}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Unread</p>
          <p className="mt-1 text-lg font-semibold text-[#1C1C2E]">{unreadCount}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Notifications</p>
          <p className="mt-1 text-lg font-semibold text-[#1C1C2E]">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => void patchState({ markReadIds: items.map((item) => item.id) })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">Channel Preferences</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void patchState({ channelPreferences: { dashboard: !channelPrefs.dashboard } })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${channelPrefs.dashboard ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
          >
            <Bell className="h-3.5 w-3.5" /> Dashboard {channelPrefs.dashboard ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={() => void patchState({ channelPreferences: { webPush: !channelPrefs.webPush } })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${channelPrefs.webPush ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Web Push {channelPrefs.webPush ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={() => void patchState({ channelPreferences: { email: !channelPrefs.email } })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${channelPrefs.email ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
          >
            <Mail className="h-3.5 w-3.5" /> Email {channelPrefs.email ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`rounded-xl border px-3 py-2 ${severityTone(item.severity)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs opacity-90">{item.message}</p>
                <p className="mt-1 text-[11px] opacity-70">{formatRelative(item.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {!isRead(item.id) ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Unread</span> : null}
                <button
                  type="button"
                  onClick={() => void patchState(isRead(item.id) ? { markUnreadIds: [item.id] } : { markReadIds: [item.id] })}
                  className="rounded-lg border border-white/40 bg-white/70 px-2 py-1 text-[11px] font-semibold text-gray-700"
                >
                  {isRead(item.id) ? 'Mark unread' : 'Mark read'}
                </button>
                <Link href={item.href} className="rounded-lg border border-white/40 bg-white/70 px-2 py-1 text-[11px] font-semibold text-gray-700">Open</Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && !loading ? (
        <div className="mt-6 rounded-xl border border-[#E8E4DC] bg-white px-4 py-6 text-center text-sm text-gray-500">
          <MessageCircleWarning className="mx-auto mb-2 h-5 w-5 text-gray-400" />
          No notifications yet.
        </div>
      ) : null}
    </div>
  );
}
