# VidyaPath → Public, No-Login Student Platform

**Date:** 2026-11-13 · **Scope:** whole repo (app/, components/, lib/, proxy.ts, supabase/, scripts/)
**Goal:** Any CBSE Class 10/12 student opens the site and studies — chapters, notes, papers, formulas, AI tutor, AI flashcards, AI quizzes — with **no account, no login, no school**. LMS (teachers, assignments, grading, admin, schools) goes away.

---

## 0. Implementation status (2026-11-13, branch `feat/public-student-mode`)

All steps below are implemented. ~81k lines removed, ~1.3k added.

| Area | Result |
|---|---|
| Login walls | Gone. `proxy.ts` only does CSP + CSRF + 308 redirects for retired URLs. No cookies are set. |
| AI | All AI routes public via `lib/ai/public-access.ts` (per-IP daily cap, default 120) + global daily token budget (`cost-guard.ts`, default 1M tokens) + existing per-minute limits. Rate limiter: Upstash → in-memory fallback (no longer fails closed). |
| LMS | Teacher/admin/developer/parent/school portals, assignments, grading, attendance, timetable, rosters, announcements, push, auth — deleted (pages, APIs, libs, components, schemas). |
| Supabase | Fully removed: code, `supabase/` migrations, SQL, seed/migration scripts, `@supabase/supabase-js`, pgvector retrieval path. RAG runs on the local index (+ optional `CONTEXT_CDN_URL`). |
| Converted to on-device | Class/stream picker (`ClassPicker`), chapter notes (`/notes`), flashcard decks persisted per chapter + FSRS review (`/review`), study streak, mock exam (`/mock-exam`, AI paper + client grading + local history), dashboard. |
| Moved | `/student/ai-tools` → `/ai-tools`, `/student/revision` → `/revision`. |
| Decisions taken (§10) | Mock exam converted to local; "Ask Teacher" dropped (AI tutor on every chapter); no cross-device sync (notes downloadable); LMS deleted on a branch (git history keeps it). |
| Legal/docs | Privacy + Terms rewritten for no-account model (please review wording); README, Vercel env doc, CI workflows updated; LMS docs deleted. |
| Verified | typecheck, strict lint, 24/24 unit tests, route-link check, production build; in a cookie-less browser: all 18 public pages 200, AI flashcards + mock-exam API return 200 anonymously, notes/progress/streak/deck/review persist locally, cross-site POST → 403, old URLs → 308. |

Not done / follow-ups:
- `.env.example` could not be edited (blocked by local permission settings) — remove the Supabase/session/teacher/developer entries by hand.
- `/chapters/:id` sends `Cache-Control: public, max-age=86400` (pre-existing, `next.config.js`); browsers may show the previous build's chapter page for up to a day after a deploy.
- The NVIDIA reranker model used by RAG returns HTTP 410 (end-of-life 2026-08-25); retrieval falls back to keyword ordering. Update `AI_RERANK_MODEL`.
- LLMs occasionally return malformed JSON for flashcards (500 on that request; retry works).
- `.tools/` (checked-in Node binary) kept because `scripts/build_rag_pipeline.py` looks for it.

---

## 1. What the project is today

VidyaPath is two products glued together:

| Product | What it is | Size |
|---|---|---|
| **A. Study platform** | Static CBSE content (`lib/data.ts`, `lib/papers.ts`, `lib/formulas.ts`, `lib/pyq*.ts`) + RAG-grounded AI (`lib/ai/*`, `lib/context/*`) | ~45k lines |
| **B. Multi-school LMS** | Schools, admins, teachers, students, parents, developer console; assignments, grading, attendance, timetable, gradebook, announcements, roster import, affiliate onboarding — all on Supabase (48 tables) | ~50k lines |

Total ≈ 95k lines of TS/TSX. **Roughly half is LMS and can be deleted.**

Key facts that make the conversion easy:

- **All content is static in code.** Chapters, topics, formulas, flashcards, PYQ data, paper links (Hugging Face dataset) need no database.
- **AI does not need Supabase.** RAG reads `lib/context/*.jsonl|json(.gz)` from disk or `CONTEXT_CDN_URL`; pgvector is opt-in (`AI_ENABLE_PGVECTOR_RAG=1`). LLMs: NVIDIA → Gemini → Groq (+ Cerebras/Mistral) via `lib/ai/generator.ts`.
- **AI routes barely use the user.** `generate-flashcards`, `generate-quiz`, `ai-tutor`, `chapter-*`, `image-solve`, `paper-evaluate`, `revision-plan`, `adaptive-test` only use the session for (a) the auth gate, (b) rate-limit key (already falls back to client IP), (c) token-usage logging. Content generation is user-independent.
- **Bookmarks and "studied" progress are already localStorage** (`lib/store.ts`, zustand `persist`). Quiz scores and FSRS flashcard state are also in localStorage.

