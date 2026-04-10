# VidyaPath

## Project Overview
VidyaPath is a free CBSE study platform for Class 10 and 12 learners, focused on high-impact board exam preparation with AI support and PYQ-driven study workflows.

Primary audience:
- Class 10 students (Science, Math, English Core)
- Class 12 students (Physics, Chemistry, Biology, Math, English Core)

Current scope:
- Web app with chapter-wise learning, PYQ insights, AI tutor, quizzes, flashcards, papers, and career guidance.
- Public browsing is open; interactive features (AI, assignments, exams, role consoles) require login.
- Progress and notes are still stored locally in the browser for student convenience.
- Class 11 content exists in `lib/data.ts`, while current user flows are centered on Class 10 and Class 12.

## Function Usage Guide
- Detailed function-by-function usage (teacher portal, AI mentor, chapter intelligence, APIs, local state, testing):
- `docs/FUNCTION_USAGE_GUIDE.md`
- Deep engineering map (UI -> API -> service -> storage):
- `docs/FUNCTION_TO_FUNCTION_MAPPING.md`
- Operator runbook: `docs/OPERATOR_RUNBOOK.md`
- Release UAT matrix: `docs/release/UAT_MATRIX.md`
- Rollback rehearsal: `docs/release/ROLLBACK_REHEARSAL.md`
- Cutover runbook: `docs/release/CUTOVER_RUNBOOK.md`
- Observability + SLO alerts: `docs/operations/OBSERVABILITY_SLO_ALERTS.md`
- Vercel env setup: `docs/operations/VERCEL_ENV_SETUP.md`

## Implemented Features
### Learning
- Chapter library with filtering by class and subject.
- Fast fuzzy topic/chapter search powered by Fuse.js.
- Chapter detail pages with:
- key topics, board/JEE/NEET relevance labels, formula cards, and Mermaid diagrams.
- NCERT PDF inline viewer (with new-tab fallback path).
- YouTube lecture discovery links and NCERT Exemplar links.
- PYQ analysis per chapter:
- years asked, average marks, high-frequency topics, and frequency labels.

### AI
- Chapter-aware VidyaAI tutor (`/api/ai-tutor`) with strict syllabus scope control.
- Off-topic guardrail using `OFFTOPIC:` sentinel handling.
- Provider fallback chain:
- Groq primary (`llama-3.3-70b-versatile`, then `llama-3.1-8b-instant` on 429).
- Gemini fallback when Groq is unavailable or fails.
- Styled AI response rendering with:
- markdown-like formatting, equation heuristics, and KaTeX support.
- AI-generated chapter flashcards (`/api/generate-flashcards`) with PYQ context injection.
- AI-generated chapter quizzes (`/api/generate-quiz`) with PYQ context injection.

### Papers
- Unified papers browser with class/type/subject filters and year/grouped views.
- Board, sample, compartment, and marking scheme entries.
- Hugging Face dataset routing for direct PDF streaming from:
- `https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025`
- Auto-resolved URL mapping via `lib/hfPaperIndex.json`.
- Visible `HF PDF` badge when a paper is served from Hugging Face.

### Productivity
- Bookmark chapters for revision list.
- Mark chapters as studied and track completion progress.
- Dashboard analytics:
- progress by class and subject, recent activity, quiz score snapshot, flashcards due.
- Chapter private notes with auto-save (debounced local storage).
- Pomodoro timer with PYQ-aware high-yield session suggestions.
- Spaced repetition flashcards using `ts-fsrs`.
- Command palette (desktop and mobile trigger) for quick chapter search/navigation.
- Text-to-speech helper for chapter/topic reading.

### Career
- Career guide for PCM and PCB learners.
- Entrance exam cards with details, official links, and prep tips.
- Top colleges section by stream and tier.
- Scholarship references and year-by-year roadmap content.

### Platform
- Next.js App Router architecture.
- PWA support via Serwist service worker.
- SEO support with metadata, sitemap, robots, and JSON-LD.
- Security headers configured in `next.config.js`.
- Mobile bottom navigation and floating AI assistant entry point.

## Route Walkthrough
- `/`
- Landing page with product summary, class entry points, feature highlights, and free-access positioning.
- `/chapters`
- Full chapter library with Fuse.js search, class/subject filters, and PYQ topic hit indicators.
- `/chapters/[id]`
- Detailed chapter workspace: PYQ analytics, formulas, diagrams, notes, quiz, flashcards, Pomodoro, PDF viewer, and contextual AI tutor.
- `/papers`
- Previous papers explorer with filterable catalog and direct Hugging Face PDF links where available.
- `/dashboard`
- Personal progress dashboard using local storage state for studied/bookmarked/quiz/flashcard signals.
- `/bookmarks`
- Revision list of saved chapters.
- `/career`
- Entrance exams, colleges, scholarships, and planning roadmaps for PCM/PCB.

