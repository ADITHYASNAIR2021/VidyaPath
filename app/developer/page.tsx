'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SchoolItem {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  status: 'active' | 'inactive' | 'archived';
}

interface SchoolDirectoryItem {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  status: 'active' | 'inactive' | 'archived';
  teachers: number;
  students: number;
  studentsClass10: number;
  studentsClass12: number;
  admins: number;
  totalTokens: number;
  adminContacts: Array<{ id: string; name: string; phone?: string; email?: string; adminIdentifier: string }>;
}

interface TokenUsagePayload {
  events: number;
  totalTokens: number;
  records: Array<{
    id: string;
    createdAt: string;
    schoolId?: string;
    role?: string;
    endpoint: string;
    provider?: string;
    model?: string;
    totalTokens: number;
    estimated: boolean;
  }>;
}

interface AuditPayload {
  events: Array<{
    id: string;
    type: string;
    createdAt: string;
    actor: string;
    action: string;
    metadata: Record<string, unknown>;
  }>;
}

interface CareerSourceIssue {
  id: string;
  status: 'open' | 'acknowledged' | 'resolved';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_path?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

interface CareerCheckPayload {
  checkedAt: string;
  total: number;
  passed: number;
  failed: number;
  checks: Array<{
    id: string;
    title: string;
    url: string;
    ok: boolean;
    statusCode: number;
    checkedAt: string;
    error?: string;
  }>;
}

interface ObservabilitySummaryPayload {
  generatedAt: string;
  windowHours: number;
  counters: {
    auditEvents: number;
    authFailures: number;
    authEvents: number;
    fiveXxEvents: number;
    activeThrottleBuckets: number;
    blockedThrottleBuckets: number;
    tokenEvents: number;
    totalTokens: number;
  };
  alerts: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'ok' | 'warn' | 'critical';
    message: string;
    metric: number;
    threshold: number;
  }>;
}

interface ObservabilityDispatchPayload {
  delivered: boolean;
  skippedReason?: 'no-alerts' | 'webhook-not-configured';
  destination?: string;
  responseStatus?: number;
  triggeredAlerts: Array<{
    code: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'ok' | 'warn' | 'critical';
    message: string;
    metric: number;
    threshold: number;
  }>;
}