## 2. Why it is NOT public today (the login walls)

| Wall | Where | Effect |
|---|---|---|
| Middleware gates AI APIs | `proxy.ts:233,251` → `lib/security/interactive-api-policy.ts` | Every AI endpoint returns **401** with no session |
| In-route AI gate | `lib/auth/interactive.ts` `requireInteractiveAuth()` (used by every AI route) | Second 401: "Please login to use VidyaAI features" |
| Page redirects to `/student/login` | `proxy.ts:492-569` | `/dashboard`, `/bookmarks`, `/mock-exam`, `/student/*` (incl. **AI Study Hub** and **Revision Hub**) all need login |
| UI "Login required" states | `AIChatBox`, `FloatingAIButton`, `QuizEngine`, `ChapterIntelligenceHub`, `DashboardChapterCoach`, `ImageQuestionSolver`, `RevisionPlanCard` (all call `/api/auth/session` first) | AI buttons disabled / replaced by Login links even if the API were open |
| Startup env assertion | `instrumentation.ts:35` → `lib/config/env-validation.ts` | Production **refuses to boot** without `SESSION_SIGNING_SECRET`, `TEACHER_PORTAL_KEY`, `DEVELOPER_USERNAME`, `DEVELOPER_PASSWORD` |
| Rate limiter fails closed | `lib/security/rate-limit.ts:69-93` | In production with no Redis/Supabase, **every AI call is blocked** |

Already public today: `/`, `/chapters`, `/chapters/[id]`, `/cbse-notes/*`, `/papers`, `/formulas`, `/equations`, `/concept-web`, `/career`, `/privacy`, `/terms`.

---

## 3. KEEP (the student product)

### Pages
| Route | Notes |
|---|---|
| `/` | Remove "Affiliate your school" CTA |
| `/chapters`, `/chapters/[id]` (+ OG image) | Core. Strip teacher widgets (see §5) |
| `/cbse-notes/**` | SEO notes; drop the student-session import in `app/cbse-notes/page.tsx` |
| `/papers` | PYQ papers (HF links). Drop session-based class preselect → use a local "my class" setting |
| `/formulas`, `/equations`, `/concept-web`, `/career` | Static. Remove `PushNotificationToggle` from formulas |
| `/bookmarks` | Already localStorage — just un-gate it |
| `/dashboard` | Keep the **local** parts (progress, weak chapters, learning profile, revision plan, chapter coach). Remove attendance/grades/timetable/announcements/teacher-assignments widgets |
| `/student/ai-tools` → move to **`/ai-tools`** | AI Study Hub: quiz, flashcards, chapter intelligence, image solver |
| `/student/revision` → move to **`/revision`** | Revision Hub (already local-data driven) |
| `/privacy`, `/terms`, `not-found`, `error`, `global-error`, `loading`, `sitemap`, `robots` | Keep; update privacy text (no accounts, no PII) |

### AI endpoints (open to anonymous, see §6 for protection)
`/api/ai-tutor`, `/api/generate-flashcards`, `/api/generate-quiz`, `/api/chapter-pack`, `/api/chapter-drill`, `/api/chapter-diagnose`, `/api/chapter-remediate`, `/api/context-pack`, `/api/image-solve`, `/api/paper-evaluate`, `/api/revision-plan`, `/api/adaptive-test`, `/api/ai/quality-feedback`, `/api/ai/question-feedback` (or drop the feedback two), `/api/career/*`, `/api/health`, `/api/health/ready`.

### Components
`AIChatBox`, `FloatingAIButton`, `FlashcardDeck`, `QuizEngine`, `ChapterIntelligenceHub`, `ImageQuestionSolver`, `DashboardChapterCoach`, `RevisionPlanCard`, `LearningProfileInsights`, `ChapterCard`, `FormulaCard`, `AccessibleFormula`, `MermaidRenderer`, `InlinePDFViewer`, `TextToSpeechButton`, `BookmarkButton`, `StudiedButton`, `PomodoroTimer`, `FloatingPomodoro`, `CommandPalette`, `Navbar`, `MobileBottomNav`, `SiteFooter`, `AppMainShell`, `ThemeProvider`, `PwaInstallPrompt`, `BackButton`, `ScrollToTopOnMount`, `ErrorFallback`, `AnalyticsTracker`/`PrivacyAnalytics` (cookieless Plausible/Umami — fine without login).