## Tech Stack
- Framework: Next.js 14 (App Router), React 18, TypeScript
- Styling/UI: Tailwind CSS, `clsx`, Lucide icons, Framer Motion
- State: Zustand (`persist` middleware)
- Search: Fuse.js
- Retrieval ranking: chapter/topic keyword overlap + lightweight local vector semantic scoring (hashed embeddings + cosine)
- Spaced repetition: `ts-fsrs`
- Math rendering: KaTeX (`katex`, `react-katex`)
- Diagrams: Mermaid
- PWA/service worker: Serwist (`@serwist/next`, `serwist`)
- Utilities: `use-debounce`

## Local Setup
Prerequisites:
- Node.js 18+ (LTS recommended)
- npm (bundled with Node)

Install and run:

```bash
npm install
npm run build:context
npm run verify:context
npm run dev
```

Optional higher-fidelity context build from PDF text (requires Python + `pypdf`):

```bash
npm run build:context:python
npm run verify:context
```

Fast subset mode (optional):

```bash
npm run build:context:python:fast
npm run verify:context
```

What you will see during Python context build:
- Live terminal progress with ETA for:
- PDF scanning
- chunk extraction
- Final summary with dropped chunk counts:
- `dropped_unmapped`
- `dropped_non_english`
- `dropped_instruction`

State migration (optional, one-time backfill to Supabase):

```bash
npm run migrate:supabase-state
```

Build and production run:

```bash
npm run build
npm run start
```

Optional lint:

```bash
npm run lint
```

Context troubleshooting quick checks:
- If `npm run build:context` prints `chunks=0`, rerun after pulling latest code (older parser could fail on multiline chapter entries).
- Run `npm run verify:context` and confirm:
- `chunks > 0`
- `mapped > 0` (chapter-linked chunks exist)
- `unmapped = 0` (no null/empty chapter IDs)
- `pre2019 > 0` (older-year coverage present when available)
- `build:context:python` is optional and slower; it requires a working Python install plus `pypdf`.
- `build:context:python` now indexes all matched PDFs by default (`--max-files 0`).
- If you previously saw `Multiple definitions in dictionary ...` from `pypdf`, latest script suppresses this non-fatal parser noise.

## Environment Variables
Create `.env.local` in project root:

```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
# Optional (only if Python is installed in a non-standard path):
# PYTHON_BIN=C:\Path\To\python.exe
# Optional (recommended on Vercel for persistent server-side state):
# SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# SUPABASE_STATE_TABLE=app_state
# SUPABASE_STATE_SCHEMA=public
```

Notes:
- Either key can power AI routes; both are recommended for fallback resilience.
- If both keys are missing/invalid, AI routes return fallback or configuration errors depending on endpoint logic.
- Teacher/admin writes are Supabase-first with production fail-fast behavior. If storage is misconfigured in production, APIs return actionable `503` errors.
- Free DB comparison + setup rationale: `docs/FREE_DB_OPTIONS.md`.

## Data and Content Sources
- Chapter content, exam metadata, career data:
- `lib/data.ts`
- PYQ mapping and chapter frequency signals:
- `lib/pyq.ts`
- Paper catalog and URL resolution:
- `lib/papers.ts`
- Hugging Face paper index:
- `lib/hfPaperIndex.json`

External sources:
- NCERT textbook and exemplar links (`ncert.nic.in`)
- CBSE question papers and sample paper references (`cbseacademic.nic.in`, `cbse.gov.in`)
- Hugging Face dataset CDN for large paper assets:
- `https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025`

Hugging Face paper URL pattern used in app:
- `https://huggingface.co/datasets/<repo>/resolve/main/<dataset-relative-path>`

## API Routes
Stable v1 routes (unchanged interface):

- `POST /api/ai-tutor` (stable v1)
- Input: chat messages plus optional `chapterContext`.
- Output: `{ message, isOffTopic }`.
- Behavior: syllabus-scoped AI tutor with Groq primary and Gemini fallback.

- `POST /api/generate-flashcards` (stable v1)
- Input: `{ chapterId, subject?, chapterTitle?, nccontext? }`.
- Output: `{ success, data }` where `data` is flashcard array.
- Behavior: AI-generated flashcards with PYQ-focused prompt context and provider fallback.

- `POST /api/generate-quiz` (stable v1)
- Input: `{ chapterId, subject?, chapterTitle?, nccontext? }`.
- Output: `{ success, data }` where `data` is quiz-question array.
- Behavior: AI-generated quizzes with strict JSON parsing and provider fallback.

