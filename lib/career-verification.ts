import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect } from '@/lib/supabase-rest';

export interface CareerSourceTarget {
  id: string;
  title: string;
  url: string;
}

export interface CareerSourceCheckResult extends CareerSourceTarget {
  ok: boolean;
  statusCode: number;
  checkedAt: string;
  error?: string;
}

interface DataQualityIssueRow {
  id: string;
  issue_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  source_path: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const CAREER_SOURCE_TARGETS: CareerSourceTarget[] = [
  { id: 'icsi', title: 'ICSI Official', url: 'https://www.icsi.edu/' },
  { id: 'cuet-ug', title: 'NTA CUET-UG', url: 'https://exams.nta.ac.in/CUET-UG' },
  { id: 'iim-indore-ipm', title: 'IIM Indore IPM Admissions', url: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/' },
  { id: 'iim-ranchi-ipm', title: 'IIM Ranchi IPM Admissions', url: 'https://app.iimranchi.ac.in/admission/ipm.html' },
  { id: 'nism', title: 'NISM Certifications', url: 'https://www.nism.ac.in/depository-operations-cpe/' },
  { id: 'icai-bos', title: 'ICAI BoS Announcements', url: 'https://boslive.icai.org/announcement_details.php?id=484' },
  { id: 'icmai', title: 'ICMAI Students', url: 'https://icmai.in/studentswebsite/mgmtaccexam.php' },
  { id: 'ncs', title: 'National Career Service', url: 'https://www.ncs.gov.in/pages/about-us.aspx' },
];

async function fetchWithTimeout(url: string, method: 'HEAD' | 'GET', timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runCheck(target: CareerSourceTarget): Promise<CareerSourceCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    let response = await fetchWithTimeout(target.url, 'HEAD');
    if (response.status === 405 || response.status === 403) {
      response = await fetchWithTimeout(target.url, 'GET');
    }
    const ok = response.ok && response.status < 400;
    return {
      ...target,
      ok,
      statusCode: response.status,
      checkedAt,
      error: ok ? undefined : `Non-OK status ${response.status}`,
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      statusCode: 0,
      checkedAt,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

async function hasOpenIssueForUrl(url: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseSelect<DataQualityIssueRow>('data_quality_issues', {
    select: '*',
    filters: [
      { column: 'issue_type', value: 'career_source_unreachable' },
      { column: 'source_path', value: url },
    ],
    orderBy: 'created_at',
    ascending: false,
    limit: 20,
  }).catch(() => []);
  return rows.some((row) => row.status === 'open' || row.status === 'acknowledged');
}

async function writeIssueForFailure(result: CareerSourceCheckResult): Promise<void> {
  if (!isSupabaseServiceConfigured() || result.ok) return;
  const hasOpenIssue = await hasOpenIssueForUrl(result.url);
  if (hasOpenIssue) return;
  await supabaseInsert('data_quality_issues', {
    issue_type: 'career_source_unreachable',
    severity: 'high',
    status: 'open',
    source_path: result.url,
    details: {
      sourceId: result.id,
      title: result.title,
      statusCode: result.statusCode,
      error: result.error || null,
      checkedAt: result.checkedAt,
    },
  }).catch(() => undefined);
}

export function listCareerSourceTargets(): CareerSourceTarget[] {
  return CAREER_SOURCE_TARGETS;
}

export async function runCareerSourceVerification(input?: { persistIssues?: boolean }) {
  const persistIssues = input?.persistIssues !== false;
  const checks = await Promise.all(CAREER_SOURCE_TARGETS.map((target) => runCheck(target)));
  if (persistIssues) {
    await Promise.all(checks.filter((check) => !check.ok).map((check) => writeIssueForFailure(check)));
  }
  const failed = checks.filter((check) => !check.ok);
  return {
    checkedAt: new Date().toISOString(),
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };
}

export async function listCareerSourceIssues(limit = 60): Promise<DataQualityIssueRow[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const safeLimit = Math.max(10, Math.min(200, Number(limit) || 60));
  const rows = await supabaseSelect<DataQualityIssueRow>('data_quality_issues', {
    select: '*',
    filters: [{ column: 'issue_type', value: 'career_source_unreachable' }],
    orderBy: 'created_at',
    ascending: false,
    limit: safeLimit,
  }).catch(() => []);
  return rows;
}
