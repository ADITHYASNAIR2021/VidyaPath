import { createHash } from 'node:crypto';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

interface IdempotencyRow {
  id: string;
  school_id: string | null;
  actor_auth_user_id: string | null;
  endpoint: string;
  idempotency_key: string;
  request_hash: string | null;
  response_json: Record<string, unknown> | null;
  status_code: number;
  created_at: string;
  expires_at: string;
}

export interface IdempotencyBeginInput {
  endpoint: string;
  schoolId?: string;
  actorAuthUserId?: string;
  actorScope?: string;
  idempotencyKey: string;
  requestBody: unknown;
  ttlSeconds?: number;
}

export type IdempotencyBeginResult =
  | { kind: 'proceed'; rowId: string; requestHash: string }
  | { kind: 'replay'; statusCode: number; response: Record<string, unknown> }
  | { kind: 'conflict'; message: string };

function isUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitize(value: string, max = 160): string {
  return value.trim().slice(0, max);
}

function normalizeActorScope(value?: string): string {
  const raw = sanitize(value || 'anonymous', 120).toLowerCase();
  return raw || 'anonymous';
}

function normalizeKey(value: string): string {
  return sanitize(value, 200).toLowerCase();
}

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function requestHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function isExpired(iso: string | undefined | null): boolean {
  if (!iso) return true;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return true;
  return ms <= Date.now();
}

function composeScopedKey(key: string, actorScope?: string): string {
  return `${normalizeActorScope(actorScope)}:${normalizeKey(key)}`.slice(0, 220);
}

function equalNullable(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a || null) === (b || null);
}

async function findExisting(input: {
  endpoint: string;
  scopedKey: string;
  schoolId?: string;
  actorAuthUserId?: string;
}): Promise<IdempotencyRow | null> {
  const rows = await supabaseSelect<IdempotencyRow>('api_idempotency', {
    select: '*',
    filters: [
      { column: 'endpoint', value: sanitize(input.endpoint, 180) },
      { column: 'idempotency_key', value: input.scopedKey },
    ],
    orderBy: 'created_at',
    ascending: false,
    limit: 10,
  }).catch(() => []);

  const schoolId = isUuid(input.schoolId) ? input.schoolId! : null;
  const actorAuthUserId = isUuid(input.actorAuthUserId) ? input.actorAuthUserId! : null;
  return (
    rows.find((row) => equalNullable(row.school_id, schoolId) && equalNullable(row.actor_auth_user_id, actorAuthUserId)) ||
    null
  );
}

export async function beginIdempotentRequest(input: IdempotencyBeginInput): Promise<IdempotencyBeginResult> {
  const endpoint = sanitize(input.endpoint, 180);
  const scopedKey = composeScopedKey(input.idempotencyKey, input.actorScope);
  if (!endpoint || !scopedKey) {
    return { kind: 'conflict', message: 'Invalid idempotency configuration.' };
  }

  if (!isSupabaseServiceConfigured()) {
    return { kind: 'proceed', rowId: 'local-noop', requestHash: requestHash(input.requestBody) };
  }

  const hash = requestHash(input.requestBody);
  const schoolId = isUuid(input.schoolId) ? input.schoolId! : null;
  const actorAuthUserId = isUuid(input.actorAuthUserId) ? input.actorAuthUserId! : null;
  const ttlSeconds = Math.max(60, Math.min(172800, Number(input.ttlSeconds) || 86400));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const existing = await findExisting({
    endpoint,
    scopedKey,
    schoolId: schoolId || undefined,
    actorAuthUserId: actorAuthUserId || undefined,
  });

  if (existing) {
    if (!isExpired(existing.expires_at)) {
      if (existing.request_hash && existing.request_hash !== hash) {
        return { kind: 'conflict', message: 'Idempotency key reused with a different request payload.' };
      }
      if (existing.response_json) {
        return {
          kind: 'replay',
          statusCode: Math.max(100, Math.min(599, Number(existing.status_code) || 200)),
          response: existing.response_json,
        };
      }
      return { kind: 'proceed', rowId: existing.id, requestHash: hash };
    }

    await supabaseUpdate<IdempotencyRow>(
      'api_idempotency',
      {
        request_hash: hash,
        response_json: null,
        status_code: 202,
        expires_at: expiresAt,
      },
      [{ column: 'id', value: existing.id }]
    ).catch(() => undefined);
    return { kind: 'proceed', rowId: existing.id, requestHash: hash };
  }

  try {
    const inserted = await supabaseInsert<IdempotencyRow>('api_idempotency', {
      school_id: schoolId,
      actor_auth_user_id: actorAuthUserId,
      endpoint,
      idempotency_key: scopedKey,
      request_hash: hash,
      response_json: null,
      status_code: 202,
      expires_at: expiresAt,
    }).catch(() => []);
    if (inserted[0]?.id) {
      return { kind: 'proceed', rowId: inserted[0].id, requestHash: hash };
    }
  } catch {
    // best-effort fallback below
  }

  const raced = await findExisting({
    endpoint,
    scopedKey,
    schoolId: schoolId || undefined,
    actorAuthUserId: actorAuthUserId || undefined,
  });
  if (!raced) {
    return { kind: 'conflict', message: 'Failed to reserve idempotency key.' };
  }
  if (raced.request_hash && raced.request_hash !== hash) {
    return { kind: 'conflict', message: 'Idempotency key reused with a different request payload.' };
  }
  if (raced.response_json) {
    return {
      kind: 'replay',
      statusCode: Math.max(100, Math.min(599, Number(raced.status_code) || 200)),
      response: raced.response_json,
    };
  }
  return { kind: 'proceed', rowId: raced.id, requestHash: hash };
}

export async function commitIdempotentResponse(input: {
  rowId: string;
  response: Record<string, unknown>;
  statusCode?: number;
  ttlSeconds?: number;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const rowId = sanitize(input.rowId, 120);
  if (!rowId || rowId === 'local-noop') return;
  const ttlSeconds = Math.max(60, Math.min(172800, Number(input.ttlSeconds) || 86400));
  await supabaseUpdate<IdempotencyRow>(
    'api_idempotency',
    {
      response_json: input.response,
      status_code: Math.max(100, Math.min(599, Number(input.statusCode) || 200)),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    },
    [{ column: 'id', value: rowId }]
  ).catch(() => undefined);
}