New v2 routes (Gemini-first integrated intelligence):

- `POST /api/context-pack` (v2 internal/debug)
- Input: `{ classLevel, subject, chapterId?, chapterTopics?, query?, task? }`.
- Output: `{ snippets, contextHash, usedOnDemandFallback }`.
- Behavior: Returns ranked chapter-aware snippets from context cache with on-demand extraction fallback.

- `POST /api/revision-plan` (v2)
- Input: `{ classLevel, subject?, examDate?, weeklyHours, weakChapterIds?, targetScore? }`.
- Output: `{ planWeeks: [{ week, focusChapters, tasks, targetMarks, reviewSlots?, miniTests? }] }`.
- Behavior: Adaptive week-wise revision planner with fallback heuristic if AI is unavailable.

- `POST /api/paper-evaluate` (v2)
- Input: `{ paperId, answers: [{ questionNo, answerText }], classLevel?, subject? }`.
- Output: `{ scoreEstimate, sectionBreakdown, mistakes, improvementTasks, weakTopics?, recommendedChapters? }`.
- Behavior: Attempts AI evaluation with structured output; falls back to deterministic marking heuristics.

- `POST /api/adaptive-test` (v2)
- Input: `{ classLevel, subject, chapterIds, difficultyMix?, questionCount?, mode? }`.
- Output: `{ questions, answerKey, topicCoverage, predictedScoreBand }`.
- Behavior: Weak-area adaptive MCQ generation with schema validation and fallback question synthesis.

- `POST /api/chapter-pack` (v2)
- Input: `{ chapterId }`.
- Output: `{ chapterId, chapterTitle, highYieldTopics, formulaFocus, pyqTrend, commonMistakes, examStrategy, sourceCitations }`.
- Behavior: Builds a chapter-specific intelligence pack grounded in PYQ + retrieved paper snippets.

- `POST /api/chapter-drill` (v2)
- Input: `{ chapterId, questionCount?, difficulty? }`.
- Output: `{ chapterId, difficulty, questions, answerKey, topicCoverage, sourceCitations }`.
- Behavior: Generates chapter-targeted drill questions with fallback to local chapter quiz bank.

- `POST /api/chapter-diagnose` (v2)
- Input: `{ chapterId, quizScore?, flashcardsDue?, studied?, bookmarked?, recentMistakes? }`.
- Output: `{ chapterId, riskLevel, weakTags, diagnosis, nextActions, recommendedTaskTypes }`.
- Behavior: Diagnoses chapter risk from learning signals and returns action-oriented recommendations.

- `POST /api/chapter-remediate` (v2)
- Input: `{ chapterId, weakTags?, availableDays?, dailyMinutes? }`.
- Output: `{ chapterId, dayPlan, checkpoints, expectedScoreLift }`.
- Behavior: Produces a short corrective study plan for weak chapter outcomes.

- `POST /api/teacher/submission` (teacher workflow)
- Input: `{ packId, studentName, submissionCode, answers: [{ questionNo, answerText }] }`.
- Output: `{ scoreEstimate, mistakes, weakTopics, nextActions, attemptDetail, integritySummary }`.
- Behavior: Stores per-attempt student analytics with question-wise correctness and integrity summary support.

- `GET /api/teacher/submission-summary?packId=...` (teacher workflow)
- Output includes: `attemptsByStudent`, `questionStats`, and `scoreTrend` in addition to summary cards.

- `POST /api/exam/session/start`
- Input: `{ packId, studentName, submissionCode }`.
- Output: `{ session }`.

- `POST /api/exam/session/heartbeat`
- Input: `{ sessionId, events? }`.
- Output: `{ session, integritySummary }`.

- `POST /api/exam/session/submit`
- Input: `{ sessionId, answers }`.
- Output: `{ scoreEstimate, mistakes, weakTopics, nextActions, attemptDetail, integritySummary }`.

## Scripts
Utilities in `scripts/` (one-line purpose each):

- `build_context_index.py`: Build/rebuild paper-context artifacts (`lib/context/chunks.jsonl`, `lib/context/chapter_index.json`) and support single-file on-demand extraction mode.
- `build_context_index.mjs`: Node-based context index builder (no Python required) using chapter + PYQ + HF paper mapping.
- `verify_context_index.mjs`: Validate context artifact health (chunk count, chapter mapping coverage, year-range coverage).
- `download_dataset.py`: Download full or filtered CBSE papers dataset from Hugging Face into local `dataset/`.
- `extract_ncert.py`: Extract text from NCERT PDFs into JSON chapter context artifacts.
- `generate_hf_paper_index.ps1`: Build key-to-path mapping for dynamic Hugging Face paper URL resolution.
- `generate_hf_urls.py`: Generate TypeScript-style HF URL mappings from local/HF file inventories.
- `auth_matrix_smoke.mjs`: Fast unauthenticated access smoke checks across role-protected routes.
- `auth_role_isolation_suite.mjs`: Comprehensive auth + role isolation suite (supports login creds and cookie-based role tests).
- `parallel_modern_cbse.py`: Parallel fetch and extraction sync for modern CBSE question-paper archives.
- `scrape_byjus_papers.py`: Scrape and save Byjus historical paper PDFs into dataset folder structure.
- `scrape_cbse_papers.py`: Scrape legacy and modern CBSE paper links and download/extract assets.
- `upload_to_hf.py`: Upload local dataset assets to Hugging Face dataset repository.

