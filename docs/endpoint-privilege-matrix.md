# VidyaPath Endpoint Privilege Matrix

Last updated: 2026-04-09

## Legend
- `public`: no session required
- `interactive-auth`: any authenticated role (`student|teacher|admin|developer`)
- role-specific: only that role (or higher where explicitly allowed)

## Public endpoints
- `GET /api/auth/session`
- `POST /api/analytics/track`
- login/bootstrap endpoints:
  - `POST /api/student/session/login`
  - `POST /api/teacher/session/login`
  - `POST /api/admin/session/bootstrap`

## Interactive-auth endpoints (any logged-in role)
- `POST /api/ai-tutor`
- `POST /api/generate-quiz`
- `POST /api/generate-flashcards`
- `POST /api/image-solve`
- `POST /api/chapter-pack`
- `POST /api/chapter-drill`
- `POST /api/chapter-diagnose`
- `POST /api/chapter-remediate`
- `POST /api/context-pack`
- `POST /api/adaptive-test`
- `POST /api/revision-plan`
- `POST /api/paper-evaluate`

## Student endpoints
- `POST /api/student/session/logout`
- `GET /api/student/session/me`
- `GET /api/student/submission-results`
- `POST /api/teacher/submission`
- `GET /api/teacher/assignment-pack?id=...` (published only, with class/section checks)
- `POST /api/exam/session/start`
- `POST /api/exam/session/heartbeat`
- `POST /api/exam/session/submit`

## Teacher endpoints
- `POST /api/teacher/session/logout`
- `GET /api/teacher/session/me`
- `GET /api/teacher` (private config branch)
- `POST /api/teacher`
- `POST /api/teacher/assignment-pack`
- `POST /api/teacher/assignment-pack/regenerate`
- `POST /api/teacher/assignment-pack/approve`
- `POST /api/teacher/assignment-pack/publish`
- `POST /api/teacher/assignment-pack/archive`
- `POST /api/teacher/question-bank/item`
- `GET /api/teacher/question-bank/item`
- `PATCH /api/teacher/question-bank/item/[id]`
- `DELETE /api/teacher/question-bank/item/[id]`
- `POST /api/teacher/submission/grade`
- `POST /api/teacher/submission/release-results`
- `GET /api/teacher/submission-summary`
- `POST /api/integrations/sheets/import`

## Admin endpoints
- `POST /api/admin/session/logout`
- `GET /api/admin/session/me`
- `GET /api/admin/overview`
- `GET /api/admin/teachers`
- `POST /api/admin/teachers`
- `PATCH /api/admin/teachers/[id]`
- `POST /api/admin/teachers/[id]/reset-pin`
- `POST /api/admin/teachers/[id]/scopes`
- `DELETE /api/admin/teachers/[id]/scopes/[scopeId]`
- `GET /api/admin/students`
- `POST /api/admin/students`
- `PATCH /api/admin/students/[id]`
- `GET /api/integrations/sheets/status`
- `POST /api/integrations/sheets/export`

## Developer endpoints
- `GET /api/developer/schools`
- `POST /api/developer/schools`
- `PATCH /api/developer/schools/[id]`
- `GET /api/developer/schools/[id]/overview`
- `GET /api/developer/usage/tokens`
- `GET /api/developer/audit`

## Public teacher feed (chapter page)
- `GET /api/teacher?chapterId=...&classLevel=...&subject=...&section?...`
- behavior:
  - no teacher session: returns merged scope-safe public feed
  - with teacher session: returns private dashboard payload

## Enforcement layers
1. `middleware.ts` blocks protected route prefixes.
2. API routes re-check role via `lib/auth/guards.ts`.
3. tenant/scope checks are enforced in `lib/teacher-admin-db.ts` for pack/chapter mutations.