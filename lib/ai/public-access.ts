import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/http/api-response';
import { buildRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';

/**
 * VidyaPath is open to every student with no login. AI endpoints are protected by:
 *   - a per-route per-minute limit (in each route, keyed by client IP)
 *   - this per-IP daily cap across all AI endpoints
 *   - the global daily token budget (lib/ai/token-budget.ts)
 */
export interface PublicAiContext {
  clientIp: string;
}

function dailyRequestsPerIp(): number {
  const parsed = Number(process.env.AI_PUBLIC_DAILY_REQUESTS_PER_IP);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 120;
}

export async function requirePublicAiAccess(
  req: Request
): Promise<{ context: PublicAiContext; response: null } | { context: null; response: NextResponse }> {
  const clientIp = getClientIp(req);
  const daily = await checkRateLimit({
    key: buildRateLimitKey('ai:daily', [clientIp]),
    windowSeconds: 24 * 60 * 60,
    maxRequests: dailyRequestsPerIp(),
    blockSeconds: 60 * 60,
  });

  if (!daily.allowed) {
    return {
      context: null,
      response: NextResponse.json(
        {
          ok: false,
          errorCode: 'daily-ai-limit',
          message: "You've used today's AI quota. Chapters, notes and papers are still available — AI resets tomorrow.",
          hint: `Retry after ${daily.retryAfterSeconds}s`,
        },
        { status: 429, headers: { 'Retry-After': String(daily.retryAfterSeconds) } }
      ),
    };
  }

  return { context: { clientIp }, response: null };
}