## Deployment, PWA, SEO, Security
- Deployment target:
- Vercel-compatible Next.js app.
- PWA:
- Service worker built from `app/sw.ts` to `public/sw.js` using Serwist.
- SEO:
- Metadata and Open Graph in `app/layout.tsx`.
- `app/sitemap.ts` and `app/robots.ts`.
- JSON-LD (`EducationalOrganization`) in root layout.
- Security headers (`next.config.js`):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Cache policy:
- CDN caching for chapter routes (`/chapters/:id`) with revalidation strategy.

## Known Limitations
- No user accounts or cloud sync; notes/progress are browser-local.
- AI output quality depends on provider quotas and model availability.
- Gemini can return rate-limit errors on free-tier usage spikes.
- Proctored-lite exam mode is a web best-effort integrity layer (fullscreen/visibility/copy-paste controls), not OS-level lockdown.
- Paper-context retrieval is active via `lib/context` artifacts; full PDF text extraction quality depends on running `scripts/build_context_index.py` in a Python + `pypdf` environment.
- Some legacy utility scripts still reference older Hugging Face repo naming and may require constant updates for consistency.

## Roadmap
Priority: **Exam outcomes first**.

### Phase 1: Adaptive Revision Planner
Goal:
- Turn weak areas, available hours, and exam date into a week-wise revision schedule.

Proposed API:
- `POST /api/revision-plan`

Request:

```json
{
  "classLevel": 10,
  "subject": "Science",
  "examDate": "2026-03-15",
  "weeklyHours": 12,
  "weakChapterIds": ["c10-phy-3", "c10-chem-4"]
}
```

Response:

```json
{
  "planWeeks": [
    {
      "week": 1,
      "focusChapters": ["c10-phy-3"],
      "tasks": ["Concept revision", "PYQ set 1", "Timed test"],
      "targetMarks": 8
    }
  ]
}
```

Success signal:
- Higher chapter completion rate in weak topics.
- Improvement in quiz scores after 2-4 weeks of planned revision.

### Phase 2: Paper Practice Evaluator
Goal:
- Convert solved-paper attempts into structured feedback that maps to marks gain.

Proposed API:
- `POST /api/paper-evaluate`

Request:

```json
{
  "paperId": "b12-phy-2024-d",
  "answers": [
    { "questionNo": "Q1", "answerText": "..." },
    { "questionNo": "Q2", "answerText": "..." }
  ]
}
```

Response:

```json
{
  "scoreEstimate": 46,
  "sectionBreakdown": [
    { "section": "A", "score": 12, "max": 16 }
  ],
  "mistakes": ["Missing unit in numerical final answer"],
  "improvementTasks": ["Revise electrostatics derivations", "Practice 10 assertion-reason items"]
}
```

Success signal:
- Faster correction loops after mock paper attempts.
- Measurable gain in estimated score across repeated attempts.

### Phase 3: Weak-Area Adaptive Test Generator
Goal:
- Auto-generate targeted tests weighted toward weak/high-yield concepts.

Proposed API:
- `POST /api/adaptive-test`

Request:

```json
{
  "classLevel": 12,
  "subject": "Chemistry",
  "chapterIds": ["c12-chem-2", "c12-chem-12"],
  "difficultyMix": { "easy": 30, "medium": 50, "hard": 20 }
}
```

Response:

```json
{
  "questions": [
    {
      "question": "Cell potential is...",
      "options": ["...", "...", "...", "..."],
      "answer": 2,
      "explanation": "..."
    }
  ],
  "answerKey": [2],
  "topicCoverage": ["Nernst equation", "Electrolysis"]
}
```

Success signal:
- Higher accuracy in historically weak chapters.
- Better retention measured by quiz correctness over time.

### Documentation Validation Checklist
- README quality check: a new contributor can run locally within 10 minutes using this document.
- Coverage check: each major route and capability is represented in this README.
- Config check: env variables and AI fallback behavior are explicit.
- Roadmap check: each planned phase includes API shape and exam-impact success criteria.



