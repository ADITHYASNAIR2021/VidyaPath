const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isMutationMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin')?.trim();
  if (!origin) return false;
  try {
    const requestUrl = new URL(req.url);
    const originUrl = new URL(origin);
    return requestUrl.origin === originUrl.origin;
  } catch {
    return false;
  }
}

export function isTrustedReferer(req: Request): boolean {
  const referer = req.headers.get('referer')?.trim();
  if (!referer) return false;
  try {
    const requestUrl = new URL(req.url);
    const refererUrl = new URL(referer);
    return requestUrl.origin === refererUrl.origin;
  } catch {
    return false;
  }
}

export function hasCookieHeader(req: Request): boolean {
  const cookie = req.headers.get('cookie');
  return !!cookie && cookie.trim().length > 0;
}

export function csrfAllowedForMutation(req: Request): boolean {
  if (!isMutationMethod(req.method)) return true;
  if (!hasCookieHeader(req)) return true;
  return isSameOriginRequest(req) || isTrustedReferer(req);
}
