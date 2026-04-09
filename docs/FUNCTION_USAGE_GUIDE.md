# VidyaPath Function Usage Guide (User + Developer)

Last updated: 2026-04-09

This guide explains every implemented function from small UX helpers to full assessment workflows.

## 1) Roles and Access

## Roles
- `anonymous`: public browsing only
- `student`: learning + assignments + exam mode + personal results
- `teacher`: chapter controls + assignment lifecycle + grading + release
- `admin`: teacher/student management + school analytics
- `developer`: cross-school observability and provisioning

## Login routes
- Student: `/student/login`
- Teacher: `/teacher/login`
- Admin: `/admin/login`
- Developer: `/admin/login` (developer-role identity)

## Session API to check current role
- `GET /api/auth/session`

Example response:
```json
{
  "role": "teacher",
  "authenticated": true,
  "schoolId": "...",
  "availableRoles": ["teacher"]
}
```

## 2) Feature-by-Feature Usage

## 2.1 Student learning functions

## AI Tutor
- UI: chapter page chat + floating AI button
- API: `POST /api/ai-tutor`
- Purpose: chapter-aware board-focused explanation

Minimal request:
```json
{
  "messages": [{ "role": "user", "content": "Explain Nernst equation with one solved example." }],
  "chapterContext": {
    "chapterId": "c12-chem-2",
    "title": "Electrochemistry",
    "subject": "Chemistry",
    "classLevel": 12,
    "topics": ["Nernst Equation", "Cell Potential"]
  }
}
```

## Quiz generation
- UI: `QuizEngine`
- API: `POST /api/generate-quiz`
- Purpose: variable chapter MCQ sets

Example request:
```json
{
  "chapterId": "c12-chem-2",
  "questionCount": 10,
  "difficulty": "mixed"
}
```

## Flashcards generation
- UI: `FlashcardDeck`
- API: `POST /api/generate-flashcards`
- Purpose: chapter-focused recall cards

Example request:
```json
{
  "chapterId": "c12-chem-2",
  "subject": "Chemistry",
  "chapterTitle": "Electrochemistry"
}
```

## Image question solver
- UI: `ImageQuestionSolver`
- API: `POST /api/image-solve`
- Purpose: solve textbook/handwritten problem image via Gemini Vision

Example request:
```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "mimeType": "image/jpeg",
  "prompt": "Solve step by step for Class 12 boards",
  "classLevel": 12,
  "subject": "Chemistry"
}
```

## Chapter Intelligence hub
- UI: `ChapterIntelligenceHub`
- APIs:
  - `POST /api/chapter-pack`
  - `POST /api/chapter-drill`
  - `POST /api/chapter-diagnose`
  - `POST /api/chapter-remediate`

## Adaptive assessment functions
- `POST /api/adaptive-test`
- `POST /api/revision-plan`
- `POST /api/paper-evaluate`

## Student assignment and exam functions

## Practice mode
- Page: `/practice/assignment/[packId]`
- APIs used:
  - `GET /api/teacher/assignment-pack?id=...`
  - `POST /api/teacher/submission`
  - `GET /api/student/submission-results?packId=...`

## Exam mode (proctored-lite)
- Page: `/exam/assignment/[packId]`
- APIs used:
  - `POST /api/exam/session/start`
  - `POST /api/exam/session/heartbeat`
  - `POST /api/exam/session/submit`

Important behavior:
- Only published packs are available.
- class/section mismatch is blocked with `403`.
- heartbeat and submit require session ownership match.

## 2.2 Teacher functions

## Teacher chapter controls
- UI: `/teacher` -> Chapter Controls
- API: `POST /api/teacher`
- actions:
  - `set-important-topics`
  - `set-quiz-link`
  - `add-announcement`
  - `remove-announcement`

## Assignment lifecycle (teacher-controlled)
- Create draft: `POST /api/teacher/assignment-pack`
- Regenerate: `POST /api/teacher/assignment-pack/regenerate`
- Approve: `POST /api/teacher/assignment-pack/approve`
- Publish: `POST /api/teacher/assignment-pack/publish`
- Archive: `POST /api/teacher/assignment-pack/archive`

## Question builder
- Create: `POST /api/teacher/question-bank/item`
- List: `GET /api/teacher/question-bank/item?chapterId=...`
- Update: `PATCH /api/teacher/question-bank/item/[id]`
- Delete: `DELETE /api/teacher/question-bank/item/[id]`

