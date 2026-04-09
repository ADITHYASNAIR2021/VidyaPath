# VidyaPath Operator Runbook

Last updated: 2026-04-09

This runbook is for release validation and production operations.

## 1) Pre-deploy prerequisites

1. Supabase env
- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

2. Auth/session env
- `SESSION_SIGNING_SECRET`
- `ADMIN_PORTAL_KEY`

3. AI env
- `GEMINI_API_KEY` (primary)
- `GROQ_API_KEY` (fallback)

## 2) Schema bootstrap order

1. Run SQL setup once:
- `scripts/sql/supabase_init.sql`

2. Optional state migration:
- `npm run migrate:supabase-state`
- `npm run migrate:teacher-normalized`

3. Verify key tables exist:
- `schools`
- `platform_user_roles`
- `teacher_profiles`
- `teacher_assignment_packs`
- `teacher_submissions`
- `student_profiles`
- `token_usage_events`
- `exam_sessions`
- `exam_violations`

## 3) Runtime health checks

## 3.1 Storage health
- Login teacher and open `/teacher`
- verify storage banner shows connected state
- if degraded in production, writes must fail with `503`

## 3.2 Auth health
- `GET /api/auth/session` before login should return `anonymous`
- login as each role and re-check role payload
- logout should clear role immediately

## 3.3 API smoke checks
Run from `/api-lab` or Postman with correct role session:
- `POST /api/chapter-pack`
- `POST /api/generate-quiz`
- `POST /api/teacher/assignment-pack`
- `POST /api/teacher/assignment-pack/publish`
- `POST /api/teacher/submission/grade`
- `POST /api/teacher/submission/release-results`
- `POST /api/exam/session/start`
- `POST /api/exam/session/heartbeat`
- `POST /api/exam/session/submit`

## 4) Critical flow validations

## 4.1 Assignment visibility
1. Teacher creates draft pack.
2. Student should not see draft.
3. Teacher publishes pack.
4. Student in matching class/section should see pack on chapter/practice route.

## 4.2 Grading and release
1. Student submits attempt.
2. Teacher grades per question.
3. Before release: student result should be hidden/pending.
4. After release: student result should appear.

## 4.3 Exam integrity
1. Start session.
2. Trigger heartbeat events.
3. Submit exam.
4. Verify integrity summary is attached to submission.

## 4.4 Scope enforcement
- teacher with limited scope must not mutate out-of-scope chapter packs.
- section mismatch should return `403` for student pack/exam access.

## 5) Security controls checklist

1. Route guards
- middleware enforced for `/teacher`, `/admin`, `/developer`, `/student`

2. API guards
- all teacher/admin/developer mutation endpoints use `lib/auth/guards.ts`
- exam heartbeat validates student session and ownership before writing

3. Persistence controls
- teacher/admin writes call `assertTeacherStorageWritable`
- production mode blocks silent local fallback for writes

4. Sensitive data
- HTTP-only session cookies used for role sessions
- student-facing pack response strips answer key when not teacher-authorized

## 6) Mobile stability checks

Check on small viewport (`<= 390px`) for:
- `/formulas`
  - filter chips horizontally scroll, no layout break
- `/equations`
  - class filters + subject selector remain usable without horizontal page overflow
- `/teacher`
  - header stacks correctly
  - grading row inputs are usable without column collapse
  - assessment table remains scrollable in its container

## 7) Known residuals to monitor

1. Rate limiting
- no route-level rate limiter is included in this repository by default.

2. CSP
- Content-Security-Policy header is not yet configured in `next.config.js`.

3. Build verification in this shell
- this environment does not have `node`/`npm` in PATH, so full local `next build` execution must be performed in a Node-enabled shell before release.