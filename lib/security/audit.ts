import { isSupabaseServiceConfigured, supabaseInsert } from '@/lib/supabase-rest';

type AuditActorRole = 'student' | 'teacher' | 'admin' | 'developer' | 'system';

interface AuditEventRow {
  id: string;
  created_at: string;
}

interface RecordAuditInput {
  requestId: string;
  endpoint: string;
  action: string;
  statusCode: number;
  actorRole?: AuditActorRole;
  actorAuthUserId?: string;
  schoolId?: string;
  metadata?: Record<string, unknown>;
}

function sanitize(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function recordAuditEvent(input: RecordAuditInput): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const endpoint = sanitize(input.endpoint, 180);
  const action = sanitize(input.action, 120);
  const requestId = sanitize(input.requestId, 120);
  if (!endpoint || !action || !requestId) return;

  await supabaseInsert<AuditEventRow>('audit_events', {
    request_id: requestId,
    endpoint,
    action,
    status_code: Math.max(100, Math.min(599, Number(input.statusCode) || 500)),
    actor_role: input.actorRole || 'system',
    actor_auth_user_id: input.actorAuthUserId ? sanitize(input.actorAuthUserId, 120) : null,
    school_id: input.schoolId ? sanitize(input.schoolId, 120) : null,
    metadata: input.metadata ?? null,
  }).catch(() => undefined);
}