## Manual grading and result release
- Load summary: `GET /api/teacher/submission-summary?packId=...`
- Grade: `POST /api/teacher/submission/grade`
- Release marks: `POST /api/teacher/submission/release-results`

Grade payload example:
```json
{
  "submissionId": "<submission-id>",
  "questionGrades": [
    { "questionNo": "Q1", "scoreAwarded": 1, "maxScore": 1, "feedback": "Good" },
    { "questionNo": "Q2", "scoreAwarded": 3, "maxScore": 5, "feedback": "Need final step" }
  ]
}
```

## 2.3 Admin functions

## Session
- Bootstrap/login: `POST /api/admin/session/bootstrap`
- Me: `GET /api/admin/session/me`
- Logout: `POST /api/admin/session/logout`

## Teacher management
- List/create: `GET|POST /api/admin/teachers`
- Update: `PATCH /api/admin/teachers/[id]`
- Reset PIN: `POST /api/admin/teachers/[id]/reset-pin`
- Add scope: `POST /api/admin/teachers/[id]/scopes`
- Remove scope: `DELETE /api/admin/teachers/[id]/scopes/[scopeId]`

## Student roster management
- List/create: `GET|POST /api/admin/students`
- Update: `PATCH /api/admin/students/[id]`

## School overview
- `GET /api/admin/overview`

## 2.4 Developer functions
- `GET|POST /api/developer/schools`
- `PATCH /api/developer/schools/[id]`
- `GET /api/developer/schools/[id]/overview`
- `GET /api/developer/usage/tokens`
- `GET /api/developer/audit`

## 2.5 Integrations functions (Google Sheets bridge)
- status: `GET /api/integrations/sheets/status`
- export: `POST /api/integrations/sheets/export`
- import: `POST /api/integrations/sheets/import`

## 3) Public chapter feed function

## Endpoint
- `GET /api/teacher?chapterId=...&classLevel=...&subject=...&section=...`

## Purpose
Fetch student-safe teacher signals:
- announcements
- quiz links
- important topics
- published assignment packs

This is what chapter pages use after refresh. If data disappears on refresh, validate this endpoint first.

## 4) API Lab function (run all endpoints in browser)

## Page
- `/api-lab`

## What it does
- provides prefilled payloads
- executes endpoint calls with current browser cookies
- shows status, latency, response body

## When to use
- verify auth behavior (`401/403/200`)
- validate payload shapes quickly
- regression-check route behavior after code changes

## 5) Environment Variables (current required set)

```env
GEMINI_API_KEY=...
GROQ_API_KEY=...

SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_SECRET_KEY=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

ADMIN_PORTAL_KEY=...
SESSION_SIGNING_SECRET=...
```

Notes:
- Interactive AI routes require authenticated session.
- Teacher/Admin writes fail fast in production if Supabase is not healthy.

## 6) Storage and data model references

Primary schema file:
- `scripts/sql/supabase_init.sql`

Primary runtime data modules:
- `lib/teacher-admin-db.ts`
- `lib/platform-rbac-db.ts`
- `lib/ai/context-retriever.ts`
- `lib/ai/generator.ts`

## 7) Verification Checklist (end-to-end)

1. Auth
- login/logout each role works
- role in `/api/auth/session` changes correctly

2. Student flow
- chapter AI functions return `200`
- practice submission stores attempt
- exam mode start/heartbeat/submit works

3. Teacher flow
- create draft pack
- approve + publish pack
- pack visible in matching student chapter/practice flow
- grading + release flow updates student-visible result state

4. Admin flow
- create teacher + scopes
- create student roster row
- teacher and student can log in with assigned identities

5. Developer flow
- schools/usage/audit endpoints return data

6. Integrations
- sheets status ok
- export works
- import updates grades idempotently

## 8) Troubleshooting

## `401 Unauthorized`
- session cookie missing/expired
- login again from the matching role page

## `403 Forbidden`
- class/section/scope mismatch
- teacher trying to mutate out-of-scope chapter

## `503` on teacher/admin write routes
- Supabase env/schema not ready
- run `scripts/sql/supabase_init.sql` and verify env vars

## chapter page not showing teacher assignment
- check pack status is `published`
- verify class/section matches student session
- test public feed endpoint: `/api/teacher?chapterId=...&classLevel=...&subject=...`

## 9) Deprecated/legacy notes
- weekly plan table (`teacher_weekly_plans`) still exists for compatibility, but primary assessment workflow is assignment lifecycle + manual grading.