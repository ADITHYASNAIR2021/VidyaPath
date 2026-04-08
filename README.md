# VidyaPath

## Project Overview
VidyaPath is a free CBSE study platform for Science and Math learners, focused on high-impact board exam preparation with AI support and PYQ-driven study workflows.

Primary audience:
- Class 10 students (Science and Math)
- Class 12 students (Physics, Chemistry, Biology, Math)

Current scope:
- Web app with chapter-wise learning, PYQ insights, AI tutor, quizzes, flashcards, papers, and career guidance.
- No login required; progress and notes are stored locally in the browser.
- Class 11 content exists in `lib/data.ts`, while current user flows are centered on Class 10 and Class 12.

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
npm run dev
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

## Environment Variables
Create `.env.local` in project root:

```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Notes:
- Either key can power AI routes; both are recommended for fallback resilience.
- If both keys are missing/invalid, AI routes return fallback or configuration errors depending on endpoint logic.

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
Current API routes are **stable v1** and remain unchanged:

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

## Scripts
Utilities in `scripts/` (one-line purpose each):

- `download_dataset.py`: Download full or filtered CBSE papers dataset from Hugging Face into local `dataset/`.
- `extract_ncert.py`: Extract text from NCERT PDFs into JSON chapter context artifacts.
- `generate_hf_paper_index.ps1`: Build key-to-path mapping for dynamic Hugging Face paper URL resolution.
- `generate_hf_urls.py`: Generate TypeScript-style HF URL mappings from local/HF file inventories.
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
- Chapter context is static from local data definitions; no full NCERT RAG pipeline is active in runtime routes yet.
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
