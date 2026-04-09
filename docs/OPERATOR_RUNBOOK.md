# VidyaPath Operator Runbook

## 1. Schema Migration Order
1. Set env vars in deployment:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PORTAL_KEY`
- `SESSION_SIGNING_SECRET`
2. Run SQL in Supabase SQL editor:
- `scripts/sql/supabase_init.sql`
3. Optional legacy migration:
- `npm run migrate:supabase-state`
- `npm run migrate:teacher-normalized`

## 2. Health Checks
1. Teacher storage health:
- Open `/teacher` and confirm storage banner shows `Connected`.
2. Admin overview health:
- Open `/admin` and verify `Storage status` + `High-risk exam sessions`.
3. API sanity:
- `GET /api/admin/overview` (admin session required)
- `GET /api/teacher?chapterId=...&classLevel=...&subject=...`
- `POST /api/exam/session/start`

## 3. Production Checklist
1. Teacher/admin writes must fail fast on storage issues:
- Expected behavior: `503` with setup hint to `scripts/sql/supabase_init.sql`.
2. Confirm teacher scope feed:
- Chapter page shows merged `quizLinks`, `importantTopics`, `announcements`.
3. Confirm exam integrity path:
- `start -> heartbeat -> submit` works and logs risk summary.
4. Confirm class taxonomy:
- Class 10 does not expose commerce subjects.
- English Core is visible in Class 10 and Class 12 flows.
5. Confirm auth guards:
- `/teacher/**` requires teacher session.
- `/admin/**` requires admin session.
