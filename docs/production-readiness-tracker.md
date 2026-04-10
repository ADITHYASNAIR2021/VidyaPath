# Production Readiness Tracker (Vercel, Security-First)

## Scope
- Target: 10-12 week rollout
- Scale target: up to 50 schools in phase 1
- Policy: official sources only for career/exam facts

## Status Key
- [x] Implemented in codebase
- [~] Partially implemented
- [ ] Pending

## Week 1-2 Foundation Hardening
- [x] Enforce `SESSION_SIGNING_SECRET` in production (no unsafe fallback).
- [x] Add stricter security headers and CSP in `next.config.js`.
- [x] Add explicit body-size parsing and payload guards for key API routes.
- [x] Add centralized request metadata support (`requestId`, client IP helpers).
- [x] Disable bootstrap-key admin auth in production unless explicitly enabled.
- [~] Centralized guard wrapper for all `app/api/**` routes (implemented in major auth/data-critical routes; full sweep pending).
- [~] Cookie hardening and session expiry metadata (implemented for core auth cookies; rotation/revocation policy still pending full rollout).

## Week 3-4 Login-to-Department Security
- [x] Student login throttling + lockout behavior via Supabase-backed throttle table.
- [x] Teacher login throttling + ambiguous identity denial path.
- [x] Admin login role enforcement + school-scoped checks.
- [x] Developer-only endpoint protection for data-quality APIs.
- [x] Auth/AI endpoint rate limiting using Supabase-backed throttling.
- [x] CSRF checks for cookie-auth mutation requests in middleware.
- [~] Auth matrix automated tests (comprehensive auth-role isolation suite added via `scripts/auth_role_isolation_suite.mjs`; environment-backed execution in staging/prod-like targets pending).

## Week 5-6 Database and Multi-Tenant Safety
- [x] Added operational tables: `audit_events`, `request_throttle`, `career_exam_catalog`, `career_track_catalog`, `chapter_career_map`, `data_quality_issues`, `api_idempotency`.
- [x] Added indexes/constraints and updated-at triggers for new operational tables.
- [x] Added data retention helper (`prune_operational_data`) for operational events.
- [~] Tenant isolation helper adoption across all writes (critical paths updated; broad query/helper sweep pending).
- [x] Idempotency key enforcement wired into publish/release/submit high-risk endpoints.
- [ ] Query performance verification and index tuning from production traces.

## Week 7-8 Dataset and Retrieval Upgrade
- [x] Subject normalization upgraded for Accountancy, Business Studies, Economics, and English Core.
- [x] Removed economics exclusion from index build path and updated inference.
- [x] HF URL generation and scraping mappings expanded for commerce subjects.
- [x] Regenerated `lib/hfPaperIndex.json` with commerce coverage.
- [x] Added context index verification gate for commerce key presence.
- [x] Added dataset quality check script (`scripts/check_dataset_quality.mjs`).
- [x] Added chapter-career map seeding pipeline (`scripts/seed_chapter_career_map.mjs`).
- [~] Serverless-safe retrieval fallback (partially improved; final no-subprocess runtime strategy pending full validation).

## Week 8-9 Career Module Expansion (Commerce-First)
- [x] Added versioned commerce track/exam/chapter mapping backend in `lib/career-catalog.ts`.
- [x] Added API endpoints:
  - `GET /api/career/tracks?stream=commerce`
  - `GET /api/career/exams?track=commerce`
  - `GET /api/career/map?chapterId=<id>`
- [x] Added official-source metadata fields (`sourceUrl`, `lastVerifiedAt`, `verificationOwner`).
- [x] Added commerce exam coverage for CA/CSEET/CMA/CUET/IPM/NISM references.
- [x] Updated career UI to include full Commerce stream (exams, roadmap, resources, portals).
- [x] Weekly automated source verification job + stale-link auto-flagging in admin/developer console (manual trigger endpoint + persisted issue flags + Vercel cron route).

## Week 9-10 Accessibility and UX Reliability
- [~] Keyboard-first and screen-reader remediation pass for student/teacher/admin/career pages (major interactive components and error/live regions upgraded; final exhaustive pass pending).
- [~] ARIA and focus-management audit with fixes (skip-link, main landmark focus, chat/live regions, button semantics improved; full page audit pending).
- [~] Contrast and reduced-motion pass (global reduced-motion + focus-visible baseline added; page-level contrast audit pending).
- [ ] Mobile + low-bandwidth optimization for chapter/dashboard/assignment critical paths.
- [ ] LocalStorage-to-server sync strategy for core student signals.

## Week 10-11 Observability and Vercel Readiness
- [x] Added structured server-event logging utility and integrated in key auth paths.
- [x] Added request IDs for major API responses and audit trails.
- [x] End-to-end alert routing for auth failures, brute-force, 5xx spikes, and token surges (developer observability summary + external webhook dispatch + secure cron route).
- [~] SLO instrumentation and reporting gates in CI/CD (runtime readiness gate shipped; latency percentile instrumentation/reporting pending).
- [x] Strict environment validation + deployment-blocking health checks at startup (`next.config.js` env validation + `/api/health/ready` + CI runtime readiness gate).

## Week 11-12 Release and Cutover
- [~] Full UAT matrix across student/teacher/admin/developer workflows (matrix documented in `docs/release/UAT_MATRIX.md`; execution sign-off pending).
- [~] Migration dry-run and rollback rehearsal (rehearsal checklist documented in `docs/release/ROLLBACK_REHEARSAL.md`; drill execution pending).
- [~] Vercel staged rollout (preview -> canary -> full) documented in `docs/release/CUTOVER_RUNBOOK.md`; live rollout pending.
- [x] Incident/cutover runbook handoff docs added (`docs/release/CUTOVER_RUNBOOK.md`, `docs/operations/OBSERVABILITY_SLO_ALERTS.md`).

## Near-Term Next Implementation Sprint
1. Execute `check:auth-suite` in preview/canary with real role credentials and capture pass report.
2. Complete final page-level accessibility audit (keyboard traps, SR reading order, contrast hotspots).
3. Add latency percentile capture/reporting (p95/p99) to satisfy SLO measurement gates.
4. Run UAT + rollback drill from new runbooks and attach sign-off artifacts.