### Libraries
`lib/data.ts`, `papers.ts`, `pyq.ts`, `pyq-grounded.ts`, `formulas.ts`, `formula-handbook.ts`, `concept-web.ts`, `career-catalog.ts`, `seo-notes.ts`, `academic-taxonomy.ts`, `learning-profile.ts`, `store.ts`, `useStudyProgress.ts`, `data-quality.ts`, all of `lib/ai/*`, `lib/context/*`, `lib/http/*`, `lib/schemas/{ai,base,common,http,index}.ts`, `lib/security/{rate-limit,redis-rate-limit,csrf}.ts`, `lib/logger.ts`, `lib/observability*.ts`, `lib/runtime-env.ts`, `lib/ui/*`, `lib/hooks/useFetch.ts`.

PWA (`app/sw.ts`, Serwist, `public/manifest.json`) — keep for offline/installable use.

---

## 4. REMOVE (LMS + accounts)

### 4.1 Portals & pages
| Path | Why |
|---|---|
| `app/teacher/**` (24 files) | Teacher portal: assignments, grading, review queue, gradebook, attendance, timetable, weekly plans, resources, question bank, my-class, students, calendar, announcements, AI tools, chapter toolkit |
| `app/admin/**` (19) | School admin: teachers, students, class sections, roster import, timetable, events, analytics, gradebook, recovery, settings, onboarding |
| `app/developer/**` (12), `app/api-lab/` | Multi-school ops console, audit, token usage, affiliate queue |
| `app/parent/**` | Parent portal |
| `app/student/**` except ai-tools & revision (moved) | today, assignments, grades, attendance, timetable, calendar, announcements, weekly-plans, resources, questions, certificate, achievements, srs*, notes*, login, first-login (*see §5) |
| `app/practice/assignment/[packId]`, `app/exam/assignment/[packId]` | Teacher assignment take/exam pages |
| `app/login`, `app/forgot-password`, `app/reset-password` | No accounts |
| `app/affiliate-your-school` | School onboarding |
| `app/notifications` | Role inbox (announcements, assignments, Q&A) |
| `app/sentry-example-page`, `app/api/sentry-test` | Dev test pages |
| `app/helper/**` | Already just redirects to `/chapters` (redirect lives in `proxy.ts`) |

### 4.2 API routes
`app/api/teacher/**`, `app/api/admin/**`, `app/api/developer/**`, `app/api/parent/**`, `app/api/student/**`, `app/api/auth/**`, `app/api/exam/**`, `app/api/affiliate/**`, `app/api/integrations/sheets/**`, `app/api/push/**`, `app/api/notifications/**`, `app/api/analytics/track` (Supabase-backed; replace with Plausible event), `app/api/cron/**`, `app/api/health/auth-diag`, `app/api/mock-exam/**` (unless kept, §5).

### 4.3 Libraries
`lib/teacher-admin-db.ts` (3.8k lines), `school-ops-db.ts`, `school-management-db.ts`, `platform-rbac-db.ts`, `teacher-assignment.ts`, `teacher-store.ts`, `teacher-types.ts`, `onboarding-db.ts`, `parent-portal-db.ts`, `sheets-bridge.ts`, `subject-catalog-db.ts`, `analytics-store.ts`, `admin-embeddings-db.ts`, `study-enhancements-db.ts`, `client-student-session.ts`, `client-auth-session.ts`, `lib/teacher/**`, `lib/admin/**`, `lib/developer/**`, `lib/student/**`, `lib/exam/**`, `lib/notifications/**`, `lib/auth/**`, `lib/persistence/teacher-storage.ts`, `lib/hooks/{useServerProgressSync,useStudentPacksRealtime,useTeacherSubmissionsRealtime,useOfflineExamQueue}.ts`, `lib/security/{audit,idempotency,cron-auth,interactive-api-policy}.ts`, `lib/schemas/{teacher*,admin*,affiliate,auth,developer-ops,exam*,mock-exam,sheets-integration,student-*,engagement,analytics}.ts`.

### 4.4 Components
`Sidebar`, `RolePortalLayout`, `RoleStatusPanel`, `DeveloperPortalNav`, `auth/RoleSwitcher`, `auth/FirstLoginPasswordPage`, `TeacherChapterPanel`, `TeacherQuestionBankLink`, `AskTeacherButton`, `StudentSubjectGate` (already a no-op), `EnableNotificationsButton`, `PushNotificationToggle`, `UxTelemetry` (posts to Supabase analytics — verify, likely drop), `ChapterNotes` (or convert, §5).

