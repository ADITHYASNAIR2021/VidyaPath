# UAT Matrix (Production Readiness)

## Scope
- Environments: Vercel preview, canary, production.
- Roles: student, teacher, admin, developer.
- Prerequisites: Supabase migrations applied, `SESSION_SIGNING_SECRET` set, `CRON_SECRET` set, observability webhook configured.

## Student Flow
1. Login with valid school-scoped credentials.
2. Open `/chapters`, filter by class and subject, open one chapter.
3. Run AI tutor, generate quiz, generate flashcards.
4. Start assignment/exam session, submit attempt, verify success envelope includes `requestId`.
5. Logout and verify protected routes redirect/deny.

## Teacher Flow
1. Login and verify teacher profile + scopes load.
2. Create assignment pack from chapter/question bank.
3. Approve/publish pack and verify idempotency behavior.
4. Grade submissions and release results.
5. Confirm analytics/summary views load for published pack.

## Admin Flow
1. Login with school-scoped admin identity (bootstrap path disabled in production).
2. Create/update teacher and student records.
3. Add/remove teacher scopes.
4. Reset teacher PIN and verify audit event creation.
5. Validate denied access for non-admin protected actions.

## Developer Flow
1. Login and open developer console.
2. Validate schools, usage, audit, and observability summary panels.
3. Run career source verification.
4. Trigger observability external dispatch and verify result state.

## Security Isolation Checks
1. Unauthenticated requests to protected API return `401`.
2. Student session cannot call teacher/admin/developer APIs.
3. Teacher session cannot call admin/developer APIs.
4. Admin session cannot call developer-only APIs.
5. Cron routes require `x-vercel-cron` + `Authorization: Bearer <CRON_SECRET>`.

## Acceptance Criteria
- All flows pass without critical/blocker defects.
- No cross-school data leak observed.
- No unauthorized cross-role access observed.
- Error envelope shape remains `{ ok:false, errorCode, message, requestId }`.
- Success envelope shape remains `{ ok:true, requestId, data }`.
