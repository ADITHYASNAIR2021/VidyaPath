# VidyaPath — Production Readiness Audit & Remediation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix login reliability issues, harden the RAG pipeline, close security gaps, and make VidyaPath production-ready for students.

**Architecture:** Next.js 16 App Router + Supabase (Auth + DB + pgvector) + Upstash Redis + Multi-provider AI (NVIDIA NIM, Gemini, Groq, Cerebras, Mistral) with dynamic model routing and BM25+RRF RAG retrieval.

**Tech Stack:** Next.js 16, React 18, TypeScript 5, Supabase, Upstash Redis, Zod 4, Zustand 5, Tailwind 3, Vitest 4, Framer Motion, SWR, KaTeX

**Key files audited:** `lib/auth/supabase-auth.ts`, `lib/auth/session.ts`, `lib/auth/guards.ts`, `app/api/auth/login/route.ts`, `app/login/page.tsx`, `app/api/student/session/login/route.ts`, `app/api/teacher/session/login/route.ts`, `lib/ai/question-rag.ts`, `lib/ai/model-routing.ts`, `lib/ai/generator.ts`, `lib/ai/context-retriever.ts`, `lib/security/rate-limit.ts`, `lib/security/csrf.ts`, `lib/config/env-validation.ts`, `next.config.js`, `instrumentation.ts`, `package.json`

---

## Category A: LOGIN SYSTEM — CRITICAL FIXES

### Founder's Note
> "The main issues come in the logging part." After full audit: 4 root causes found.

---

### Task A1: Stop unified login from killing the cascade on auth-failure responses

**Objective:** Fix the unified login router so a 401/403/404 from one role handler doesn't abort the cascade prematurely — only actual network errors or the last candidate should stop.

**Root Cause:** In `app/api/auth/login/route.ts:128-147`, the cascade loop checks `isRetryableCrossRoleFailure` which only allows retry on 429/409/500+. A 401 "Invalid credentials" from the first tried role returns immediately without trying other roles. If a student with roll `C10-ABC` is actually a teacher (email in the identifier), the student handler returns 401, the cascade stops, and the user sees "Invalid ID or password" — but the credentials work fine on the teacher portal.

**Files:**
- Modify: `app/api/auth/login/route.ts:128-148`

**Step 1: Write failing test**

Create `lib/__tests__/unified-login-cascade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Test: when first role returns 401, cascade continues to next role
// Test: when first role returns 403, cascade continues
// Test: when first role returns 429, cascade continues (already works)
// Test: when all roles return 401, final response is 401
// Test: when first role returns 200, cascade stops (already works)
// Test: developer role is never tried by cascade unless configured
```

**Step 2: Run to verify failure**

```bash
npm test -- lib/__tests__/unified-login-cascade.test.ts
```

**Step 3: Fix the cascade logic**

In `app/api/auth/login/route.ts`, change lines 139-147 from:

```typescript
const isRetryableCrossRoleFailure = response.status === 429 || response.status === 409 || response.status >= 500;
if (isRetryableCrossRoleFailure) {
```

To:

```typescript
// Don't abort the cascade on 401/403/404 — the next role handler may succeed.
// Only stop early on 500+ (server fault) or 429 (rate-limited — retrying another
// role would consume that bucket too).
const isHardStop = response.status === 429 || response.status >= 500;
const isRetryableCrossRoleFailure = !response.ok;
if (isRetryableCrossRoleFailure) {
  if (isHardStop) {
    if (!deferredErrorResponse) deferredErrorResponse = response;
    return response;
  }
  // 401/403/404: store and continue to next candidate
  if (!deferredErrorResponse) deferredErrorResponse = response;
  if (index < candidates.length - 1) continue;
  // Last candidate failed
  return deferredErrorResponse;
}
```

**Step 4: Run tests to verify pass**

```bash
npm test -- lib/__tests__/unified-login-cascade.test.ts
```

