interface SupabaseServiceConfig {
  url: string;
  key: string;
  schema: string;
}

function readServiceConfig(): SupabaseServiceConfig | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !key) return null;
  return { url, key, schema };
}

function buildHeaders(config: SupabaseServiceConfig): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Content-Type': 'application/json',
    'Accept-Profile': config.schema,
    'Content-Profile': config.schema,
  };
}

export function isSupabaseServiceConfigured(): boolean {
  return !!readServiceConfig();
}

export interface SupabaseQueryOptions {
  select?: string;
  filters?: Array<{ column: string; op?: string; value: string | number | boolean | null }>;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}

function buildQueryString(options: SupabaseQueryOptions): string {
  const params = new URLSearchParams();
  if (options.select) params.set('select', options.select);
  if (options.orderBy) params.set('order', `${options.orderBy}.${options.ascending === false ? 'desc' : 'asc'}`);
  if (Number.isFinite(options.limit)) params.set('limit', String(options.limit));
  for (const filter of options.filters ?? []) {
    const op = filter.op || 'eq';
    const encodedValue =
      filter.value === null
        ? 'null'
        : typeof filter.value === 'boolean'
          ? String(filter.value)
          : String(filter.value);
    params.set(filter.column, `${op}.${encodedValue}`);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function callSupabase<T>(
  path: string,
  init: RequestInit,
  opts?: { allowNoConfig?: boolean }
): Promise<{ data: T; status: number; ok: boolean }> {
  const config = readServiceConfig();
  if (!config) {
    if (opts?.allowNoConfig) {
      return { data: null as T, status: 200, ok: false };
    }
    throw new Error('Supabase service configuration missing.');
  }

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...buildHeaders(config),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  let parsed: T = null as T;
  if (text) {
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = null as T;
    }
  }
  return {
    data: parsed,
    status: response.status,
    ok: response.ok,
  };
}

function extractSupabaseErrorMessage(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const payload = value as Record<string, unknown>;
  const pieces = [payload.message, payload.details, payload.hint]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return pieces.join(' | ');
}

function missingTableHint(table: string, schema: string): string {
  return `Missing table '${schema}.${table}'. Run scripts/sql/supabase_init.sql in Supabase SQL editor and keep SUPABASE_SCHEMA/SUPABASE_STATE_SCHEMA='public'.`;
}

export async function supabaseSelect<T>(table: string, options: SupabaseQueryOptions): Promise<T[]> {
  const schema = readServiceConfig()?.schema || 'public';
  const query = buildQueryString(options);
  const { data, ok, status } = await callSupabase<T[]>(`${encodeURIComponent(table)}${query}`, {
    method: 'GET',
    headers: {
      Prefer: 'count=exact',
    },
  });
  if (!ok) {
    const detail = extractSupabaseErrorMessage(data);
    if (status === 404) throw new Error(missingTableHint(table, schema));
    throw new Error(`Supabase select failed (${table}): ${status}${detail ? ` | ${detail}` : ''}`);
  }
  return Array.isArray(data) ? data : [];
}

export async function supabaseInsert<T>(table: string, payload: object | object[]): Promise<T[]> {
  const schema = readServiceConfig()?.schema || 'public';
  const { data, ok, status } = await callSupabase<T[]>(`${encodeURIComponent(table)}?select=*`, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!ok) {
    const detail = extractSupabaseErrorMessage(data);
    if (status === 404) throw new Error(missingTableHint(table, schema));
    throw new Error(`Supabase insert failed (${table}): ${status}${detail ? ` | ${detail}` : ''}`);
  }
  return Array.isArray(data) ? data : [];
}

export async function supabaseUpdate<T>(
  table: string,
  payload: object,
  filters: SupabaseQueryOptions['filters']
): Promise<T[]> {
  const schema = readServiceConfig()?.schema || 'public';
  const query = buildQueryString({ filters, select: '*' });
  const { data, ok, status } = await callSupabase<T[]>(`${encodeURIComponent(table)}${query}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!ok) {
    const detail = extractSupabaseErrorMessage(data);
    if (status === 404) throw new Error(missingTableHint(table, schema));
    throw new Error(`Supabase update failed (${table}): ${status}${detail ? ` | ${detail}` : ''}`);
  }
  return Array.isArray(data) ? data : [];
}

export async function supabaseDelete<T>(
  table: string,
  filters: SupabaseQueryOptions['filters'],
  returning = true
): Promise<T[]> {
  const schema = readServiceConfig()?.schema || 'public';
  const query = buildQueryString({ filters, select: returning ? '*' : undefined });
  const { data, ok, status } = await callSupabase<T[]>(`${encodeURIComponent(table)}${query}`, {
    method: 'DELETE',
    headers: {
      Prefer: returning ? 'return=representation' : 'return=minimal',
    },
  });
  if (!ok) {
    const detail = extractSupabaseErrorMessage(data);
    if (status === 404) throw new Error(missingTableHint(table, schema));
    throw new Error(`Supabase delete failed (${table}): ${status}${detail ? ` | ${detail}` : ''}`);
  }
  return Array.isArray(data) ? data : [];
}
