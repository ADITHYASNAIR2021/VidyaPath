# VidyaPath Remediation Status (2026-04-17)

This is a strict implementation status for the codebase issues list raised in review.

## Completed in code

- `SESSION_SIGNING_SECRET` fallback removed from runtime session signing paths.
- Middleware no longer trusts `vp_role_hint` for role authorization.
- CSRF checks now include explicit origin pinning and `sec-fetch-site` validation.
- Rate limiter fail-open behavior is now configurable and defaults fail-closed in production.
- Atomic Postgres rate-limit RPC added (`check_rate_limit`) to reduce race conditions.
- Input validation strengthened on core auth routes with Zod schemas.
- Health readiness endpoint now performs a real Supabase DB ping.
- CI workflow added (`typecheck`, `lint`, security guard assertions, db lint command).
- `vercel.json` populated with region and API security/cache headers.
- `xlsx` dependency removed; roster import now supports CSV/TSV only.
- RLS baseline migration added with role/membership policies for core tables.
- Admin mutation audit trigger migration added for core admin-managed tables.
- Push subscription and student announcement-read writes switched to per-request user JWT clients.

## Partially complete

- Service-role database usage: partially reduced, but many legacy server paths still use service-role wrappers.
- Dual-session model: hardened, but still coexists (legacy HMAC + Supabase JWT) for backward compatibility.
- Route boundary validation: improved on high-risk auth/engagement endpoints, not yet strict on every API route.
- Admin mutation audit visibility: DB trigger path added; not yet fully surfaced in all developer/admin dashboards.

## Not yet complete

- Full RLS policy coverage for every table and every role path.
- Full migration from service-role wrappers to request-scoped user JWT/anon client in all routes.
- Splitting all monolithic DB modules (for example `lib/teacher-admin-db.ts`) into bounded contexts.
- End-to-end app test suite (Vitest/Playwright) with auth matrix, RBAC, and SQL policy regression tests.
- Streaming rollout for all AI endpoints and complete per-school/user token cost caps.
- Full i18n, accessibility audit, realtime classroom, SIS integrations, billing, and feature roadmap items.
