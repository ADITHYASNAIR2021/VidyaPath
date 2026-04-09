interface SupabaseStateRecord<T> {
  state_key: string;
  state_json: T;
  updated_at?: string;
}

let warnedMissingServiceRoleKey = false;

function getSupabaseConfig():
  | {
      url: string;
      key: string;
      table: string;
      schema: string;
    }
  | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  const table = process.env.SUPABASE_STATE_TABLE?.trim() || 'app_state';
  const schema = process.env.SUPABASE_STATE_SCHEMA?.trim() || 'public';
  if (url && !key && !warnedMissingServiceRoleKey) {
    warnedMissingServiceRoleKey = true;
    console.warn(
      '[supabase-state] SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is missing. Remote persistence disabled; using local fallback.'
    );
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key, table, schema };
}

function buildHeaders(key: string, schema: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
  };
}

export function isSupabaseStateEnabled(): boolean {
  return !!getSupabaseConfig();
}

export async function readStateFromSupabase<T>(stateKey: string): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  const url = `${config.url}/rest/v1/${encodeURIComponent(config.table)}?state_key=eq.${encodeURIComponent(
    stateKey
  )}&select=state_json&limit=1`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...buildHeaders(config.key, config.schema),
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Array<SupabaseStateRecord<T>>;
    if (!Array.isArray(data) || data.length === 0) return null;
    return (data[0]?.state_json ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function writeStateToSupabase<T>(stateKey: string, state: T): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  const url = `${config.url}/rest/v1/${encodeURIComponent(config.table)}`;
  const payload: Array<SupabaseStateRecord<T>> = [
    {
      state_key: stateKey,
      state_json: state,
      updated_at: new Date().toISOString(),
    },
  ];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...buildHeaders(config.key, config.schema),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}
