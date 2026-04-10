import { getTokenUsageRollup } from '@/lib/platform-rbac-db';
import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';

interface AuditEventRow {
  created_at: string;
  endpoint: string;
  action: string;
  status_code: number;
  actor_role: string;
  metadata: Record<string, unknown> | null;
}

interface RequestThrottleRow {
  throttle_key: string;
  bucket_start: string;
  window_seconds: number;
  request_count: number;
  blocked_until: string | null;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
}

type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
type AlertStatus = 'ok' | 'warn' | 'critical';

export interface ObservabilityAlert {
  code: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  metric: number;
  threshold: number;
}

export interface ObservabilitySummary {
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
  alerts: ObservabilityAlert[];
}

function toMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAlert(input: {
  code: string;
  message: string;
  metric: number;
  warnAt: number;
  criticalAt: number;
  warnSeverity?: AlertSeverity;
  criticalSeverity?: AlertSeverity;
}): ObservabilityAlert {
  if (input.metric >= input.criticalAt) {
    return {
      code: input.code,
      message: input.message,
      metric: input.metric,
      threshold: input.criticalAt,
      status: 'critical',
      severity: input.criticalSeverity || 'critical',
    };
  }
  if (input.metric >= input.warnAt) {
    return {
      code: input.code,
      message: input.message,
      metric: input.metric,
      threshold: input.warnAt,
      status: 'warn',
      severity: input.warnSeverity || 'high',
    };
  }
  return {
    code: input.code,
    message: input.message,
    metric: input.metric,
    threshold: input.warnAt,
    status: 'ok',
    severity: 'low',
  };
}

export async function getObservabilitySummary(windowHours = 24): Promise<ObservabilitySummary> {
  const safeWindowHours = Math.max(1, Math.min(168, Number(windowHours) || 24));
  const nowMs = Date.now();
  const cutoffIso = new Date(nowMs - safeWindowHours * 60 * 60 * 1000).toISOString();

  if (!isSupabaseServiceConfigured()) {
    return {
      generatedAt: new Date().toISOString(),
      windowHours: safeWindowHours,
      counters: {
        auditEvents: 0,
        authFailures: 0,
        authEvents: 0,
        fiveXxEvents: 0,
        activeThrottleBuckets: 0,
        blockedThrottleBuckets: 0,
        tokenEvents: 0,
        totalTokens: 0,
      },
      alerts: [
        {
          code: 'observability-supabase-missing',
          severity: 'critical',
          status: 'critical',
          message: 'Supabase service role configuration is missing for observability.',
          metric: 1,
          threshold: 1,
        },
      ],
    };
  }

  const [auditRows, throttleRows, usage] = await Promise.all([
    supabaseSelect<AuditEventRow>('audit_events', {
      select: 'created_at,endpoint,action,status_code,actor_role,metadata',
      filters: [{ column: 'created_at', op: 'gte', value: cutoffIso }],
      orderBy: 'created_at',
      ascending: false,
      limit: 5000,
    }).catch(() => []),
    supabaseSelect<RequestThrottleRow>('request_throttle', {
      select: 'throttle_key,bucket_start,window_seconds,request_count,blocked_until,last_seen_at,metadata',
      filters: [{ column: 'last_seen_at', op: 'gte', value: cutoffIso }],
      orderBy: 'last_seen_at',
      ascending: false,
      limit: 5000,
    }).catch(() => []),
    getTokenUsageRollup({ limit: 1500 }).catch(() => ({ events: 0, totalTokens: 0, records: [] })),
  ]);

  const authEvents = auditRows.filter((row) =>
    row.endpoint.includes('/session/') || row.endpoint.includes('/auth/')
  );
  const authFailures = authEvents.filter((row) => {
    const action = String(row.action || '').toLowerCase();
    return row.status_code >= 400 || action.includes('failed') || action.includes('denied');
  });
  const fiveXxEvents = auditRows.filter((row) => Number(row.status_code) >= 500);
  const blockedThrottleBuckets = throttleRows.filter((row) => toMs(row.blocked_until) > nowMs).length;
  const activeThrottleBuckets = throttleRows.filter((row) => Number(row.request_count) > 0).length;
  const authFailurePct = authEvents.length > 0
    ? Math.round((authFailures.length / authEvents.length) * 10000) / 100
    : 0;

  const alerts: ObservabilityAlert[] = [
    toAlert({
      code: 'auth-failure-rate',
      message: 'Auth failures are elevated in the current window.',
      metric: authFailurePct,
      warnAt: 8,
      criticalAt: 15,
      warnSeverity: 'high',
      criticalSeverity: 'critical',
    }),
    toAlert({
      code: 'server-5xx-spike',
      message: 'Server 5xx responses exceed safe threshold.',
      metric: fiveXxEvents.length,
      warnAt: 8,
      criticalAt: 20,
      warnSeverity: 'high',
      criticalSeverity: 'critical',
    }),
    toAlert({
      code: 'bruteforce-throttle-signals',
      message: 'Throttle blocks indicate potential brute-force patterns.',
      metric: blockedThrottleBuckets,
      warnAt: 3,
      criticalAt: 8,
      warnSeverity: 'high',
      criticalSeverity: 'critical',
    }),
    toAlert({
      code: 'token-usage-surge',
      message: 'AI token usage is above planned cost envelope.',
      metric: usage.totalTokens,
      warnAt: 250000,
      criticalAt: 600000,
      warnSeverity: 'medium',
      criticalSeverity: 'high',
    }),
  ];

  return {
    generatedAt: new Date().toISOString(),
    windowHours: safeWindowHours,
    counters: {
      auditEvents: auditRows.length,
      authFailures: authFailures.length,
      authEvents: authEvents.length,
      fiveXxEvents: fiveXxEvents.length,
      activeThrottleBuckets,
      blockedThrottleBuckets,
      tokenEvents: usage.events,
      totalTokens: usage.totalTokens,
    },
    alerts,
  };
}
