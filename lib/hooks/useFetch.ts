/**
 * Typed SWR hook for JSON API endpoints.
 *
 * Features:
 * - Generic type param for response shape
 * - Automatic de-duplication (SWR default)
 * - Auto-retry on focus and reconnect disabled for write-heavy routes
 * - Optional `condition` to pause fetching (e.g. wait for auth)
 */
import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';

// ── Fetcher ───────────────────────────────────────────────────────────────

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(
      (body as Record<string, string>).message ?? `HTTP ${res.status}`,
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return res.json() as T;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface UseFetchResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<T>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Fetch and cache a JSON endpoint.
 *
 * @param url  Full path (e.g. `/api/teacher/assignment-pack?id=xyz`).
 *             Pass `null` to suspend fetching.
 * @param options  SWR config overrides.
 *
 * @example
 * const { data, error, isLoading } = useFetch<{ pack: AssignmentPack }>(
 *   `/api/teacher/assignment-pack?id=${packId}`,
 * );
 */
export function useFetch<T>(
  url: string | null,
  options?: SWRConfiguration<T, Error>,
): UseFetchResult<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T, Error>(
    url,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      ...options,
    },
  );

  return { data, error, isLoading, isValidating, mutate };
}

/** SWR hook variant that paginates via cursor. */
export function useFetchList<T>(
  basePath: string | null,
  params?: Record<string, string | number | boolean | undefined>,
  options?: SWRConfiguration<T, Error>,
): UseFetchResult<T> {
  const url = basePath
    ? `${basePath}${buildQueryString(params)}`
    : null;
  return useFetch<T>(url, options);
}

function buildQueryString(
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return '';
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}
