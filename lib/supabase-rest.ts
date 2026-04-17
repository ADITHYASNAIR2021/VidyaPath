/**
 * Supabase data access layer.
 *
 * Internals use `@supabase/supabase-js` (PostgREST client) since 2026-04-17.
 * Public API (supabaseSelect/Insert/Update/Delete + types) is kept **stable**
 * so existing callers across `lib/*-db.ts` and `app/api/**` do NOT need to
 * change during the incremental migration to the typed client.
 *
 * Prefer the direct exports below for new code:
 *   - `getServiceClient()`     → service-role privileges (admin / cron)
 *   - `getUserClient(jwt)`     → per-request user JWT, honors RLS
 *   - `getAnonClient()`        → anon-key fallback (public reads)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface SupabaseServiceConfig {
  url: string;
  key: string;
  schema: string;
}

interface SupabasePublicConfig {
  url: string;
  anonKey: string;
  schema: string;
}

function readServiceConfig(): SupabaseServiceConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !key) return null;
  return { url, key, schema };
}

function readPublicConfig(): SupabasePublicConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey, schema };
}

export function isSupabaseServiceConfigured(): boolean {
  return !!readServiceConfig();
}

export function isSupabasePublicConfigured(): boolean {
  return !!readPublicConfig();
}

// ---------------------------------------------------------------------------
// Client singletons
// ---------------------------------------------------------------------------

// Schema is runtime-configurable (`SUPABASE_SCHEMA`), so we use the wide
// `SupabaseClient<any, any, any>` variant here and narrow at call sites.
type AnyClient = SupabaseClient<any, any, any>;

let serviceClient: AnyClient | null = null;
let anonClient: AnyClient | null = null;

/**
 * Service-role client. BYPASSES RLS. Use only in trusted server paths
 * (admin mutations, cron jobs, migrations). For per-user requests prefer
 * `getUserClient(jwt)`.
 */
export function getServiceClient(): AnyClient {
  if (serviceClient) return serviceClient;
  const config = readServiceConfig();
  if (!config) {
    throw new Error('Supabase service configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  serviceClient = createClient<any, any, any>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: config.schema },
    global: {
      headers: {
        'X-Client-Info': 'vidyapath-service',
      },
    },
  });
  return serviceClient;
}

/**
 * Per-request client signed with the end-user's Supabase access token.
 * Honors RLS policies. Use this from API routes once RLS is enabled.
 */
export function getUserClient(jwt: string): AnyClient {
  const pub = readPublicConfig();
  if (!pub) {
    throw new Error('Supabase public configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient<any, any, any>(pub.url, pub.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: pub.schema },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'X-Client-Info': 'vidyapath-user',
      },
    },
  });
}

/**
 * Anonymous (unauthenticated) client. Subject to RLS policies for the
 * `anon` role. Safe for public reads once RLS is in place.
 */
export function getAnonClient(): AnyClient {
  if (anonClient) return anonClient;
  const config = readPublicConfig();
  if (!config) {
    throw new Error('Supabase public configuration missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  anonClient = createClient<any, any, any>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: config.schema },
    global: {
      headers: {
        'X-Client-Info': 'vidyapath-anon',
      },
    },
  });
  return anonClient;
}

/** Reset cached clients. Useful for tests; not for production hot paths. */
export function __resetSupabaseClients(): void {
  serviceClient = null;
  anonClient = null;
}

// ---------------------------------------------------------------------------
// Legacy REST-style API (stable wrapper around supabase-js)
// ---------------------------------------------------------------------------

export type SupabaseFilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is'
  | 'in'
  | 'cs'
  | 'cd'
  | 'fts'
  | 'plfts'
  | 'phfts'
  | 'wfts';

export interface SupabaseFilter {
  column: string;
  op?: SupabaseFilterOp | string;
  value: string | number | boolean | null | Array<string | number | boolean | null>;
}

export interface SupabaseQueryOptions {
  select?: string;
  filters?: SupabaseFilter[];
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

function missingTableHint(table: string, schema: string): string {
  return `Missing table '${schema}.${table}'. Run the baseline migration: npx supabase db push (or apply supabase/migrations/20260417000000_baseline.sql in the Supabase SQL editor). Keep SUPABASE_SCHEMA/SUPABASE_STATE_SCHEMA='public'.`;
}

function parseInFilterValue(value: SupabaseFilter['value']): Array<string | number | boolean | null> {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Accept Postgrest-style "(a,b,c)" or plain "a,b,c"
    const trimmed = value.trim().replace(/^\(|\)$/g, '');
    return trimmed.length ? trimmed.split(',').map((v) => v.trim()) : [];
  }
  return [value];
}