**Step 5: Commit**

```bash
git add app/api/auth/login/route.ts lib/__tests__/unified-login-cascade.test.ts
git commit -m "fix: unified login cascade continues on 401/403/404 instead of aborting"
```

---

### Task A2: Add login-failure diagnostics to help students debug

**Objective:** Make error messages actionable. When login fails, tell the user WHY — wrong password vs account not found vs not provisioned.

**Root Cause:** All catch blocks in student/teacher login handlers return a generic "Invalid credentials" message. A student with a valid roll number who types the wrong password gets the same error as one whose roll number doesn't exist. This causes support nightmares.

**Files:**
- Modify: `app/api/student/session/login/route.ts:250-264, 321-327, 418-424`
- Modify: `app/api/teacher/session/login/route.ts:160-166, 243-249`

**Step 1: Distinguish Supabase error messages**

In `lib/auth/supabase-auth.ts`, the `signInWithPassword` function already captures the Supabase error message (line 134: `json.msg`). For "Invalid login credentials" from Supabase, the problem is the password. For "Email not confirmed", the account needs verification.

In the student login handler, change the catch blocks to use the original error message:

```typescript
// Instead of:
return errorJson({
  requestId,
  errorCode: 'invalid-student-credentials',
  message: 'Invalid student credentials.',
  status: 401,
});

// Use:
return errorJson({
  requestId,
  errorCode: 'invalid-student-credentials',
  message: `Login failed: ${error instanceof Error ? error.message : 'Invalid student credentials.'}`,
  detail: process.env.NODE_ENV !== 'production' ? String(error) : undefined,
  status: 401,
});
```

**Step 2: Run auth smoke tests**

```bash
node scripts/auth_role_isolation_suite.mjs
```

**Step 3: Commit**

---

### Task A3: Fix stale cookie interference on login

**Objective:** Prevent old Supabase/session cookies from poisoning a fresh login attempt.

**Root Cause:** `clearSupabaseSessionCookies()` and `clearAllRoleSessionCookies()` are called AFTER `dataJson()` creates the response. The `NextResponse` object should handle this, but if any middleware reads cookies before the response is sent, stale values may be used. Additionally, the Supabase access token cookie uses `maxAge` calculated from `session.expires_in` (line 330-332 in supabase-auth.ts) — if the Supabase API returns a shorter expiry than expected, the cookie expires before the HMAC session does, causing silent logout.

**Files:**
- Modify: `app/api/student/session/login/route.ts:183-201`
- Modify: `app/api/teacher/session/login/route.ts:154-158`
- Modify: `lib/auth/supabase-auth.ts:330-332`

**Step 1: Align cookie lifetimes**

In `lib/auth/supabase-auth.ts:330-332`, set the Supabase access cookie maxAge to match the HMAC session (8 hours) rather than trusting Supabase's shorter default:

```typescript
const accessMaxAge = Math.max(session.expires_in, 8 * 60 * 60); // at least 8h
```

**Step 2: Clear cookies BEFORE building response**

In all login handlers, move the cookie-clear calls before `dataJson()`:

```typescript
// BEFORE:
const response = dataJson({ ... });
clearSupabaseSessionCookies(response);
clearAllRoleSessionCookies(response);

// AFTER:
const responseBase = NextResponse.next(); // or create response differently
// Use a pattern where cookies are set on the raw response
```

Actually, the current pattern works because `NextResponse` is mutable. The real issue is middleware. Let's add a middleware check instead.

**Step 3: Add response header to signal fresh login**

Add a response header `X-Auth-Fresh: 1` on all login success responses. This lets the client know it should clear any cached auth state.

---

### Task A4: Missing middleware.ts — implement or confirm location

**Objective:** Confirm whether `middleware.ts` exists and is working, or create it if missing.

