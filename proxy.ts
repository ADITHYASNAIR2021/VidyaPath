import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { csrfAllowedForMutation } from '@/lib/security/csrf';

/**
 * VidyaPath is a public, no-login study platform. The proxy only:
 *   1. Adds the nonce-based Content-Security-Policy.
 *   2. Rejects cross-site mutation requests to /api (CSRF).
 *   3. Redirects retired LMS/portal URLs to their public equivalents.
 */

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes)
    .map((value) => String.fromCharCode(value))
    .join('');
  return btoa(raw).replace(/=+$/g, '');
}

function buildContentSecurityPolicy(nonce: string): string {
  const connectSources = [
    "'self'",
    'https://api.groq.com',
    'https://generativelanguage.googleapis.com',
    'https://integrate.api.nvidia.com',
    'https://ai.api.nvidia.com',
    'https://huggingface.co',
    'https://plausible.io',
  ];
  const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL?.trim();
  if (umamiScriptUrl) {
    try {
      connectSources.push(new URL(umamiScriptUrl).origin);
    } catch {
      // Ignore invalid optional analytics origins.
    }
  }

  const allowUnsafeInlineStyle =
    process.env.NODE_ENV !== 'production' || process.env.CSP_ALLOW_UNSAFE_INLINE_STYLE === '1';
  const styleElemDirective = allowUnsafeInlineStyle
    ? "style-src-elem 'self' 'unsafe-inline'"
    : "style-src-elem 'self'";
  const styleAttrDirective = allowUnsafeInlineStyle
    ? "style-src-attr 'unsafe-inline'"
    : "style-src-attr 'none'";
  const scriptEvalDirective = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self'",
    styleElemDirective,
    styleAttrDirective,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptEvalDirective} https: http:`,
    `connect-src ${connectSources.join(' ')}`,
    'upgrade-insecure-requests',
  ].join('; ');
}

function attachSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce));
  response.headers.set('x-nonce', nonce);
  return response;
}

function nextWithSecurityHeaders(request: NextRequest, nonce: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  return attachSecurityHeaders(response, nonce);
}

/** Old portal URLs → public pages. Permanent so bookmarks and search results update. */
const RETIRED_ROUTE_REDIRECTS: Array<{ prefix: string; target: string }> = [
  { prefix: '/student/ai-tools', target: '/ai-tools' },
  { prefix: '/student/revision', target: '/revision' },
  { prefix: '/student/notes', target: '/notes' },
  { prefix: '/student/srs', target: '/review' },
  { prefix: '/student/achievements', target: '/dashboard' },
  { prefix: '/student', target: '/dashboard' },
  { prefix: '/teacher', target: '/chapters' },
  { prefix: '/admin', target: '/' },
  { prefix: '/parent', target: '/' },
  { prefix: '/api-lab', target: '/' },
  { prefix: '/login', target: '/chapters' },
  { prefix: '/forgot-password', target: '/' },
  { prefix: '/reset-password', target: '/' },
  { prefix: '/affiliate-your-school', target: '/' },
  { prefix: '/notifications', target: '/dashboard' },
  { prefix: '/practice/assignment', target: '/ai-tools' },
  { prefix: '/exam/assignment', target: '/mock-exam' },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function resolveRetiredRedirect(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  if (matchesPrefix(pathname, '/helper')) {
    const url = request.nextUrl.clone();
    url.pathname = '/chapters';
    url.search = '';
    if (pathname.startsWith('/helper/class-10')) url.searchParams.set('class', '10');
    if (pathname.startsWith('/helper/class-12')) url.searchParams.set('class', '12');
    return url;
  }

  for (const { prefix, target } of RETIRED_ROUTE_REDIRECTS) {
    if (matchesPrefix(pathname, prefix)) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      url.search = '';
      return url;
    }
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = createNonce();
  const method = request.method.toUpperCase();

  if (pathname.startsWith('/api/')) {
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (isMutation && !csrfAllowedForMutation(request)) {
      return attachSecurityHeaders(
        NextResponse.json(
          {
            ok: false,
            errorCode: 'csrf-validation-failed',
            message: 'CSRF validation failed for mutation request.',
          },
          { status: 403 }
        ),
        nonce
      );
    }
    return nextWithSecurityHeaders(request, nonce);
  }

  const redirectUrl = resolveRetiredRedirect(request);
  if (redirectUrl) {
    return attachSecurityHeaders(NextResponse.redirect(redirectUrl, 308), nonce);
  }

  return nextWithSecurityHeaders(request, nonce);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon-16.png|favicon-32.png|icon.png|og-image.png|manifest.json|robots.txt|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|map|txt|xml)$).*)',
  ],
};
