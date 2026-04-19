'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, BarChart2, ClipboardList, RefreshCw, School, ScrollText } from 'lucide-react';
import clsx from 'clsx';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

interface SchoolsPayload {
  schools: Array<{ id: string; status: string }>;
  schoolDirectory: Array<{ students: number; teachers: number; admins: number; totalTokens: number }>;
}

interface UsagePayload {
  events: number;
  totalTokens: number;
}

interface AuditPayload {
  events: Array<{ id: string }>;
}

interface CareerIssuesPayload {
  issues: Array<{ id: string; severity: string; status: string }>;
}

interface ObservabilityPayload {
  counters: {
    authFailures: number;
    fiveXxEvents: number;
    blockedThrottleBuckets: number;
  };
  alerts: Array<{ code: string; status: string }>;
}

export default function DeveloperOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState({
    schools: 0,
    activeSchools: 0,
    students: 0,
    teachers: 0,
    admins: 0,
    tokenEvents: 0,
    totalTokens: 0,
    auditEvents: 0,
    careerIssues: 0,
    authFailures: 0,
    fiveXxEvents: 0,
    throttleBlocks: 0,
    criticalAlerts: 0,
    pendingAffiliateRequests: 0,
  });

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      const sessionRes = await fetch('/api/developer/session/me', { cache: 'no-store' });
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }

      const [schoolsRes, usageRes, auditRes, careerRes, observabilityRes, affiliateRes] = await Promise.all([
        fetch('/api/developer/schools', { cache: 'no-store' }),
        fetch('/api/developer/usage/tokens?limit=120', { cache: 'no-store' }),
        fetch('/api/developer/audit?limit=120', { cache: 'no-store' }),
        fetch('/api/developer/data-quality/verify-career-sources', { cache: 'no-store' }),
        fetch('/api/developer/observability/summary?hours=24', { cache: 'no-store' }),
        fetch('/api/developer/affiliate-requests?status=pending&limit=200', { cache: 'no-store' }),
      ]);

      const schoolsBody = await schoolsRes.json().catch(() => null);
      const usageBody = await usageRes.json().catch(() => null);
      const auditBody = await auditRes.json().catch(() => null);
      const careerBody = await careerRes.json().catch(() => null);
      const observabilityBody = await observabilityRes.json().catch(() => null);
      const affiliateBody = await affiliateRes.json().catch(() => null);

      if (!schoolsRes.ok) {
        setError(schoolsBody?.message || 'Failed to load developer overview.');
        return;
      }

      const schoolsData = unwrap<SchoolsPayload>(schoolsBody);
      const usageData = usageRes.ok ? unwrap<UsagePayload>(usageBody) : { events: 0, totalTokens: 0 };
      const auditData = auditRes.ok ? unwrap<AuditPayload>(auditBody) : { events: [] };
      const careerData = careerRes.ok ? unwrap<CareerIssuesPayload>(careerBody) : { issues: [] };
      const observabilityData = observabilityRes.ok
        ? unwrap<ObservabilityPayload>(observabilityBody)
        : { counters: { authFailures: 0, fiveXxEvents: 0, blockedThrottleBuckets: 0 }, alerts: [] };
      const affiliateData = affiliateRes.ok
        ? unwrap<{ requests?: Array<{ id: string }> }>(affiliateBody)
        : { requests: [] };

      const activeSchools = schoolsData.schools.filter((school) => school.status === 'active').length;
      const students = schoolsData.schoolDirectory.reduce((sum, row) => sum + row.students, 0);
      const teachers = schoolsData.schoolDirectory.reduce((sum, row) => sum + row.teachers, 0);
      const admins = schoolsData.schoolDirectory.reduce((sum, row) => sum + row.admins, 0);
      const criticalAlerts = (observabilityData.alerts || []).filter((alert) => alert.status === 'critical').length;

      setMetrics({
        schools: schoolsData.schools.length,
        activeSchools,
        students,
        teachers,
        admins,
        tokenEvents: usageData.events,
        totalTokens: usageData.totalTokens,
        auditEvents: auditData.events.length,
        careerIssues: careerData.issues.length,
        authFailures: observabilityData.counters.authFailures,
        fiveXxEvents: observabilityData.counters.fiveXxEvents,
        throttleBlocks: observabilityData.counters.blockedThrottleBuckets,
        criticalAlerts,
        pendingAffiliateRequests: Array.isArray(affiliateData.requests) ? affiliateData.requests.length : 0,
      });
    } catch {
      setError('Failed to load developer overview.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-fraunces text-2xl font-bold text-navy-700">Developer Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">Top-line operations health across schools, auth, and AI usage.</p>
        </div>
        <button
          onClick={() => void loadOverview()}
          disabled={loading}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </span>
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4"><p className="text-xs text-gray-500">Schools</p><p className="text-2xl font-semibold">{metrics.schools}</p><p className="text-xs text-gray-400">{metrics.activeSchools} active</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4"><p className="text-xs text-gray-500">Users</p><p className="text-2xl font-semibold">{metrics.students + metrics.teachers + metrics.admins}</p><p className="text-xs text-gray-400">{metrics.students} students</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4"><p className="text-xs text-gray-500">Token Events</p><p className="text-2xl font-semibold">{metrics.tokenEvents}</p><p className="text-xs text-gray-400">{metrics.totalTokens.toLocaleString()} tokens</p></div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4"><p className="text-xs text-gray-500">Audit Events</p><p className="text-2xl font-semibold">{metrics.auditEvents}</p><p className="text-xs text-gray-400">Recent window</p></div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-700">Auth Failures</p><p className="text-xl font-semibold text-amber-800">{metrics.authFailures}</p></div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs text-rose-700">5xx Events</p><p className="text-xl font-semibold text-rose-800">{metrics.fiveXxEvents}</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs text-indigo-700">Throttle Blocks</p><p className="text-xl font-semibold text-indigo-800">{metrics.throttleBlocks}</p></div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs text-violet-700">Career Issues</p><p className="text-xl font-semibold text-violet-800">{metrics.careerIssues}</p></div>
      </div>

      <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-sm font-semibold text-indigo-900">Affiliate Queue</p>
        <p className="mt-1 text-xs text-indigo-700">
          Pending school requests: <span className="font-bold">{metrics.pendingAffiliateRequests}</span>
        </p>
        <Link href="/developer/onboarding" className="mt-2 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800">
          Open affiliate onboarding queue
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/developer/schools" className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm hover:border-violet-300">
          <School className="h-5 w-5 text-violet-600" />
          <p className="mt-2 text-sm font-semibold text-[#1C1C2E]">Schools</p>
          <p className="text-xs text-gray-500">Directory, counts, admins</p>
        </Link>
        <Link href="/developer/usage" className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm hover:border-violet-300">
          <BarChart2 className="h-5 w-5 text-violet-600" />
          <p className="mt-2 text-sm font-semibold text-[#1C1C2E]">Usage</p>
          <p className="text-xs text-gray-500">Token and endpoint load</p>
        </Link>
        <Link href="/developer/audit" className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm hover:border-violet-300">
          <ScrollText className="h-5 w-5 text-violet-600" />
          <p className="mt-2 text-sm font-semibold text-[#1C1C2E]">Audit Log</p>
          <p className="text-xs text-gray-500">Actor, action, metadata</p>
        </Link>
        <Link href="/developer/observability" className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm hover:border-violet-300">
          <Activity className="h-5 w-5 text-violet-600" />
          <p className="mt-2 text-sm font-semibold text-[#1C1C2E]">Observability</p>
          <p className="text-xs text-gray-500">{metrics.criticalAlerts} critical alert(s)</p>
        </Link>
        <Link href="/developer/career-health" className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm hover:border-violet-300">
          <ClipboardList className="h-5 w-5 text-violet-600" />
          <p className="mt-2 text-sm font-semibold text-[#1C1C2E]">Career Health</p>
          <p className="text-xs text-gray-500">Official source verification</p>
        </Link>
      </div>
    </div>
  );
}