**Finding:** `search_files` found no `middleware.ts` at `D:\VidyaPath\middleware.ts`. Next.js middleware is critical for route protection. Without it, unauthenticated users may access protected pages (they'll see loading state, but API calls will 401).

**Files:**
- Check: `D:\VidyaPath\src\middleware.ts` (Next.js src directory)
- Check: `D:\VidyaPath\middleware.js`
- Create: `D:\VidyaPath\middleware.ts` if absent

**Step 1: Confirm middleware status**

```bash
ls -la D:/VidyaPath/middleware.* D:/VidyaPath/src/middleware.*
```

**Step 2: If missing, create minimal middleware**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/student', '/teacher', '/admin', '/developer', '/parent', '/api-lab'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/student/session/login', '/api/teacher/session/login', '/api/admin/session/bootstrap', '/api/developer/session/login', '/api/parent/session/login', '/api/health'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public routes
  if (!PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();
  
  // Check for session cookies
  const hasStudentSession = request.cookies.has('vp_student_session');
  const hasTeacherSession = request.cookies.has('vp_teacher_session');
  const hasAdminSession = request.cookies.has('vp_admin_session');
  const hasDeveloperSession = request.cookies.has('vp_developer_session');
  const hasSupabaseToken = request.cookies.has('vp_sb_access_token');
  
  if (!hasStudentSession && !hasTeacherSession && !hasAdminSession && !hasDeveloperSession && !hasSupabaseToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('reason', 'auth-required');
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|sw.js).*)'],
};
```

**Step 3: Commit**

---

## Category B: RAG SYSTEM — RELIABILITY HARDENING

### Task B1: Add graceful degradation when context files are missing

**Objective:** Prevent RAG from silently returning empty results when `lib/context/chunks.jsonl` is missing or corrupt.

**Root Cause:** `context-retriever.ts` (1567 lines) loads chunks into memory. If the file doesn't exist or fails to parse, retrieval returns empty without logging an error. This means AI-generated content silently loses all grounding.

**Files:**
- Modify: `lib/ai/context-retriever.ts`
- Modify: `lib/ai/retrieval-index.ts`

**Step 1:** Add explicit file-existence checks with error logging at the top of the retrieval functions. If no context files exist, log a clear warning and return an empty context with a `degraded: true` flag so callers can decide whether to proceed.

**Step 2:** Add a `/api/health/rag-status` endpoint that returns:
- Whether context files exist
- Chunk count
- Last build timestamp
- Whether vectors are available

---

### Task B2: Add reranker fallback for when NVIDIA is down

**Objective:** The RAG pipeline has only one reranker: NVIDIA Nemotron. If NVIDIA API is down, retrieval quality degrades silently.

**Files:**
- Modify: `lib/ai/model-routing.ts`
- Modify: `lib/ai/context-retriever.ts`

**Step 1:** Add a simple TF-IDF or reciprocal-rank-fusion-only fallback when NVIDIA reranker is unavailable (no key or API down).

```typescript
function rerankWithFallback(query: string, passages: string[]): number[] {
  if (isUsableNvidiaApiKey(process.env.NVIDIA_API_KEY)) {
    try {
      return rerankWithNvidia({ query, passages });
    } catch {
      logger.warn('NVIDIA reranker failed, falling back to RRF-only');
    }
  }
  // Fallback: return BM25 scores as-is
  return passages.map((_, i) => i);
}
```

---

### Task B3: Enable pgvector by default with migration check

**Objective:** The code has pgvector support (`AI_ENABLE_PGVECTOR_RAG=1`) but it's off by default. The BM25 file-based retrieval won't scale past ~10K chunks.

**Files:**
- Modify: `instrumentation.ts:18-20`
- Modify: `.env.example` (if exists)

**Step 1:** In `instrumentation.ts`, change `shouldProbePgvector()` to enable by default in production:

```typescript
function shouldProbePgvector(): boolean {
  if (process.env.AI_ENABLE_PGVECTOR_RAG === '0') return false;
  return process.env.NODE_ENV === 'production' || process.env.AI_ENABLE_PGVECTOR_RAG === '1';
}
```

**Step 2:** The existing probe in instrumentation.ts:55-93 is solid — it checks if `document_embeddings` table exists and has rows.

---

## Category C: SECURITY HARDENING

### Task C1: Confirm production env safety switches

**Objective:** Ensure `SINGLE_ENV_MODE` and `AUTH_ENABLE_LEGACY_SESSIONS` are locked down in production.

**Status:** `env-validation.ts:112-121` already catches these in production (hard-fail). The middleware and guards already respect the toggle. This is well-implemented. **No code change needed** — just verify the env vars are set in deployment.

**Action:** In `.env.example` or deployment docs:
```
# Production: MUST be false
AUTH_ENABLE_LEGACY_SESSIONS=false
# Production: MUST be 0 (only for local dev convenience)
SINGLE_ENV_MODE=0
```

---

### Task C2: Add CORS configuration for production domain

**Objective:** The `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` headers in `next.config.js:52` will block legitimate cross-origin API access from mobile apps or subdomains.

**Files:**
- Modify: `next.config.js:52`

**Step 1:** Make COOP/CORP configurable:

```javascript
const coop = process.env.CROSS_ORIGIN_OPENER_POLICY || 'same-origin';
const corp = process.env.CROSS_ORIGIN_RESOURCE_POLICY || 'same-origin';
// ...
{ key: 'Cross-Origin-Opener-Policy', value: coop },
{ key: 'Cross-Origin-Resource-Policy', value: corp },
```

---

## Category D: DEVOPS & PRODUCTION READINESS

### Task D1: Create Dockerfile

**Objective:** The project has zero containerization. Create a production Dockerfile.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Step 1: Dockerfile**

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM base AS builder
COPY . .
RUN npm ci
RUN npm run build

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/context ./lib/context
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["npx", "next", "start"]
```