// NB: we intentionally use `any` for the builder — supabase-js filter builders
// carry a deep generic signature that depends on the typed DB schema (which
// we don't yet generate). Narrowing happens at the call sites when they
// migrate to direct `getServiceClient().from(...)` usage.
function applyFilter(builder: any, filter: SupabaseFilter): any {
  const op = (filter.op || 'eq') as SupabaseFilterOp;
  const value = filter.value;
  switch (op) {
    case 'eq':
      return builder.eq(filter.column, value);
    case 'neq':
      return builder.neq(filter.column, value);
    case 'gt':
      return builder.gt(filter.column, value);
    case 'gte':
      return builder.gte(filter.column, value);
    case 'lt':
      return builder.lt(filter.column, value);
    case 'lte':
      return builder.lte(filter.column, value);
    case 'like':
      return builder.like(filter.column, String(value));
    case 'ilike':
      return builder.ilike(filter.column, String(value));
    case 'is':
      return builder.is(filter.column, value);
    case 'in':
      return builder.in(filter.column, parseInFilterValue(value));
    case 'cs':
      return builder.contains(filter.column, value);
    case 'cd':
      return builder.containedBy(filter.column, value);
    case 'fts':
      return builder.textSearch(filter.column, String(value));
    case 'plfts':
      return builder.textSearch(filter.column, String(value), { type: 'plain' });
    case 'phfts':
      return builder.textSearch(filter.column, String(value), { type: 'phrase' });
    case 'wfts':
      return builder.textSearch(filter.column, String(value), { type: 'websearch' });
    default:
      // Pass-through for exotic ops: "gt.5", etc. Fallback to eq.
      return builder.eq(filter.column, value);
  }
}

function handlePostgrestError(error: { code?: string; message?: string; details?: string; hint?: string } | null, table: string): void {
  if (!error) return;
  const config = readServiceConfig();
  const schema = config?.schema || 'public';
  const code = error.code || '';
  // PostgREST returns PGRST202 or HTTP 404 when table missing
  if (code === 'PGRST202' || code === '42P01' || /relation .* does not exist/i.test(error.message || '')) {
    throw new Error(missingTableHint(table, schema));
  }
  const detail = [error.message, error.details, error.hint]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join(' | ');
  throw new Error(`Supabase query failed (${table})${detail ? `: ${detail}` : ''}`);
}

/**
 * Legacy-compatible select. Uses service-role client.
 * New code should prefer `getServiceClient().from(table).select(...)` directly.
 */
export async function supabaseSelect<T>(table: string, options: SupabaseQueryOptions): Promise<T[]> {
  const client = getServiceClient();
  let query = client.from(table).select(options.select || '*');
  for (const filter of options.filters ?? []) {
    query = applyFilter(query, filter);
  }
  if (options.orderBy) {
    query = query.order(options.orderBy, { ascending: options.ascending !== false });
  }
  if (Number.isFinite(options.limit)) {
    const lim = Math.max(0, Math.floor(options.limit as number));
    const off = Math.max(0, Math.floor(options.offset || 0));
    query = query.range(off, off + lim - 1);
  } else if (Number.isFinite(options.offset)) {
    // rare: offset without limit — Supabase needs both; default to 1000
    const off = Math.max(0, Math.floor(options.offset as number));
    query = query.range(off, off + 999);
  }
  const { data, error } = await query;
  handlePostgrestError(error, table);
  return (data as T[]) ?? [];
}

export async function supabaseInsert<T>(table: string, payload: object | object[]): Promise<T[]> {
  const client = getServiceClient();
  const { data, error } = await client.from(table).insert(payload as never).select('*');
  handlePostgrestError(error, table);
  return (data as T[]) ?? [];
}

export async function supabaseUpdate<T>(
  table: string,
  payload: object,
  filters: SupabaseQueryOptions['filters']
): Promise<T[]> {
  const client = getServiceClient();
  let query = client.from(table).update(payload as never);
  for (const filter of filters ?? []) {
    query = applyFilter(query, filter);
  }
  const { data, error } = await query.select('*');
  handlePostgrestError(error, table);
  return (data as T[]) ?? [];
}

export async function supabaseDelete<T>(
  table: string,
  filters: SupabaseQueryOptions['filters'],
  returning = true
): Promise<T[]> {
  const client = getServiceClient();
  let query = client.from(table).delete();
  for (const filter of filters ?? []) {
    query = applyFilter(query, filter);
  }
  const final = returning ? query.select('*') : query;
  const { data, error } = await final;
  handlePostgrestError(error, table);
  return (data as T[]) ?? [];
}

// ---------------------------------------------------------------------------
// RPC helper (parity with previous hand-rolled REST layer)
// ---------------------------------------------------------------------------

export async function supabaseRpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const client = getServiceClient();
  const { data, error } = await client.rpc(fn, params);
  if (error) {
    throw new Error(`Supabase RPC '${fn}' failed: ${error.message || 'unknown error'}`);
  }
  return data as T;
}