### 4.5 Infra, scripts, deps
- **Supabase** — drop entirely: `supabase/` (14 migrations, 48 tables), `lib/supabase-rest.ts`, `lib/supabase/*`, `@supabase/supabase-js`, `scripts/sql/`, and DB scripts (`seed_*`, `clear_supabase_db`, `soft_reset_supabase`, `migrate_*`, `fix_plain_pin_hashes`, `check_supabase_teacher_setup`, `generate_*roster*`, `parse_roster_xlsx.py`, `auth_*`, `security_assertions`, `gen-test-data`), plus `db:*`/`seed:*`/`migrate:*`/`check:auth-*` npm scripts.
- **Web push** — `web-push`, `@types/web-push`, `public/sw.js` push handlers.
- **Docs that describe the LMS** — `endpoint-privilege-matrix.md`, `ROLE_ACCESS_*`, `FUNCTION_*`, `OPERATOR_RUNBOOK.md` (rewrite or delete later).
- **Repo hygiene (unrelated but worth it)** — `.tools/node-v24.14.1-win-x64.zip` and `.tools/node-*` (a full Node binary checked into git), `.hermes/`, `.audit-report.json`, `CS_Study_Guide.pdf`.
- **Env vars no longer needed:** `SESSION_SIGNING_SECRET`, `TEACHER_PORTAL_KEY`, `DEVELOPER_USERNAME`, `DEVELOPER_PASSWORD`, `AUTH_ENABLE_LEGACY_SESSIONS`, `SINGLE_ENV_MODE`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, VAPID keys, cron secret.

**Net:** ~50k lines and 48 DB tables gone. Remaining stack: Next.js + static content + AI keys + one free Upstash Redis.

---

## 5. CONVERT (DB/login-backed features worth keeping, moved to the browser)

These are useful to students but currently stored per-account in Supabase. Move them to localStorage (same pattern as `lib/store.ts`) — no login needed, works offline, data stays on the student's device.

| Feature | Today | Convert to | Effort |
|---|---|---|---|
| **Chapter notes** (`ChapterNotes`, `/student/notes`) | `chapter_notes` table via `/api/student/notes` | zustand-persist `notes[chapterId]` | Small |
| **Spaced repetition** (`/student/srs`) | `srs_cards` via `/api/student/srs` | `ts-fsrs` is already a dependency; flashcard FSRS state is *already* local (`fsrs-[chapterId]-i`). Merge into one local SRS page | Small |
| **Streaks / achievements** | `student_streaks`, `student_badges` | Compute from local study log (days with activity) | Small |
| **Mock exam** (`/mock-exam`) | `mock_exam_sessions` + student session | Generate with `/api/generate-quiz` (or `adaptive-test`), hold attempt in local state, grade client-side | Medium |
| **Dashboard personalization** | Class/stream/section from student session | One-time "I'm in Class 10 / Class 12 (+stream)" picker saved to localStorage; reused by dashboard, papers, AI Hub, revision | Small |
| **Certificate** | Server-rendered from grades | Drop (meaningless without verified identity) | — |
| **Question history / anti-repeat** (`lib/ai/question-history.ts`) | Keyed by `authUserId`, saved to Supabase | Skip for anon (it already no-ops without `authUserId`); optional: send recent question hashes from the client | None |
| **Export/backup** | n/a | Optional "Download my progress" JSON + import, so students can move devices without an account | Small |

Optional later: *anonymous sync code* (a random device code, no email) if students ask for cross-device sync. Not needed for launch.

---

## 6. Making AI public **safely** (the one real risk)

Opening AI to anonymous users means anyone can spend your LLM budget. Today's protections are tied to accounts:
- `checkAiTokenBudget` (`lib/ai/token-budget.ts:49`) returns `allowed: true` when there is no `authUserId` → **anonymous = no token cap**.
- `lib/ai/cost-guard.ts` has a **global daily budget** (`AI_DAILY_TOKEN_BUDGET_GLOBAL`, Upstash-backed) but **nothing calls it** (only the unused `lib/ai/stream.ts`).
- Rate limiter keys already fall back to client IP (`getClientIp`) — good — but fails **closed** in production without Redis/Supabase.