**Step 2: .dockerignore**

```
node_modules
.next
.git
.env.local
.env
*.md
tests
scripts
```

---

### Task D2: Create docker-compose for local Supabase + Redis

**Objective:** New developers need one command to run the full stack.

**Files:**
- Create: `docker-compose.yml`

---

### Task D3: Add health check endpoint

**Objective:** The project has no health check for load balancers/k8s probes.

**Files:**
- Create: `app/api/health/route.ts`

```typescript
export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    checks: {
      supabase: !!(process.env.NEXT_PUBLIC_SUPABASE_URL),
      redis: !!(process.env.UPSTASH_REDIS_REST_URL),
    },
  });
}
```

---

## Category E: QUICK WINS (low effort, high impact)

### Task E1: Hide internal errors in production login

**Objective:** Current error responses may leak Supabase URLs or internal paths in error messages. Sanitize in production.

**Files:**
- Modify: `app/login/page.tsx:133`

```typescript
if (!response.ok || !result) {
  const message = result?.message || 'Login failed.';
  setError(message);
  return;
}
```

Remove the `hint` and `error` fallback display for production.

### Task E2: Add login attempt rate-limiting feedback in the UI

**Objective:** When rate-limited, the UI shows a generic error. Show the retry-after time.

**Files:**
- Modify: `app/login/page.tsx`

### Task E3: Add npm `build:check` script for CI

```json
"build:check": "npm run typecheck && npm run lint:strict && npm run test"
```

---

## Summary: Issue Count by Severity

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 1 | Login cascade abort (A1) |
| HIGH | 4 | Missing middleware (A4), OOM-risk RAG (B1), reranker SPOF (B2), stale cookies (A3) |
| MEDIUM | 5 | pgvector disabled (B3), CORS (C2), no Dockerfile (D1), no health check (D3), error diagnostics (A2) |
| LOW | 3 | UI improvements (E1-E3) |

## Estimated Effort

~4-6 hours for all critical + high items. ~2 hours for remaining.
