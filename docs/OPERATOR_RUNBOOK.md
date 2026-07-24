# VidyaPath Operator Runbook

Last updated: 2026-07-24

Use this runbook for release validation, school onboarding, and production incident checks.

## 1. Production prerequisites

### Runtime

- Node.js 20.9 or newer
- A Supabase project with all migrations applied
- At least one configured AI provider
- Redis/Upstash is strongly recommended for distributed rate limiting

### Required environment

- `SESSION_SIGNING_SECRET` — unique random value, at least 32 characters
- `TEACHER_PORTAL_KEY`
- `NEXT_PUBLIC_APP_URL` — canonical HTTPS application URL
- `DEVELOPER_USERNAME`
- `DEVELOPER_PASSWORD`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`

Keep `SINGLE_ENV_MODE=0` and `AUTH_ENABLE_LEGACY_SESSIONS=false` in production. Set
`STRICT_ENV_VALIDATION=1` in CI and production builds.

## 2. Database and data setup

1. Apply versioned migrations:

   ```bash
   npm run db:push
   npm run db:lint
   ```

2. Verify the normalized teacher/student tables:

   ```bash
   npm run check:supabase-teacher
   ```

3. For a new non-production project only, seed mock data:

   ```bash
   npm run db:reset-full
   ```

4. If pgvector retrieval is enabled, apply the embeddings migration and ingest:

   ```bash
   node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32
   ```

Never run reset or seed commands against a populated production project.

## 3. Release gates

Run these before every release:

```bash
npm ci
npm run typecheck
npm run lint:strict
npm run test
npm run test:security-guards
npm run check:route-links
npm run build
```

With the built app running, execute:

```bash
npm run check:auth-matrix
npm run check:auth-suite
```

The full auth suite accepts `AUTH_SUITE_*` credentials or pre-issued role cookies. Use dedicated
test accounts, never production user credentials.

## 4. Runtime health

- `GET /api/health` checks process, configuration presence, Redis configuration, and RAG artifact status.
- `GET /api/health/ready` performs the database readiness check and must return `200` before traffic is routed.
- `/developer/observability` is the authenticated operational view.
- `/developer/career-health` and developer data-quality APIs cover career-source and RAG quality.

The Docker image has a health check. A release must wait for Docker health status `healthy`; a running
container is not sufficient.

## 5. Role acceptance checklist

### Student

1. Sign in with a school-issued login ID.
2. Complete forced password change when required.
3. Verify Today, chapters, papers, notes, bookmarks, revision, SRS, and AI study tools.
4. Verify assignments are scoped to the correct class/section.
5. Submit an assignment and confirm unreleased results remain hidden.
6. Verify released grades, attendance, timetable, resources, announcements, and calendar.
7. Confirm the student session cannot access teacher, admin, or developer APIs.

### Teacher

1. Sign in and complete first-login password change when required.
2. Verify assigned class/subject scopes.
3. Create, review, approve, publish, regenerate, archive, and grade an assignment pack.
4. Verify attendance, gradebook, class roster, question bank, resources, calendar, and weekly plans.
5. Confirm out-of-scope classes, sections, subjects, and student records are denied.
6. Confirm the teacher session cannot access admin or developer APIs.

### Admin

1. Sign in through the unified login.
2. Verify school onboarding state, teachers, students, class sections, scopes, and roster import.
3. Verify announcements, events, timetable, gradebook, analytics, interventions, recovery, and settings.
4. Export a report and verify it contains only the active school.
5. Confirm the admin session cannot cross into developer-only APIs unless an explicit role switch is available.

### Developer

1. Sign in with a dedicated developer account.
2. Verify school list/detail, affiliate queue, audit log, token usage, model health, data quality, and observability.
3. Confirm destructive or school-changing operations create audit events.
4. Confirm the developer session is denied from student, teacher, and school-admin APIs.

### Parent

1. Sign in using the linked phone/PIN.
2. Verify only the linked student’s attendance, released grades, events, resources, announcements, and assignments.
3. Confirm a parent session cannot access any other role API.

## 6. Critical cross-role flows

### Assignment lifecycle

1. Teacher creates a draft.
2. Student cannot see the draft.
3. Teacher approves and publishes it.
4. Only matching students can see and submit it.
5. Teacher grades the submission.
6. Student cannot see results before release and can see them after release.

### Roster and scope

1. Admin imports a roster in preview mode.
2. Resolve validation errors before commit.
3. Assign teacher scopes and class-teacher tags.
4. Verify section and subject boundaries from both teacher and student accounts.

### Password recovery

1. Request a reset from `/forgot-password` with a teacher/admin email.
2. Confirm the response does not disclose whether the email exists.
3. Open the emailed `/reset-password` recovery link.
4. Set a policy-compliant password and sign in again.
5. Student password resets remain an admin/teacher-managed workflow.

## 7. Security checks

- All role sessions use signed, HTTP-only cookies.
- All API mutations pass the global CSRF origin policy.
- Login and recovery endpoints use distributed rate limiting and fail closed in production.
- Production startup rejects missing required environment variables, short signing secrets, legacy sessions,
  and single-environment admin/developer mode.
- Student-facing assignment payloads must never include answer keys before authorization.
- Never expose service-role, AI-provider, Sentry auth, Redis, or VAPID private keys to browser code.

## 8. RAG operations

Build and verify local artifacts:

```bash
npm run build:rag
npm run verify:context
npm run check:data-quality
npm run eval:rag
```

For production, compress and upload artifacts, then set `CONTEXT_CDN_URL`:

```bash
npm run compress:context
npm run upload:context
```

The application can fall back to local artifacts, but large context files should not be bundled into a
serverless deployment.

## 9. Incident and rollback

1. Check `/api/health`, `/api/health/ready`, and `/developer/observability`.
2. Correlate failures using the response `requestId`.
3. Check the developer audit log before changing school or auth data.
4. Roll back to the last known-good immutable image/version.
5. Apply database corrections through versioned migrations; do not edit production tables ad hoc.
6. After recovery, rerun the role acceptance checks affected by the incident.