Required changes:
1. **Remove the gates:** delete `requireInteractiveAuth` calls from AI routes; drop AI paths from `proxy.ts`; make AI components skip the `/api/auth/session` check.
2. **Upstash Redis (free tier)** for rate limiting (`UPSTASH_REDIS_REST_URL/TOKEN`), and remove the Supabase RPC path from `rate-limit.ts`.
3. **Per-IP limits** (already in each route, e.g. flashcards 15/min) **plus a per-IP daily cap** (e.g. 60 AI calls/day/IP).
4. **Wire `cost-guard` global daily budget** into every AI route → when the day's budget is spent, return a friendly "AI is resting, try tomorrow — chapters & papers still work".
5. **Response caching** (`AI_RESPONSE_CACHE` exists in `generator.ts`) keyed on chapter+task — flashcards/quizzes for the same chapter can be served from cache, cutting cost sharply for a public audience.
6. **Bot friction only where expensive:** `image-solve` and `paper-evaluate` (vision, large payloads) — tighter limits; optionally Cloudflare Turnstile (invisible, no login) on those two only.
7. Keep `content-safety.ts` / `student-safety.ts` prompts (public = minors).
8. Keep CSRF same-origin check in `proxy.ts` (works without cookies) and keep CSP.

---

## 7. Edits needed in files that stay

| File | Change |
|---|---|
| `proxy.ts` | Reduce to: CSP/nonce headers, CSRF same-origin check, `/helper` redirect, and **301 redirects** for removed routes (`/student/*`, `/teacher/*`, `/admin/*`, `/login`, `/dashboard`-gate removed) → `/chapters` or `/`. Delete all session parsing |
| `instrumentation.ts` + `lib/config/env-validation.ts` | Required = AI key(s) + `NEXT_PUBLIC_APP_URL` only |
| `app/layout.tsx` | Drop `UxTelemetry` if Supabase-backed |
| `components/Navbar.tsx`, `MobileBottomNav.tsx` | Single nav, no roles: Home · Chapters · AI Hub · Papers · Formulas · Saved (+ Revision/Dashboard). Remove Login button and role badges |
| `components/SiteFooter.tsx` | Remove Login link |
| `app/chapters/[id]/page.tsx` | Remove `StudentSubjectGate`, `TeacherQuestionBankLink`, `TeacherChapterPanel`, `AskTeacherButton`; convert `ChapterNotes` |
| AI components (§3) | Delete the `/api/auth/session` probe + "Login required" branches |
| `app/dashboard/page.tsx` (1058 lines) | Remove server fetches (`/api/teacher`, `/api/student/*`), `useServerProgressSync`, `EnableNotificationsButton`; use local class picker |
| `app/papers/page.tsx`, `app/formulas/page.tsx`, `app/cbse-notes/page.tsx` | Replace session lookups with local class setting; remove push toggle |
| `app/page.tsx` | Remove affiliate CTA; add "No login. Just start." |
| `app/sitemap.ts` | Add `/ai-tools`, `/revision`; remove portal routes |
| `scripts/route_link_integrity.mjs` | Update route list |
| `next.config.js` | Re-check `outputFileTracingIncludes`/excludes after deletions (bundle size fix in last commit) |

---

## 8. Recommended order (each step leaves the app working)

1. **Open the doors (smallest, highest value):** un-gate AI in `proxy.ts` + routes + components, un-gate `/dashboard` & `/bookmarks`, move `/student/ai-tools` and `/student/revision` to public routes, add Upstash + global AI budget. → Site is usable without login while LMS still exists.
2. **Convert** notes, SRS, streaks, mock exam, class picker to localStorage.
3. **Delete LMS** (§4.1–4.4), simplify nav, add redirects.
4. **Drop Supabase** + scripts + deps + env; update env-validation.
5. **Verify:** `npm run typecheck`, `lint`, `test`, `check:route-links`, `build`; manual pass in a private window (no cookies) through every kept page and every AI feature; check rate-limit and daily-budget responses.
6. **Repo hygiene** (`.tools/` Node binary, stale docs).

## 9. Hosting for "all students, no headache"

- **Vercel** (already configured, `bom1` region) — fine. Watch function bundle size (RAG files in `lib/context` are traced into functions; prefer `CONTEXT_CDN_URL` for the big `.jsonl`).
- **Costs that remain:** LLM API usage (controlled by §6) + Upstash free tier. No database bill.
- **Low-bandwidth students:** content pages are static/SSG; PWA caching keeps chapters available offline after first visit.
- **Privacy:** no accounts, no PII collected, all personal progress stays on the device — the privacy page can say exactly that (important for minors).

## 10. Decisions for you

1. **Mock exam** — convert to local (recommended) or drop?
2. **"Ask Teacher" / Student Q&A** — drop (no teachers) or replace with "Ask VidyaAI"? (Recommended: replace.)
3. **Cross-device sync** — skip for launch (recommended) or add export/import file?
4. **Delete vs. archive the LMS** — delete on a branch (git history keeps it) — recommended — vs. keep behind a feature flag (keeps all the complexity).