export default function DeveloperPage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [schoolDirectory, setSchoolDirectory] = useState<SchoolDirectoryItem[]>([]);
  const [usage, setUsage] = useState<TokenUsagePayload | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [careerIssues, setCareerIssues] = useState<CareerSourceIssue[]>([]);
  const [careerCheck, setCareerCheck] = useState<CareerCheckPayload | null>(null);
  const [observability, setObservability] = useState<ObservabilitySummaryPayload | null>(null);
  const [observabilityDispatch, setObservabilityDispatch] = useState<ObservabilityDispatchPayload | null>(null);
  const [dispatchingObservability, setDispatchingObservability] = useState(false);
  const [checkingCareer, setCheckingCareer] = useState(false);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function load() {
      try {
        const [schoolRes, usageRes, auditRes, careerRes, observabilityRes] = await Promise.all([
          fetch('/api/developer/schools', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/usage/tokens?limit=120', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/audit?limit=120', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/data-quality/verify-career-sources', { cache: 'no-store', signal: controller.signal }),
          fetch('/api/developer/observability/summary?hours=24', { cache: 'no-store', signal: controller.signal }),
        ]);
        if (!alive) return;
        const schoolBody = await schoolRes.json().catch(() => null);
        const usageBody = await usageRes.json().catch(() => null);
        const auditBody = await auditRes.json().catch(() => null);
        const careerBody = await careerRes.json().catch(() => null);
        const schoolPayload = schoolBody?.data ?? schoolBody;
        const usagePayload = usageBody?.data ?? usageBody;
        const auditPayload = auditBody?.data ?? auditBody;
        const careerPayload = careerBody?.data ?? careerBody;
        const observabilityBody = await observabilityRes.json().catch(() => null);
        const observabilityPayload = observabilityBody?.data ?? observabilityBody;
        if (!schoolRes.ok) {
          setError(schoolBody?.message || schoolBody?.error || 'Failed to load developer console.');
          return;
        }
        setSchools(Array.isArray(schoolPayload.schools) ? schoolPayload.schools : []);
        setSchoolDirectory(Array.isArray(schoolPayload.schoolDirectory) ? schoolPayload.schoolDirectory : []);
        setUsage(usagePayload);
        setAudit(auditPayload);
        setCareerIssues(Array.isArray(careerPayload?.issues) ? careerPayload.issues : []);
        setObservability(observabilityRes.ok ? (observabilityPayload as ObservabilitySummaryPayload) : null);
      } catch {
        if (alive) setError('Failed to load developer console.');
      }
    }

    void load();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const activeSchools = useMemo(() => schools.filter((school) => school.status === 'active').length, [schools]);
  const totalTokens = usage?.totalTokens ?? 0;

  async function runCareerVerification() {
    setCheckingCareer(true);
    try {
      const response = await fetch('/api/developer/data-quality/verify-career-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistIssues: true }),
      });
      const payload = await response.json().catch(() => null);
      const dataPayload = payload?.data ?? payload;
      if (!response.ok || !dataPayload) {
        setError(payload?.message || payload?.error || 'Failed to run career source verification.');
        return;
      }
      setCareerCheck(dataPayload);
      const issuesRes = await fetch('/api/developer/data-quality/verify-career-sources', { cache: 'no-store' });
      const issuesPayload = await issuesRes.json().catch(() => null);
      const issuesData = issuesPayload?.data ?? issuesPayload;
      setCareerIssues(Array.isArray(issuesData?.issues) ? issuesData.issues : []);
    } catch {
      setError('Failed to run career source verification.');
    } finally {
      setCheckingCareer(false);
    }
  }

  async function dispatchObservabilityAlertsNow() {
    setDispatchingObservability(true);
    try {
      const response = await fetch('/api/developer/observability/dispatch?hours=24', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => null);
      const dataPayload = payload?.data ?? payload;
      if (!response.ok || !dataPayload?.dispatch) {
        setError(payload?.message || payload?.error || 'Failed to dispatch observability alerts.');
        return;
      }
      if (dataPayload.summary) {
        setObservability(dataPayload.summary as ObservabilitySummaryPayload);
      }
      setObservabilityDispatch(dataPayload.dispatch as ObservabilityDispatchPayload);
    } catch {
      setError('Failed to dispatch observability alerts.');
    } finally {
      setDispatchingObservability(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6] px-4 py-8 md:px-8 lg:px-12">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
          <h1 className="font-fraunces text-3xl font-bold text-navy-700">Developer Console</h1>
          <p className="mt-2 text-sm text-[#5F5A73]">
            Platform-wide oversight for schools, auth roles, audits, and token usage.
          </p>
          <div className="mt-3">
            <Link
              href="/developer/onboarding"
              className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Open onboarding queue
            </Link>
          </div>
          {error && (
            <p
              className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Schools</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{schools.length}</p>
              <p className="text-xs text-[#7A7490]">{activeSchools} active</p>
            </div>
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Token Events</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{usage?.events ?? 0}</p>
              <p className="text-xs text-[#7A7490]">AI endpoint usage logs</p>
            </div>
            <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
              <p className="text-xs uppercase tracking-wide text-[#7A7490]">Total Tokens</p>
              <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{totalTokens.toLocaleString()}</p>
              <p className="text-xs text-[#7A7490]">Across tracked requests</p>
            </div>
          </div>
        </div>

        {(tab === 'overview' || tab === 'schools') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Registered Schools</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#7A7490]">
                    <th className="py-2 pr-4">School</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Teachers</th>
                    <th className="py-2 pr-4">Students (10/12)</th>
                    <th className="py-2 pr-4">Admins</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pr-4">Admin Contacts</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolDirectory.map((school) => (
                    <tr key={school.schoolId} className="border-t border-[#F0ECE3] align-top">
                      <td className="py-2 pr-4 font-medium text-[#1C1C2E]">{school.schoolName}</td>
                      <td className="py-2 pr-4">{school.schoolCode}</td>
                      <td className="py-2 pr-4">{school.teachers}</td>
                      <td className="py-2 pr-4">{school.students} ({school.studentsClass10}/{school.studentsClass12})</td>
                      <td className="py-2 pr-4">{school.admins}</td>
                      <td className="py-2 pr-4">{school.totalTokens.toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        {school.adminContacts.length === 0 ? (
                          <span className="text-[#7A7490]">-</span>
                        ) : (
                          <div className="space-y-1">
                            {school.adminContacts.slice(0, 2).map((contact) => (
                              <p key={contact.id} className="text-xs text-[#4A4560]">
                                {contact.name}
                                {contact.phone ? ` | ${contact.phone}` : ''}
                                {contact.email ? ` | ${contact.email}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 capitalize">{school.status}</td>
                    </tr>
                  ))}
                  {schoolDirectory.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-4 text-[#7A7490]">No schools configured yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(tab === 'overview' || tab === 'usage') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Token Usage (Recent)</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#7A7490]">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Endpoint</th>
                    <th className="py-2 pr-4">Provider</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.records ?? []).slice(0, 30).map((row) => (
                    <tr key={row.id} className="border-t border-[#F0ECE3]">
                      <td className="py-2 pr-4">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{row.role || '-'}</td>
                      <td className="py-2 pr-4">{row.endpoint}</td>
                      <td className="py-2 pr-4">{row.provider || '-'}</td>
                      <td className="py-2 pr-4">{row.model || '-'}</td>
                      <td className="py-2 pr-4">{row.totalTokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(tab === 'overview' || tab === 'audit') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-fraunces text-2xl font-bold text-navy-700">Observability Alerts (24h)</h2>
              <button
                onClick={dispatchObservabilityAlertsNow}
                type="button"
                disabled={dispatchingObservability}
                className="rounded-xl bg-navy-700 hover:bg-navy-800 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white"
              >
                {dispatchingObservability ? 'Dispatching...' : 'Dispatch External Alerts'}
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                <p className="text-xs uppercase tracking-wide text-[#7A7490]">Auth Failures</p>
                <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{observability?.counters.authFailures ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                <p className="text-xs uppercase tracking-wide text-[#7A7490]">5xx Events</p>
                <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{observability?.counters.fiveXxEvents ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                <p className="text-xs uppercase tracking-wide text-[#7A7490]">Throttle Blocks</p>
                <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{observability?.counters.blockedThrottleBuckets ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                <p className="text-xs uppercase tracking-wide text-[#7A7490]">Tokens (24h)</p>
                <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{(observability?.counters.totalTokens ?? 0).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(observability?.alerts ?? []).map((alert) => {
                const tone = alert.status === 'critical'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : alert.status === 'warn'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                return (
                  <div key={alert.code} className={`rounded-xl border px-3 py-2 ${tone}`}>
                    <p className="text-sm font-semibold">{alert.code}</p>
                    <p className="text-xs mt-0.5">
                      {alert.message} Metric: {alert.metric} | Threshold: {alert.threshold}
                    </p>
                  </div>
                );
              })}
            </div>
            {observabilityDispatch && (
              <div className="mt-4 rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-3 text-sm text-[#4A4560]">
                <p className="font-semibold text-[#1C1C2E]">
                  {observabilityDispatch.delivered
                    ? `External dispatch sent (${observabilityDispatch.triggeredAlerts.length} alerts)`
                    : `External dispatch skipped (${observabilityDispatch.skippedReason || 'unknown'})`}
                </p>
                {observabilityDispatch.destination && (
                  <p className="text-xs mt-1">Destination: {observabilityDispatch.destination}</p>
                )}
              </div>
            )}
          </section>
        )}

        {(tab === 'overview' || tab === 'audit') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <h2 className="font-fraunces text-2xl font-bold text-navy-700">Audit Feed</h2>
            <div className="mt-4 space-y-2">
              {(audit?.events ?? []).slice(0, 30).map((event) => (
                <div key={event.id} className="rounded-xl border border-[#EFE9DD] bg-[#FCFAF4] p-3">
                  <p className="text-xs text-[#7A7490]">{new Date(event.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-sm font-semibold text-[#1C1C2E]">{event.actor} - {event.action}</p>
                  <p className="mt-1 text-xs text-[#6B6580]">{event.type}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {(tab === 'overview' || tab === 'audit') && (
          <section className="rounded-2xl border border-[#E8E4DC] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-fraunces text-2xl font-bold text-navy-700">Career Source Health</h2>
              <button
                onClick={runCareerVerification}
                type="button"
                disabled={checkingCareer}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white"
              >
                {checkingCareer ? 'Running...' : 'Run Verification'}
              </button>
            </div>
            {careerCheck && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#7A7490]">Sources Checked</p>
                  <p className="mt-1 text-2xl font-semibold text-[#1C1C2E]">{careerCheck.total}</p>
                </div>
                <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#7A7490]">Passed</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">{careerCheck.passed}</p>
                </div>
                <div className="rounded-xl border border-[#E8E4DC] bg-[#F9F7F1] p-4">
                  <p className="text-xs uppercase tracking-wide text-[#7A7490]">Failed</p>
                  <p className="mt-1 text-2xl font-semibold text-rose-700">{careerCheck.failed}</p>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {careerIssues.length === 0 && (
                <p className="text-sm text-[#7A7490]">No open/recorded career source issues yet.</p>
              )}
              {careerIssues.slice(0, 12).map((issue) => {
                const details = issue.details || {};
                return (
                  <div key={issue.id} className="rounded-xl border border-[#EFE9DD] bg-[#FCFAF4] p-3">
                    <p className="text-xs text-[#7A7490]">{new Date(issue.created_at).toLocaleString()}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1C1C2E]">
                      {String(details.title || issue.source_path || 'Career source issue')}
                    </p>
                    <p className="mt-1 text-xs text-[#6B6580]">
                      Status: {issue.status} | Severity: {issue.severity} | HTTP: {String(details.statusCode || 'n/a')}
                    </p>
                    {issue.source_path && (
                      <a
                        href={issue.source_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                      >
                        {issue.source_path}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
