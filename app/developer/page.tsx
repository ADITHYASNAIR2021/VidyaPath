'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  BookOpen,
  Bot,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Filter,
  GraduationCap,
  LayoutGrid,
  List,
  RefreshCw,
  School,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import RoleStatusPanel from '@/components/RoleStatusPanel';

type SchoolStatus = 'active' | 'inactive' | 'archived';
type StatusFilter = 'all' | SchoolStatus;
type LayoutMode = 'cards' | 'table';
type SortMode = 'health-desc' | 'risk-desc' | 'students-desc' | 'tokens-desc' | 'name-asc';

interface SchoolProfile {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: SchoolStatus;
}

interface SchoolDirectoryItem {
  schoolId: string;
  schoolName: string;
  schoolCode: string;
  status: SchoolStatus;
  teachers: number;
  students: number;
  studentsClass10: number;
  studentsClass12: number;
  admins: number;
  totalTokens: number;
  adminContacts: Array<{ id: string; name: string; phone?: string; email?: string; adminIdentifier?: string }>;
}

interface SchoolsPayload {
  schools: SchoolProfile[];
  schoolDirectory: SchoolDirectoryItem[];
  counts?: {
    schools: number;
    teachers: number;
    students: number;
    admins: number;
  };
}

interface UsagePayload {
  events: number;
  totalTokens: number;
  records?: Array<{
    id: string;
    endpoint: string;
    totalTokens: number;
    schoolId?: string;
  }>;
}

