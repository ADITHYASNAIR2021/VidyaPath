const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isMutationMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function normalizeOrigin(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(req: Request): string | null {
  return normalizeOrigin(req.url);
}

function getPinnedOrigins(req: Request): Set<string> {
  const pinned = new Set<string>();
  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin) pinned.add(requestOrigin);
  const canonical = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (canonical) pinned.add(canonical);
  const fromEnv = (process.env.CSRF_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOrigin(item.trim()))
    .filter((item): item is string => !!item);
  for (const origin of fromEnv) pinned.add(origin);
  return pinned;
}

export function isSameOriginRequest(req: Request): boolean {
  const origin = normalizeOrigin(req.headers.get('origin')?.trim());
  if (!origin) return false;
  return getPinnedOrigins(req).has(origin);
}

export function isTrustedReferer(req: Request): boolean {
  const refererOrigin = normalizeOrigin(req.headers.get('referer')?.trim());
  if (!refererOrigin) return false;
  return getPinnedOrigins(req).has(refererOrigin);
}

function hasSafeFetchSite(req: Request): boolean {
  const fetchSite = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (!fetchSite) return true;
  return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}

export function hasCookieHeader(req: Request): boolean {
  const cookie = req.headers.get('cookie');
  return !!cookie && cookie.trim().length > 0;
}

export function csrfAllowedForMutation(req: Request): boolean {
  if (!isMutationMethod(req.method)) return true;
  if (!hasSafeFetchSite(req)) return false;
  if (isSameOriginRequest(req) || isTrustedReferer(req)) return true;

  // For non-browser service calls (e.g. backend cron), allow only when no browser-origin signals exist.
  if (!hasCookieHeader(req)) {
    const hasOrigin = !!normalizeOrigin(req.headers.get('origin')?.trim());
    const hasReferer = !!normalizeOrigin(req.headers.get('referer')?.trim());
    const fetchSite = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    return !hasOrigin && !hasReferer && (!fetchSite || fetchSite === 'none');
  }

  return false;
}