interface AuditPayload {
  events: Array<{
    id: string;
    action?: string;
  }>;
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

interface DeveloperControlTowerPayload {
  generatedAt: string;
  windowHours: number;
  modelHealth: {
    providerConfigured: {
      nvidia: boolean;
      gemini: boolean;
      groq: boolean;
    };
    taskAssignments: Array<{
      task: string;
      aliases: string[];
    }>;
    models: Array<{
      alias: string;
      provider: string;
      mode: string;
      model: string;
      configured: boolean;
      assignedTasks: string[];
      events: number;
      totalTokens: number;
      failureRatePercent: number;
    }>;
  };
  validationBoard: Array<{
    endpoint: string;
    schema: string;
    failures: number;
    sampleErrorCode: string;
    lastSeenAt: string;
  }>;
  routeSignals: {
    slowestApiRoutes: Array<{
      endpoint: string;
      errors: number;
      requests: number;
      errorRatePercent: number;
    }>;
    routeDropoffs: Array<{ route: string; count: number }>;
    pageLoadBuckets: Array<{ bucket: string; count: number }>;
    avgPageLoadMs: number;
  };
  deploymentReadiness: {
    envOk: boolean;
    envMissing: string[];
    envWarnings: string[];
    supabaseServiceConfigured: boolean;
    supabaseStateEnabled: boolean;
    migrationSignals: {
      hasAppStateRows: boolean;
      latestStateUpdateAt: string | null;
    };
    rlsHealth: {
      status: string;
      note: string;
    };
    pgvectorCoverage: {
      percent: number;
      hasContextState: boolean;
      hasVectorState: boolean;
    };
    serviceWorker: {
      exists: boolean;
      updatedAt: string | null;
      ageMinutes: number;
    };
    legacySessionsEnabled: boolean;
    singleEnvModeEnabled: boolean;
  };
  aiQuality: {
    generatedAt: string;
    windowHours: number;
    records: number;
    successes: number;
    failures: number;
    repairRatePercent: number;
    rejectionRatePercent: number;
    retrievalMissRatePercent: number;
    avgGroundednessScore: number;
    avgCitationCoverageScore: number;
    hallucinationFlags: number;
    providerStats: Array<{
      task: string;
      provider: string;
      model: string;
      events: number;
      failures: number;
      avgLatencyMs: number;
      totalTokens: number;
    }>;
    taskStats: Array<{
      task: string;
      events: number;
      failureRatePercent: number;
      avgGroundednessScore: number;
    }>;
    recentFlags: Array<{
      id: string;
      createdAt: string;
      task: string;
      provider?: string;
      model?: string;
      issue: string;
    }>;
    feedback: {
      total: number;
      unsafeAnswer: number;
      weakGrounding: number;
      missingCitation: number;
      hallucinationFlag: number;
      other: number;
    };
  };
  observabilityCounters: {
    authFailures: number;
    fiveXxEvents: number;
    blockedThrottleBuckets: number;
  } | null;
}

interface EnrichedSchool extends SchoolDirectoryItem {
  board: string;
  city?: string;
  state?: string;
  healthScore: number;
  riskScore: number;
  riskFlags: string[];
  studentTeacherRatio: number;
  tokenPerStudent: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calcSchoolScores(row: SchoolDirectoryItem): {
  healthScore: number;
  riskScore: number;
  riskFlags: string[];
  studentTeacherRatio: number;
  tokenPerStudent: number;
} {
  const ratio = row.teachers > 0 ? row.students / row.teachers : row.students > 0 ? 999 : 0;
  const tokenPerStudent = row.students > 0 ? row.totalTokens / row.students : row.totalTokens;
  const flags: string[] = [];

  let health = 0;
  if (row.status === 'active') health += 30;
  else if (row.status === 'inactive') health += 15;

  if (row.admins > 0) health += 15;
  if (row.teachers > 0) health += 15;
  if (row.students > 0) health += 20;
  if (row.totalTokens > 0) health += 10;
  if (ratio >= 12 && ratio <= 60) health += 10;

  let risk = 0;
  if (row.status !== 'active') {
    risk += 15;
    flags.push('Non-active status');
  }
  if (row.admins === 0) {
    risk += 25;
    flags.push('No admin provisioned');
  }
  if (row.students > 0 && row.teachers === 0) {
    risk += 25;
    flags.push('Students but no teachers');
  }
  if (row.students === 0) {
    risk += 15;
    flags.push('No enrolled students');
  }
  if (row.students > 0 && row.totalTokens === 0) {
    risk += 15;
    flags.push('No AI usage yet');
  }
  if (ratio > 70 && row.teachers > 0) {
    risk += 15;
    flags.push('High student-teacher ratio');
  }

  return {
    healthScore: clamp(Math.round(health), 0, 100),
    riskScore: clamp(Math.round(risk), 0, 100),
    riskFlags: flags,
    studentTeacherRatio: Number.isFinite(ratio) ? ratio : 0,
    tokenPerStudent: Number.isFinite(tokenPerStudent) ? tokenPerStudent : 0,
  };
}

function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return clamp((part / whole) * 100, 0, 100);
}

function formatCompact(value: number): string {
  return Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function statusPill(status: SchoolStatus): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100';
  if (status === 'inactive') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100';
}

function riskTone(score: number): string {
  if (score >= 65) return 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-100 dark:bg-rose-500/20 dark:border-rose-400/40';
  if (score >= 35) return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-100 dark:bg-amber-500/20 dark:border-amber-400/40';
  return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-100 dark:bg-emerald-500/20 dark:border-emerald-400/40';
}

function formatRelative(value?: string | null): string {
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

function getRecommendedNextAction(row: EnrichedSchool): string {
  if (row.status !== 'active') return 'Reactivate school workspace and verify admin ownership.';
  if (row.admins === 0) return 'Assign at least one admin with verified contact details.';
  if (row.students > 0 && row.teachers === 0) return 'Provision teacher accounts before next assignment cycle.';
  if (row.students === 0) return 'Complete roster import and section mapping for students.';
  if (row.totalTokens === 0) return 'Run AI-enabled class tasks and verify provider keys.';
  if (row.riskScore >= 65) return 'Open intervention review for this school and resolve top risk flags.';
  return 'Continue weekly monitoring and keep intervention SLA under target.';
}

function KpiCard({
  title,
  value,
  subtitle,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'accent';
}) {
  const toneClasses = {
    default: 'border-[#E8E4DC] bg-white dark:border-slate-700 dark:bg-slate-900',
    danger: 'border-rose-200 bg-rose-50 dark:border-rose-400/40 dark:bg-rose-500/20',
    warning: 'border-amber-200 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-500/20',
    success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/40 dark:bg-emerald-500/20',
    accent: 'border-indigo-200 bg-indigo-50 dark:border-indigo-400/40 dark:bg-indigo-500/20',
  } as const;
  return (
    <div className={clsx('rounded-2xl border p-4 shadow-sm', toneClasses[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-2xl font-bold text-[#1C1C2E] dark:text-slate-100">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {subtitle ? <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">{subtitle}</p> : null}
    </div>
  );
}

export default function DeveloperOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partialWarnings, setPartialWarnings] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);

  const [schools, setSchools] = useState<SchoolProfile[]>([]);
  const [schoolDirectory, setSchoolDirectory] = useState<SchoolDirectoryItem[]>([]);
  const [usage, setUsage] = useState<UsagePayload>({ events: 0, totalTokens: 0, records: [] });
  const [audit, setAudit] = useState<AuditPayload>({ events: [] });
  const [career, setCareer] = useState<CareerIssuesPayload>({ issues: [] });
  const [observability, setObservability] = useState<ObservabilityPayload>({
    counters: { authFailures: 0, fiveXxEvents: 0, blockedThrottleBuckets: 0 },
    alerts: [],
  });
  const [pendingAffiliateRequests, setPendingAffiliateRequests] = useState(0);
  const [controlTower, setControlTower] = useState<DeveloperControlTowerPayload | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [boardFilter, setBoardFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('risk-desc');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('cards');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');

  async function loadOverview() {
    setLoading(true);
    setError('');
    setPartialWarnings([]);
    try {
      const sessionRes = await fetch('/api/developer/session/me', { cache: 'no-store' });
      if (!sessionRes.ok) {
        setError('Session error. Please refresh or sign in again.');
        return;
      }

      const [
        schoolsRes,
        usageRes,
        auditRes,
        careerRes,
        observabilityRes,
        affiliateRes,
        controlTowerRes,
      ] = await Promise.all([
        fetch('/api/developer/schools', { cache: 'no-store' }),
        fetch('/api/developer/usage/tokens?limit=500', { cache: 'no-store' }),
        fetch('/api/developer/audit?limit=300', { cache: 'no-store' }),
        fetch('/api/developer/data-quality/verify-career-sources', { cache: 'no-store' }),
        fetch('/api/developer/observability/summary?hours=24', { cache: 'no-store' }),
        fetch('/api/developer/affiliate-requests?status=pending&limit=200', { cache: 'no-store' }),
        fetch('/api/developer/control-tower?hours=24', { cache: 'no-store' }),
      ]);

      const schoolsBody = await schoolsRes.json().catch(() => null);
      const usageBody = await usageRes.json().catch(() => null);
      const auditBody = await auditRes.json().catch(() => null);
      const careerBody = await careerRes.json().catch(() => null);
      const observabilityBody = await observabilityRes.json().catch(() => null);
      const affiliateBody = await affiliateRes.json().catch(() => null);
      const controlTowerBody = await controlTowerRes.json().catch(() => null);
      const warnings: string[] = [];

      if (!schoolsRes.ok) {
        setError(extractApiMessage(schoolsBody, 'Failed to load developer overview.'));
        return;
      }
      if (!usageRes.ok) warnings.push(`Usage feed unavailable: ${extractApiMessage(usageBody, 'request failed')}`);
      if (!auditRes.ok) warnings.push(`Audit feed unavailable: ${extractApiMessage(auditBody, 'request failed')}`);
      if (!careerRes.ok) warnings.push(`Career quality feed unavailable: ${extractApiMessage(careerBody, 'request failed')}`);
      if (!observabilityRes.ok) warnings.push(`Observability feed unavailable: ${extractApiMessage(observabilityBody, 'request failed')}`);
      if (!affiliateRes.ok) warnings.push(`Affiliate queue unavailable: ${extractApiMessage(affiliateBody, 'request failed')}`);
      if (!controlTowerRes.ok) warnings.push(`Control tower unavailable: ${extractApiMessage(controlTowerBody, 'request failed')}`);

      const schoolsData = unwrap<SchoolsPayload>(schoolsBody);
      const usageData = usageRes.ok
        ? unwrap<UsagePayload>(usageBody)
        : { events: 0, totalTokens: 0, records: [] };
      const auditData = auditRes.ok ? unwrap<AuditPayload>(auditBody) : { events: [] };
      const careerData = careerRes.ok ? unwrap<CareerIssuesPayload>(careerBody) : { issues: [] };
      const observabilityData = observabilityRes.ok
        ? unwrap<ObservabilityPayload>(observabilityBody)
        : { counters: { authFailures: 0, fiveXxEvents: 0, blockedThrottleBuckets: 0 }, alerts: [] };
      const affiliateData = affiliateRes.ok
        ? unwrap<{ requests?: Array<{ id: string }> }>(affiliateBody)
        : { requests: [] };
      const controlTowerData = controlTowerRes.ok
        ? unwrap<DeveloperControlTowerPayload>(controlTowerBody)
        : null;

      setSchools(Array.isArray(schoolsData.schools) ? schoolsData.schools : []);
      setSchoolDirectory(Array.isArray(schoolsData.schoolDirectory) ? schoolsData.schoolDirectory : []);
      setUsage({
        events: Number(usageData.events) || 0,
        totalTokens: Number(usageData.totalTokens) || 0,
        records: Array.isArray(usageData.records) ? usageData.records : [],
      });
      setAudit({ events: Array.isArray(auditData.events) ? auditData.events : [] });
      setCareer({ issues: Array.isArray(careerData.issues) ? careerData.issues : [] });
      setObservability(observabilityData);
      setPendingAffiliateRequests(
        Array.isArray(affiliateData.requests) ? affiliateData.requests.length : 0
      );
      setControlTower(controlTowerData);
      setPartialWarnings(warnings);
      setLastUpdated(new Date().toISOString());
    } catch {
      setError('Failed to load developer overview.');
      setPartialWarnings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = setInterval(() => {
      void loadOverview();
    }, 60_000);
    return () => clearInterval(timer);
  }, [autoRefreshEnabled]);

  const schoolMetaById = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school]));
  }, [schools]);

  const enrichedSchools = useMemo<EnrichedSchool[]>(() => {
    return schoolDirectory.map((row) => {
      const meta = schoolMetaById.get(row.schoolId);
      const scores = calcSchoolScores(row);
      return {
        ...row,
        board: meta?.board || 'Unknown',
        city: meta?.city,
        state: meta?.state,
        ...scores,
      };
    });
  }, [schoolDirectory, schoolMetaById]);

  const boardOptions = useMemo(() => {
    const uniqueBoards = [...new Set(enrichedSchools.map((row) => row.board).filter(Boolean))];
    return uniqueBoards.sort((a, b) => a.localeCompare(b));
  }, [enrichedSchools]);

  const filteredSchools = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = enrichedSchools.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (boardFilter !== 'all' && row.board !== boardFilter) return false;
      if (!q) return true;
      return (
        row.schoolName.toLowerCase().includes(q) ||
        row.schoolCode.toLowerCase().includes(q) ||
        row.board.toLowerCase().includes(q) ||
        `${row.city || ''} ${row.state || ''}`.toLowerCase().includes(q)
      );
    });

    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sortMode === 'health-desc') return b.healthScore - a.healthScore;
      if (sortMode === 'risk-desc') return b.riskScore - a.riskScore;
      if (sortMode === 'students-desc') return b.students - a.students;
      if (sortMode === 'tokens-desc') return b.totalTokens - a.totalTokens;
      return a.schoolName.localeCompare(b.schoolName);
    });
    return sorted;
  }, [enrichedSchools, search, statusFilter, boardFilter, sortMode]);

  useEffect(() => {
    if (filteredSchools.length === 0) {
      setSelectedSchoolId('');
      return;
    }
    if (!selectedSchoolId || !filteredSchools.some((row) => row.schoolId === selectedSchoolId)) {
      setSelectedSchoolId(filteredSchools[0].schoolId);
    }
  }, [filteredSchools, selectedSchoolId]);

  const selectedSchool = useMemo(
    () => filteredSchools.find((row) => row.schoolId === selectedSchoolId) || null,
    [filteredSchools, selectedSchoolId]
  );

  const totals = useMemo(() => {
    return enrichedSchools.reduce(
      (acc, row) => {
        acc.schools += 1;
        acc.students += row.students;
        acc.teachers += row.teachers;
        acc.admins += row.admins;
        acc.tokens += row.totalTokens;
        if (row.status === 'active') acc.active += 1;
        if (row.status === 'inactive') acc.inactive += 1;
        if (row.status === 'archived') acc.archived += 1;
        if (row.riskScore >= 65) acc.highRisk += 1;
        return acc;
      },
      {
        schools: 0,
        students: 0,
        teachers: 0,
        admins: 0,
        tokens: 0,
        active: 0,
        inactive: 0,
        archived: 0,
        highRisk: 0,
      }
    );
  }, [enrichedSchools]);

  const boardDistribution = useMemo(() => {
    const map = new Map<string, number>();
    for (const school of enrichedSchools) {
      map.set(school.board, (map.get(school.board) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([board, count]) => ({ board, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [enrichedSchools]);

  const topEndpoints = useMemo(() => {
    const byEndpoint = new Map<string, { events: number; tokens: number }>();
    for (const record of usage.records || []) {
      const endpoint = record.endpoint || 'unknown';
      const bucket = byEndpoint.get(endpoint) ?? { events: 0, tokens: 0 };
      bucket.events += 1;
      bucket.tokens += Math.max(0, Number(record.totalTokens) || 0);
      byEndpoint.set(endpoint, bucket);
    }
    return [...byEndpoint.entries()]
      .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 6);
  }, [usage.records]);

  const topAuditActions = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const event of audit.events || []) {
      const action = (event.action || 'unknown').trim() || 'unknown';
      byAction.set(action, (byAction.get(action) ?? 0) + 1);
    }
    return [...byAction.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [audit.events]);

  const activeAlerts = useMemo(
    () => (observability.alerts || []).filter((alert) => alert.status !== 'ok').length,
    [observability.alerts]
  );

  const avgStudentsPerTeacher = totals.teachers > 0 ? totals.students / totals.teachers : 0;
  const avgTokensPerSchool = totals.schools > 0 ? totals.tokens / totals.schools : 0;

  if (loading && enrichedSchools.length === 0 && !error) {
    return (
      <RoleStatusPanel
        role="developer"
        variant="loading"
        title="Loading Developer Console"
        message="Collecting school telemetry and operational health signals."
      />
    );
  }

  if (!loading && enrichedSchools.length === 0 && !error) {
    return (
      <RoleStatusPanel
        role="developer"
        variant="empty"
        title="No Schools Found"
        message="No school records are available yet. Start onboarding to populate the console."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50 p-5 shadow-sm dark:border-indigo-400/40 dark:from-indigo-500/20 dark:via-sky-500/20 dark:to-emerald-500/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">
              Developer Control Tower
            </p>
            <h1 className="mt-1 font-fraunces text-2xl font-bold text-navy-700 dark:text-slate-100">
              School Intelligence Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#4A4A6A] dark:text-slate-200">
              Unified visibility across school onboarding, staffing, enrollment, usage, and operational risk.
            </p>
            <p className="mt-1 text-xs text-[#6A6A84] dark:text-slate-300">
              Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Not loaded yet'}
            </p>
          </div>
          <button
            onClick={() => void loadOverview()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-400/40 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAutoRefreshEnabled((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-400/40 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
          >
            <Clock3 className="h-3.5 w-3.5" />
            Auto: {autoRefreshEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100">
          {error}
        </div>
      ) : null}
      {!error && partialWarnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100">
          <p className="font-semibold">Partial Data Warning</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {partialWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard title="Schools" value={totals.schools} subtitle={`${totals.active} active`} />
        <KpiCard
          title="Users"
          value={totals.students + totals.teachers + totals.admins}
          subtitle={`${totals.students.toLocaleString()} students`}
        />
        <KpiCard
          title="AI Token Events"
          value={usage.events}
          subtitle={`${(usage.totalTokens || totals.tokens).toLocaleString()} tokens`}
          tone="accent"
        />
        <KpiCard title="High Risk Schools" value={totals.highRisk} subtitle="Need intervention" tone="warning" />
        <KpiCard title="Pending Affiliates" value={pendingAffiliateRequests} subtitle="Onboarding queue" tone="success" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard title="Auth Failures (24h)" value={observability.counters.authFailures} tone="warning" />
        <KpiCard title="5xx Events (24h)" value={observability.counters.fiveXxEvents} tone="danger" />
        <KpiCard title="Throttle Blocks" value={observability.counters.blockedThrottleBuckets} tone="warning" />
        <KpiCard title="Active Alerts" value={activeAlerts} tone={activeAlerts > 0 ? 'danger' : 'success'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Developer Access Matrix</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            What can be monitored directly from school data surfaces.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><Building2 className="h-3.5 w-3.5" /> Identity + status</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{totals.schools} schools</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><Users className="h-3.5 w-3.5" /> Staff + learner counts</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCompact(totals.students + totals.teachers + totals.admins)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><GraduationCap className="h-3.5 w-3.5" /> Class 10/12 split</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Per school</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><ShieldCheck className="h-3.5 w-3.5" /> Admin contacts + onboarding</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{pendingAffiliateRequests} pending</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-800">
              <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><Bot className="h-3.5 w-3.5" /> AI usage footprint</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCompact(usage.totalTokens || totals.tokens)} tokens</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Status Distribution</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Operational state spread across network schools.
          </p>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-gray-600 dark:text-slate-300">
                <span>Active</span>
                <span>{totals.active}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage(totals.active, totals.schools)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-gray-600 dark:text-slate-300">
                <span>Inactive</span>
                <span>{totals.inactive}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentage(totals.inactive, totals.schools)}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-gray-600 dark:text-slate-300">
                <span>Archived</span>
                <span>{totals.archived}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-slate-500" style={{ width: `${percentage(totals.archived, totals.schools)}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2.5 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Avg student-teacher ratio: <span className="font-semibold">{avgStudentsPerTeacher.toFixed(1)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Usage Pressure</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Highest token-consuming endpoints from recent events.
          </p>
          <div className="mt-3 space-y-2">
            {topEndpoints.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-300">No endpoint activity in current window.</p>
            ) : topEndpoints.map((entry) => (
              <div key={entry.endpoint} className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="truncate text-[11px] font-semibold text-[#1C1C2E] dark:text-slate-100">{entry.endpoint}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600 dark:text-slate-300">
                  <span>{entry.events} events</span>
                  <span className="font-semibold">{formatCompact(entry.tokens)} tokens</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5 text-xs text-indigo-800 dark:border-indigo-400/40 dark:bg-indigo-500/20 dark:text-indigo-100">
            Avg tokens per school: <span className="font-semibold">{formatCompact(avgTokensPerSchool)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">School Intelligence Explorer</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-300">
              Filter, prioritize, and drill into schools with risk and usage context.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setLayoutMode('cards')}
              className={clsx(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5',
                layoutMode === 'cards'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setLayoutMode('table')}
              className={clsx(
                'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5',
                layoutMode === 'table'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100'
                  : 'border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              )}
            >
              <List className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <label className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search school, code, board, city..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>

          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
            <Filter className="h-3.5 w-3.5 text-gray-500 dark:text-slate-300" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full bg-transparent text-xs font-semibold text-gray-700 outline-none dark:text-slate-200"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
            <select
              value={boardFilter}
              onChange={(event) => setBoardFilter(event.target.value)}
              className="w-full bg-transparent text-xs font-semibold text-gray-700 outline-none dark:text-slate-200"
            >
              <option value="all">All boards</option>
              {boardOptions.map((board) => (
                <option key={board} value={board}>{board}</option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950">
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="w-full bg-transparent text-xs font-semibold text-gray-700 outline-none dark:text-slate-200"
            >
              <option value="risk-desc">Sort: Highest risk</option>
              <option value="health-desc">Sort: Best health</option>
              <option value="students-desc">Sort: Most students</option>
              <option value="tokens-desc">Sort: Most tokens</option>
              <option value="name-asc">Sort: Name A-Z</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-slate-300">
          <p>Showing {filteredSchools.length} of {enrichedSchools.length} schools</p>
          <p>{totals.highRisk} high-risk | {career.issues.length} career-source issue(s) | {audit.events.length} audit event(s)</p>
        </div>

        {loading ? (
          <div className="mt-5 flex h-36 items-center justify-center text-gray-400 dark:text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading school intelligence...
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-slate-700 dark:text-slate-300">
            No schools match your filters.
          </div>
        ) : layoutMode === 'cards' ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredSchools.slice(0, 14).map((row) => (
              <button
                key={row.schoolId}
                onClick={() => setSelectedSchoolId(row.schoolId)}
                className={clsx(
                  'rounded-2xl border p-4 text-left transition-colors',
                  selectedSchoolId === row.schoolId
                    ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/20'
                    : 'border-[#E8E4DC] bg-[#FCFBF8] hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">{row.schoolName}</p>
                    <p className="text-[11px] text-gray-500 dark:text-slate-300">
                      {row.schoolCode} | {row.board} | {row.city || 'City NA'}
                    </p>
                  </div>
                  <span className={clsx('rounded-full px-2 py-1 text-[10px] font-semibold uppercase', statusPill(row.status))}>
                    {row.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-lg bg-white px-2 py-1 dark:bg-slate-900">
                    <p className="text-gray-500 dark:text-slate-300">Students</p>
                    <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{formatCompact(row.students)}</p>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1 dark:bg-slate-900">
                    <p className="text-gray-500 dark:text-slate-300">Teachers</p>
                    <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{row.teachers}</p>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1 dark:bg-slate-900">
                    <p className="text-gray-500 dark:text-slate-300">Tokens</p>
                    <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{formatCompact(row.totalTokens)}</p>
                  </div>
                  <div className="rounded-lg bg-white px-2 py-1 dark:bg-slate-900">
                    <p className="text-gray-500 dark:text-slate-300">Ratio</p>
                    <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">
                      {row.teachers > 0 ? row.studentTeacherRatio.toFixed(1) : 'NA'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className={clsx('rounded-lg border px-2 py-1.5 text-[11px]', riskTone(row.riskScore))}>
                    <p className="font-semibold">Risk {row.riskScore}</p>
                    <p className="mt-0.5">{row.riskFlags[0] || 'Stable'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100">
                    <p className="font-semibold">Health {row.healthScore}</p>
                    <p className="mt-0.5">Token/student {row.tokenPerStudent.toFixed(1)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#E8E4DC] dark:border-slate-700">
            <table className="min-w-[980px] w-full bg-white dark:bg-slate-900">
              <thead>
                <tr className="border-b border-[#E8E4DC] bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300">School</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300">Board/Location</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300">Students</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300">Teachers</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300">Tokens</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300">Health</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-300">Risk</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.slice(0, 25).map((row) => (
                  <tr key={row.schoolId} className="border-b border-[#E8E4DC] last:border-0 dark:border-slate-700">
                    <td className="px-3 py-2 text-sm">
                      <button
                        onClick={() => setSelectedSchoolId(row.schoolId)}
                        className="font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                      >
                        {row.schoolName}
                      </button>
                      <p className="text-[11px] text-gray-500 dark:text-slate-300">{row.schoolCode}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-slate-300">
                      <p>{row.board}</p>
                      <p>{row.city || 'NA'}, {row.state || 'NA'}</p>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-[#1C1C2E] dark:text-slate-100">{row.students.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sm text-[#1C1C2E] dark:text-slate-100">{row.teachers.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sm text-[#1C1C2E] dark:text-slate-100">{formatCompact(row.totalTokens)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100">
                        {row.healthScore}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={clsx('rounded-full border px-2 py-1 text-[11px] font-semibold', riskTone(row.riskScore))}>
                        {row.riskScore}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/developer/schools/${row.schoolId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 dark:text-indigo-300"
                      >
                        Open
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">School Spotlight</p>
          {!selectedSchool ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-300">Pick a school to inspect details.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-[#1C1C2E] dark:text-slate-100">{selectedSchool.schoolName}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-300">
                    {selectedSchool.schoolCode} | {selectedSchool.board} | {selectedSchool.city || 'City NA'}, {selectedSchool.state || 'State NA'}
                  </p>
                </div>
                <span className={clsx('rounded-full px-2 py-1 text-[11px] font-semibold uppercase', statusPill(selectedSchool.status))}>
                  {selectedSchool.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-gray-500 dark:text-slate-300">Class 10</p>
                  <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{selectedSchool.studentsClass10}</p>
                </div>
                <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-gray-500 dark:text-slate-300">Class 12</p>
                  <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{selectedSchool.studentsClass12}</p>
                </div>
                <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-gray-500 dark:text-slate-300">Admins</p>
                  <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{selectedSchool.admins}</p>
                </div>
                <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-gray-500 dark:text-slate-300">Token/student</p>
                  <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{selectedSchool.tokenPerStudent.toFixed(1)}</p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className={clsx('rounded-lg border px-3 py-2 text-xs', riskTone(selectedSchool.riskScore))}>
                  <p className="font-semibold">Risk score: {selectedSchool.riskScore}</p>
                  <p className="mt-1">{selectedSchool.riskFlags.join(' | ') || 'No active risk flags.'}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100">
                  <p className="font-semibold">Health score: {selectedSchool.healthScore}</p>
                  <p className="mt-1">
                    Student-teacher ratio: {selectedSchool.teachers > 0 ? selectedSchool.studentTeacherRatio.toFixed(1) : 'NA'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-400/40 dark:bg-indigo-500/20 dark:text-indigo-100">
                <p className="font-semibold">Recommended next action</p>
                <p className="mt-1">{getRecommendedNextAction(selectedSchool)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Admin contacts</p>
                <div className="mt-1 space-y-1">
                  {selectedSchool.adminContacts.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-slate-300">No admin contacts available.</p>
                  ) : selectedSchool.adminContacts.slice(0, 3).map((contact) => (
                    <p key={contact.id} className="text-xs text-gray-600 dark:text-slate-300">
                      {contact.name}
                      {contact.phone ? ` | ${contact.phone}` : ''}
                      {contact.email ? ` | ${contact.email}` : ''}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/developer/schools/${selectedSchool.schoolId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Open School Workspace
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/developer/observability"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E4DC] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A4A6A] hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Monitor alerts
                  <AlertTriangle className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Ops Signals</p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="flex items-center gap-1.5 font-semibold text-[#1C1C2E] dark:text-slate-100">
                <BarChart2 className="h-3.5 w-3.5 text-indigo-600" />
                Top boards
              </p>
              <div className="mt-1 space-y-1">
                {boardDistribution.length === 0 ? (
                  <p className="text-gray-500 dark:text-slate-300">No board distribution yet.</p>
                ) : boardDistribution.map((entry) => (
                  <p key={entry.board} className="text-gray-600 dark:text-slate-300">{entry.board}: {entry.count}</p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="flex items-center gap-1.5 font-semibold text-[#1C1C2E] dark:text-slate-100">
                <ScrollText className="h-3.5 w-3.5 text-indigo-600" />
                Top audit actions
              </p>
              <div className="mt-1 space-y-1">
                {topAuditActions.length === 0 ? (
                  <p className="text-gray-500 dark:text-slate-300">No recent audit events.</p>
                ) : topAuditActions.map((entry) => (
                  <p key={entry.action} className="truncate text-gray-600 dark:text-slate-300">
                    {entry.action} ({entry.count})
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] p-2 dark:border-slate-700 dark:bg-slate-800">
              <p className="flex items-center gap-1.5 font-semibold text-[#1C1C2E] dark:text-slate-100">
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                Quick links
              </p>
              <div className="mt-1 grid gap-1">
                <Link href="/developer/schools" className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 dark:text-indigo-300">
                  <School className="h-3.5 w-3.5" /> Schools
                </Link>
                <Link href="/developer/usage" className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 dark:text-indigo-300">
                  <Zap className="h-3.5 w-3.5" /> Usage
                </Link>
                <Link href="/developer/audit" className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 dark:text-indigo-300">
                  <ClipboardList className="h-3.5 w-3.5" /> Audit
                </Link>
                <Link href="/developer/career-health" className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 dark:text-indigo-300">
                  <BookOpen className="h-3.5 w-3.5" /> Career Health
                </Link>
                <Link href="/developer/observability" className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 dark:text-indigo-300">
                  <Activity className="h-3.5 w-3.5" /> Observability
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Model Health</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
            Provider readiness and task routing from centralized model configuration.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {(['nvidia', 'gemini', 'groq'] as const).map((provider) => {
              const configured = controlTower?.modelHealth?.providerConfigured?.[provider] === true;
              return (
                <div
                  key={provider}
                  className={clsx(
                    'rounded-lg border px-2 py-1.5',
                    configured
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100'
                      : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100'
                  )}
                >
                  <p className="font-semibold uppercase">{provider}</p>
                  <p>{configured ? 'Configured' : 'Missing key'}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 space-y-1">
            {(controlTower?.modelHealth.models ?? []).slice(0, 8).map((model) => (
              <div key={`${model.alias}-${model.model}`} className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{model.alias} ({model.provider})</p>
                <p className="text-gray-600 dark:text-slate-300">
                  events: {model.events} | failure: {model.failureRatePercent}% | tasks: {model.assignedTasks.slice(0, 3).join(', ') || 'none'}
                </p>
              </div>
            ))}
            {(controlTower?.modelHealth.models ?? []).length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-300">No model health data yet.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Deployment Readiness</p>
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-gray-700 dark:text-slate-200">
              Env checks: <span className="font-semibold">{controlTower?.deploymentReadiness.envOk ? 'OK' : 'Action required'}</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              Supabase service: <span className="font-semibold">{controlTower?.deploymentReadiness.supabaseServiceConfigured ? 'configured' : 'not configured'}</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              State rows: <span className="font-semibold">{controlTower?.deploymentReadiness.migrationSignals.hasAppStateRows ? 'present' : 'missing'}</span> ({formatRelative(controlTower?.deploymentReadiness.migrationSignals.latestStateUpdateAt)})
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              RLS health: <span className="font-semibold">{controlTower?.deploymentReadiness.rlsHealth.status ?? 'unknown'}</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              pgvector coverage: <span className="font-semibold">{controlTower?.deploymentReadiness.pgvectorCoverage.percent ?? 0}%</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              Service worker: <span className="font-semibold">{controlTower?.deploymentReadiness.serviceWorker.exists ? formatRelative(controlTower?.deploymentReadiness.serviceWorker.updatedAt) : 'missing'}</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              Legacy sessions: <span className="font-semibold">{controlTower?.deploymentReadiness.legacySessionsEnabled ? 'enabled' : 'disabled'}</span>
            </p>
            <p className="text-gray-700 dark:text-slate-200">
              Single-env mode: <span className="font-semibold">{controlTower?.deploymentReadiness.singleEnvModeEnabled ? 'enabled' : 'disabled'}</span>
            </p>
          </div>
          {(controlTower?.deploymentReadiness.envMissing ?? []).length > 0 ? (
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100">
              Missing env: {controlTower?.deploymentReadiness.envMissing.join(', ')}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Validation and API Failure Board</p>
          <div className="mt-2 space-y-1">
            {(controlTower?.validationBoard ?? []).slice(0, 10).map((item) => (
              <div key={`${item.endpoint}-${item.schema}`} className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
                <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{item.endpoint}</p>
                <p className="text-gray-600 dark:text-slate-300">
                  schema: {item.schema} | failures: {item.failures} | sample: {item.sampleErrorCode} | last: {formatRelative(item.lastSeenAt)}
                </p>
              </div>
            ))}
            {(controlTower?.validationBoard ?? []).length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-300">No validation failures in the recent window.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Route Signals</p>
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-gray-700 dark:text-slate-200">
              Avg page load: <span className="font-semibold">{Math.round(controlTower?.routeSignals.avgPageLoadMs ?? 0)}ms</span>
            </p>
            {(controlTower?.routeSignals.slowestApiRoutes ?? []).slice(0, 5).map((route) => (
              <p key={route.endpoint} className="text-gray-700 dark:text-slate-200">
                {route.endpoint}: <span className="font-semibold">{route.errors}</span> errors ({route.errorRatePercent}%)
              </p>
            ))}
            {(controlTower?.routeSignals.routeDropoffs ?? []).slice(0, 4).map((route) => (
              <p key={route.route} className="text-gray-600 dark:text-slate-300">
                Drop-off {route.route}: {route.count}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">AI Quality Board</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-500 dark:text-slate-300">Groundedness</p>
            <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{controlTower?.aiQuality.avgGroundednessScore ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-500 dark:text-slate-300">Citation Coverage</p>
            <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{controlTower?.aiQuality.avgCitationCoverageScore ?? 0}</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-500 dark:text-slate-300">Retrieval Miss Rate</p>
            <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{controlTower?.aiQuality.retrievalMissRatePercent ?? 0}%</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-500 dark:text-slate-300">Repair Rate</p>
            <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{controlTower?.aiQuality.repairRatePercent ?? 0}%</p>
          </div>
          <div className="rounded-lg border border-[#E8E4DC] bg-[#FCFBF8] px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="text-gray-500 dark:text-slate-300">Hallucination Flags</p>
            <p className="font-semibold text-[#1C1C2E] dark:text-slate-100">{controlTower?.aiQuality.hallucinationFlags ?? 0}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Provider latency/error/cost proxy</p>
            {(controlTower?.aiQuality.providerStats ?? []).slice(0, 8).map((item) => (
              <p key={`${item.task}-${item.provider}-${item.model}`} className="text-xs text-gray-600 dark:text-slate-300">
                {item.task} | {item.provider}/{item.model}: {item.events} events, {item.failures} failures, {item.avgLatencyMs}ms, tokens {item.totalTokens}
              </p>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Recent weak-grounding and failures</p>
            {(controlTower?.aiQuality.recentFlags ?? []).slice(0, 8).map((flag) => (
              <p key={flag.id} className="text-xs text-gray-600 dark:text-slate-300">
                {flag.task}: {flag.issue} ({formatRelative(flag.createdAt)})
              </p>
            ))}
            {(controlTower?.aiQuality.recentFlags ?? []).length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-300">No recent AI quality flags.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[#E8E4DC] bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-[#1C1C2E] dark:text-slate-100">Micro Access</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-300">
          Fast paths for incident triage and school-level interventions.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Link href="/developer/observability" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-500/20">
            <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-100">5xx Events</p>
            <p className="text-sm font-bold text-rose-900 dark:text-rose-100">{observability.counters.fiveXxEvents}</p>
          </Link>
          <Link href="/developer/observability" className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 hover:bg-amber-100 dark:border-amber-400/40 dark:bg-amber-500/20">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-100">Auth Failures</p>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-100">{observability.counters.authFailures}</p>
          </Link>
          <Link href="/developer/usage" className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 hover:bg-indigo-100 dark:border-indigo-400/40 dark:bg-indigo-500/20">
            <p className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-100">Token Events</p>
            <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">{usage.events}</p>
          </Link>
          <Link href="/developer/career-health" className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 hover:bg-violet-100 dark:border-violet-400/40 dark:bg-violet-500/20">
            <p className="text-[11px] font-semibold text-violet-800 dark:text-violet-100">Career Source Issues</p>
            <p className="text-sm font-bold text-violet-900 dark:text-violet-100">{career.issues.length}</p>
          </Link>
          <Link href="/developer/onboarding" className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/20">
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-100">Affiliate Queue</p>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{pendingAffiliateRequests}</p>
          </Link>
        </div>
      </div>

      <div className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[#E8E4DC] bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:hidden">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-2 py-2 text-[11px] font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-200"
          >
            <Clock3 className="h-3.5 w-3.5" /> Top
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-2 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/20 dark:text-indigo-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <Link
            href="/developer/schools"
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-100"
          >
            <School className="h-3.5 w-3.5" /> Schools
          </Link>
        </div>
      </div>
    </div>
  );
}
