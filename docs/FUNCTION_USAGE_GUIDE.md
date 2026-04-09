# VidyaPath Function Usage Guide

This guide documents the implemented functions from small UI helpers to full AI workflows.

It is written in a `what it does + how to use it + request/response + fallback` format so teachers, students, and developers can use everything correctly.

## 1) Quick Setup For All Functions

## Required environment variables

```env
GEMINI_API_KEY=...
GROQ_API_KEY=...
ADMIN_PORTAL_KEY=...
SESSION_SIGNING_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`GEMINI_API_KEY` is primary for generation features.  
`GROQ_API_KEY` is backup.  
`ADMIN_PORTAL_KEY` bootstraps admin session.  
Teacher login uses phone + PIN from admin-created teacher profiles.

## Run locally

```bash
npm install
npm run build:context
npm run verify:context
npm run dev
```

## Production sanity check

```bash
npm run build
npm run start
```

---

## 2) Core User Flows

## Student flow
1. Open `/chapters`.
2. Pick chapter.
3. Use:
- AI Mentor (`AIChatBox`)
- Quiz (`QuizEngine`)
- Flashcards (`FlashcardDeck`)
- Chapter Intelligence (`ChapterIntelligenceHub`)
- Notes (`ChapterNotes`)
4. Track progress in `/dashboard`.
5. For controlled tests, use `/exam/assignment/[packId]` with Proctored Lite policy.

## Teacher flow
1. Open `/teacher/login (phone + PIN)`.
2. Set chapter priority topics.
3. Set chapter quiz links.
4. Publish announcements.
5. Generate assignment pack (MCQ + short answers + formula drill).
6. Share student link, collect submissions, review summary.
7. Publish weekly plan and next-week plan.

---

## 3) API Function Catalog

Most routes are `POST`; read routes include `GET /api/teacher`, `GET /api/teacher/assignment-pack`, and `GET /api/teacher/submission-summary`.

## 3.1 Stable v1 APIs

### Function: `ai-tutor`
- Route: `/api/ai-tutor`
- Purpose: chapter-aware CBSE tutor response
- Called from: `components/AIChatBox.tsx`, `components/FloatingAIButton.tsx`
- Request:
```json
{
  "messages": [{"role": "user", "content": "Explain Nernst equation"}],
  "chapterContext": {
    "chapterId": "c12-chem-2",
    "title": "Electrochemistry",
    "subject": "Chemistry",
    "classLevel": 12,
    "topics": ["Nernst equation", "Cell potential"]
  }
}
```
- Response:
```json
{
  "message": "....",
  "isOffTopic": false
}
```
- Fallback behavior:
- returns `503` if no AI key configured
- returns `502` if AI provider fails

### Function: `generate-flashcards`
- Route: `/api/generate-flashcards`
- Purpose: generate chapter flashcards
- Called from: `components/FlashcardDeck.tsx`
- Request:
```json
{
  "chapterId": "c12-chem-2",
  "subject": "Chemistry",
  "chapterTitle": "Electrochemistry"
}
```
- Response:
```json
{
  "success": true,
  "data": [{"front": "...", "back": "..."}]
}
```
- Fallback behavior:
- deterministic local cards if AI output fails

### Function: `generate-quiz`
- Route: `/api/generate-quiz`
- Purpose: generate chapter MCQ set
- Called from: `components/QuizEngine.tsx`
- Request:
```json
{
  "chapterId": "c12-chem-2",
  "subject": "Chemistry",
  "chapterTitle": "Electrochemistry",
  "questionCount": 5,
  "difficulty": "mixed"
}
```
- Response:
```json
{
  "success": true,
  "data": [
    {
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "..."
    }
  ]
}
```

## 3.2 v2 Integrated Intelligence APIs

### Function: `context-pack`
- Route: `/api/context-pack`
- Purpose: retrieve ranked context snippets for a task
- Primary users: developers, internal debug
- Request:
```json
{
  "classLevel": 12,
  "subject": "Chemistry",
  "chapterId": "c12-chem-2",
  "chapterTopics": ["Nernst equation"],
  "query": "high yield revision",
  "task": "chapter-pack"
}
```
- Response:
```json
{
  "snippets": [{"text": "...", "sourcePath": "...", "year": 2025, "relevanceScore": 91.2}],
  "contextHash": "...",
  "usedOnDemandFallback": false
}
```

### Function: `revision-plan`
- Route: `/api/revision-plan`
- Purpose: adaptive week plan from weak chapters and available time
- Called from: `components/RevisionPlanCard.tsx`
- Request:
```json
{
  "classLevel": 12,
  "subject": "Chemistry",
  "weeklyHours": 8,
  "examDate": "2026-03-15",
  "weakChapterIds": ["c12-chem-2"],
  "targetScore": 85
}
```
- Response:
```json
{
  "planWeeks": [
    {
      "week": 1,
      "focusChapters": ["c12-chem-2"],
      "tasks": ["..."],
      "targetMarks": 10,
      "reviewSlots": ["..."],
      "miniTests": ["..."]
    }
  ]
}
```

### Function: `paper-evaluate`
- Route: `/api/paper-evaluate`
- Purpose: estimate score and mistakes from submitted descriptive answers
- Request:
```json
{
  "paperId": "b12-chem-2024-d",
  "classLevel": 12,
  "subject": "Chemistry",
  "answers": [{"questionNo": "Q1", "answerText": "..."}]
}
```
- Response:
```json
{
  "scoreEstimate": 64,
  "sectionBreakdown": [{"section": "Concept Accuracy", "score": 22, "maxScore": 35}],
  "mistakes": ["..."],
  "improvementTasks": ["..."],
  "weakTopics": ["..."],
  "recommendedChapters": ["c12-chem-2"]
}
```

### Function: `adaptive-test`
- Route: `/api/adaptive-test`
- Purpose: weak-area targeted mixed-difficulty MCQ paper
- Request:
```json
{
  "classLevel": 12,
  "subject": "Chemistry",
  "chapterIds": ["c12-chem-2", "c12-chem-12"],
  "difficultyMix": "40% easy, 40% medium, 20% hard",
  "questionCount": 10,
  "mode": "board-practice"
}
```
- Response:
```json
{
  "questions": [{"question": "...", "options": ["A","B","C","D"], "answer": 1, "explanation": "..."}],
  "answerKey": [1],
  "topicCoverage": ["..."],
  "predictedScoreBand": "65-78%"
}
```

### Function: `chapter-pack`
- Route: `/api/chapter-pack`
- Purpose: chapter intelligence summary with PYQ trend and strategy
- Called from: `components/ChapterIntelligenceHub.tsx`
- Request:
```json
{"chapterId":"c12-chem-2"}
```
- Response:
```json
{
  "chapterId":"c12-chem-2",
  "chapterTitle":"...",
  "highYieldTopics":["..."],
  "formulaFocus":["..."],
  "pyqTrend":{"yearsAsked":[2025,2024], "avgMarks":8, "frequencyLabel":"High Frequency"},
  "commonMistakes":["..."],
  "examStrategy":["..."],
  "sourceCitations":[{"sourcePath":"...","year":2025}]
}
```

### Function: `chapter-drill`
- Route: `/api/chapter-drill`
- Purpose: chapter-specific drill questions
- Called from: `components/ChapterIntelligenceHub.tsx`
- Request:
```json
{
  "chapterId":"c12-chem-2",
  "questionCount":12,
  "difficulty":"hard-heavy"
}
```
- Response:
```json
{
  "chapterId":"c12-chem-2",
  "difficulty":"hard-heavy",
  "questions":[{"question":"...","options":["A","B","C","D"],"answer":0,"explanation":"..."}],
  "answerKey":[0],
  "topicCoverage":["..."],
  "sourceCitations":[{"sourcePath":"...","year":2024}]
}
```
- Reliability details:
- generator now tries JSON recovery + strict retry
- route tops up from deterministic fallback so requested count is preserved

### Function: `chapter-diagnose`
- Route: `/api/chapter-diagnose`
- Purpose: identify chapter risk and next actions
- Called from: `components/ChapterIntelligenceHub.tsx`, `components/DashboardChapterCoach.tsx`
- Request:
```json
{
  "chapterId":"c12-chem-2",
  "quizScore":58,
  "flashcardsDue":6,
  "studied":true,
  "bookmarked":true,
  "recentMistakes":["Wrong sign in Nernst equation"]
}
```
- Response:
```json
{
  "chapterId":"c12-chem-2",
  "riskLevel":"medium",
  "weakTags":["Nernst equation","unit conversion"],
  "diagnosis":["..."],
  "nextActions":["..."],
  "recommendedTaskTypes":["chapter-drill","flashcards"]
}
```

### Function: `chapter-remediate`
- Route: `/api/chapter-remediate`
- Purpose: create short day-by-day correction plan
- Called from: `components/ChapterIntelligenceHub.tsx`, `components/DashboardChapterCoach.tsx`
- Request:
```json
{
  "chapterId":"c12-chem-2",
  "weakTags":["Low Quiz Accuracy"],
  "availableDays":7,
  "dailyMinutes":45
}
```
- Response:
```json
{
  "chapterId":"c12-chem-2",
  "dayPlan":[{"day":1,"focus":"...","tasks":["..."],"targetOutcome":"..."}],
  "checkpoints":["..."],
  "expectedScoreLift":"6-10 marks"
}
```

### Function: `image-solve`
- Route: `/api/image-solve`
- Purpose: solve textbook/photo question with Gemini vision
- Called from: `components/ImageQuestionSolver.tsx`
- Request:
```json
{
  "imageBase64":"data:image/jpeg;base64,...",
  "prompt":"Solve this for Class 12 chemistry",
  "subject":"Chemistry",
  "classLevel":12,
  "chapterTitle":"Electrochemistry"
}
```
- Response:
```json
{
  "solution":"...",
  "steps":["..."],
  "formulaLatex":["E = E^0 - (0.0591/n) log Q"],
  "citations":[]
}
```

### Function: `analytics-track`
- Route: `/api/analytics/track`
- Purpose: privacy-respecting event tracking
- Called from: `components/AnalyticsTracker.tsx`
- Supported events:
- `chapter_view` with `chapterId`
- `ai_question` with `chapterId`
- `search_no_result` with `query`
- Response:
```json
{"ok": true}
```

### Function: `teacher-get`
- Route: `GET /api/teacher`
- Purpose: return teacher config
- Access behavior:
- valid teacher session cookie -> private config with analytics
- no teacher session -> public config only

### Function: `teacher-post`
- Route: `POST /api/teacher`
- Purpose: mutate teacher configuration
- Actions:
- `set-important-topics`
- `set-quiz-link`
- `add-announcement`
- `remove-announcement`
- `create-assignment-pack`
- `publish-weekly-plan`
- `archive-weekly-plan`

Example request:
```json
{
  "action":"set-important-topics",
  "chapterId":"c12-chem-2",
  "topics":["Nernst equation","Electrolysis"]
}
```

---

## 4) UI Component Function Catalog

Each entry follows: `Function name -> where -> how to use`.

### AI and Learning
- `AIChatBox` -> chapter page -> ask chapter-specific doubts, derivations, MCQs.
- `FloatingAIButton` -> global mobile/quick access -> ask short doubts from any page.
- `ChapterIntelligenceHub` -> chapter page -> run chapter pack, drill, diagnose, 7-day remediation.
- `ImageQuestionSolver` -> chapter page -> upload image and get stepwise solution.
- `QuizEngine` -> chapter page -> attempt quiz, auto-saves `quiz-score-[chapterId]`.
- `FlashcardDeck` -> chapter page -> FSRS rating (`Again/Hard/Good/Easy`) with due scheduling.
- `FormulaCard` -> chapter page -> view chapter formulas with KaTeX.
- `MermaidRenderer` -> chapter page -> view process diagrams.
- `TextToSpeechButton` -> chapter header -> read chapter topics aloud.
- `PomodoroTimer` -> chapter sidebar -> start suggested high-yield focus session.
- `ChapterNotes` -> chapter page -> personal notes saved in local storage.

### Teacher and Insights
- `TeacherChapterPanel` -> chapter page -> show teacher priority topics, announcements, and quiz link.
- `DashboardChapterCoach` -> dashboard -> diagnose/remediate top weak chapter.
- `RevisionPlanCard` -> dashboard -> generate weekly revision plan.
- `LearningProfileInsights` -> chapter sidebar -> show risk and recommended actions from local signals.

### Navigation and Utility
- `Navbar` -> top navigation.
- `MobileBottomNav` -> mobile route shortcuts.
- `CommandPalette` -> quick jump to chapters/features.
- `InlinePDFViewer` -> chapter page NCERT PDF inline/expand.
- `BookmarkButton` -> chapter save for revision.
- `StudiedButton` -> mark complete for dashboard progress.
- `AnalyticsTracker` -> page-level event tracking.
- `PrivacyAnalytics` -> privacy-safe analytics loader.

---

## 5) Page-Level Function Guide

- `/` Home: platform overview, feature entry points, CBSE pattern quick reference.
- `/chapters`: chapter discovery by class/subject + fuzzy search.
- `/chapters/[id]`: full chapter workspace (study + AI + teacher + productivity).
- `/papers`: paper browser with Hugging Face PDF links.
- `/dashboard`: local profile analytics + adaptive planning.
- `/bookmarks`: saved chapter list.
- `/career`: exam and college guidance.
- `/formulas`: searchable formula database.
- `/concept-web`: topic graph view.
- `/teacher`: teacher control room.
- `/practice/assignment/[packId]`: shareable student assignment + printable view.
- `/cbse-notes` and `/cbse-notes/...`: SEO notes pages.

---

## 6) Local State Keys (Small But Important Functions)

- `notes-[chapterId]`: chapter private notes.
- `quiz-score-[chapterId]`: last quiz score.
- `fsrs-[chapterId]-[index]`: spaced repetition card state.
- `vidyapath-progress`: studied chapters store.
- `vidyapath-bookmarks`: bookmarked chapters store.

---

## 7) Internal Engine Functions

- `getContextPack` (`lib/ai/context-retriever.ts`): retrieves top snippets + context hash.
- `generateTaskText` / `generateTaskJson` (`lib/ai/generator.ts`): Gemini-first generation with Groq fallback and JSON hardening.
- `buildVariationProfile` (`lib/ai/variation.ts`): prompt diversity rotation by task/chapter/time bucket.
- `buildLearningProfile` + `rankWeakChapters` (`lib/learning-profile.ts`): weak area scoring.
- `teacher-store` (`lib/teacher-store.ts`): persistent teacher topics, quiz links, announcements.
- `analytics-store` (`lib/analytics-store.ts`): counters for chapter views, AI questions, and search misses.

---

## 8) Teacher Portal Action Guide

## A) Set chapter important topics
1. Open `/teacher/login (phone + PIN)`
2. Select chapter
3. Enter comma-separated topics
4. Click `Save Important Topics`

## B) Set chapter quiz link
1. Paste Google Form URL
2. Click `Save Quiz Link`

## C) Publish announcement
1. Add title and body
2. Click `Publish Announcement`

## D) Remove announcement
1. Click `Remove` on announcement card

## E) Monitor demand signals
1. Use `AI Hot Chapters` card
2. Use `Search Misses` card for content gaps

---

## 9) AI Mentor Usage Guide (Student)

1. Open any chapter.
2. Ask specific question in VidyaAI:
- "Explain Nernst equation with one board-level solved example."
3. Ask revision mode:
- "Give 5 high-yield MCQs from this chapter."
4. Ask exam mode:
- "What mistakes reduce marks in this chapter?"
5. If off-topic, AI returns scope-safe guidance.

Best prompt format:
- Concept + class + output format.
- Example: `Class 12 Chemistry: Explain electrolysis in 5 bullet points + one numerical.`

---

## 10) End-to-End Testing Checklist

## Small function checks
- Bookmark/unbookmark chapter.
- Mark studied/unmark studied.
- Write notes and refresh page.
- Solve one quiz and verify score persists.
- Flip and rate flashcards.

## Mid-size function checks
- Generate chapter pack.
- Generate chapter drill (6/8/10/12 questions).
- Run diagnose and remediate.
- Run image question solver.

## Large workflow checks
- Generate revision plan from dashboard.
- Generate adaptive test for multiple chapters.
- Evaluate paper answers.
- Teacher publishes announcement and quiz link, then verify student chapter page reflects it.

## API checks (Postman)
- Hit each route with sample payload.
- Validate response shape and status code.
- Validate fallback behavior by temporarily disabling one provider key.

---

## 11) Troubleshooting

- Build fails on JSX `->`:
- replace with `{'->'}` or `&gt;`.

- `EADDRINUSE: 3000`:
- stop process on port 3000 or run `npm run start -- -p 3001`.

- AI returns fallback often:
- verify `GEMINI_API_KEY`
- verify `GROQ_API_KEY`
- run `npm run build:context` and `npm run verify:context`

- Teacher panel unauthorized:
- sign in at `/teacher/login` and verify teacher status/scopes in `/admin`.

---

## 12) Developer Notes

- Keep existing API contracts stable for v1 routes.
- Add new capabilities under v2 routes.
- For new AI features, use shared `context-retriever` + `generator` instead of one-off LLM calls.
- Prefer deterministic fallback for each route to avoid hard failures during provider outages.




## 13) Teacher Assignment APIs (New)

### Function: `teacher-assignment-pack-create`
- Route: `POST /api/teacher/assignment-pack`
- Purpose: generate and persist a classroom assignment pack.
- Request:
```json
{
  "chapterId":"c12-chem-2",
  "classLevel":12,
  "subject":"Chemistry",
  "questionCount":12,
  "difficultyMix":"40% easy, 40% medium, 20% hard",
  "includeShortAnswers":true,
  "includeFormulaDrill":true,
  "dueDate":"2026-05-01"
}
```

### Function: `teacher-assignment-pack-get`
- Route: `GET /api/teacher/assignment-pack?id=<packId>`
- Purpose: fetch assignment pack for student render or teacher export.
- Access behavior:
- public returns active pack with hidden answer key
- teacher session returns full pack

### Function: `teacher-submission`
- Route: `POST /api/teacher/submission`
- Purpose: accept no-login student attempt.
- Request:
```json
{
  "packId":"<uuid-pack-id>",
  "studentName":"Adithya S Nair",
  "submissionCode":"XII-A-23",
  "answers":[{"questionNo":"Q1","answerText":"option:2"}]
}
```
- Response keys: `scoreEstimate`, `mistakes`, `weakTopics`, `nextActions`, `duplicate`.

### Function: `teacher-submission-summary`
- Route: `GET /api/teacher/submission-summary?packId=<id>`
- Purpose: teacher-side class trend summary.
- Response keys: `attempts`, `averageScore`, `topMistakes`, `weakTopics`, `recommendedNextChapterIds`, `attemptsByStudent[]`, `questionStats[]`, `scoreTrend[]`.





## 14) Optional Supabase Persistence

VidyaPath now supports optional remote state persistence for teacher + analytics stores.

Environment variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_STATE_TABLE (optional, default app_state)
- SUPABASE_STATE_SCHEMA (optional, default public)

One-time SQL:
- run scripts/sql/supabase_init.sql in Supabase SQL editor.

Behavior:
- if configured, server state reads/writes use Supabase REST API.
- teacher/admin writes in production fail fast with actionable `503` errors if Supabase/schema is not ready.

## 15) Supabase Migration Runbook

1. Ensure env vars are set:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_STATE_TABLE (optional)
- SUPABASE_STATE_SCHEMA (optional)

2. Run SQL setup in Supabase SQL editor:
- scripts/sql/supabase_init.sql

3. Backfill local runtime state to Supabase:
```bash
npm run migrate:supabase-state
```

4. Verify rows:
```sql
select state_key, updated_at from public.app_state order by updated_at desc;
```

5. Start app and trigger writes:
- open /teacher
- perform one teacher update
- open chapter/dashboard for analytics events







### Function: `exam-session-start`
- Route: `POST /api/exam/session/start`
- Purpose: begin Proctored Lite exam attempt for assignment pack.
- Request:
```json
{
  "packId":"<uuid-pack-id>",
  "studentName":"Adithya S Nair",
  "submissionCode":"XII-A-23"
}
```
- Response: `{ "session": { "sessionId":"...", "status":"active" } }`

### Function: `exam-session-heartbeat`
- Route: `POST /api/exam/session/heartbeat`
- Purpose: record visibility/fullscreen/copy-paste integrity events.
- Request:
```json
{
  "sessionId":"<session-id>",
  "events":[{"type":"tab-hidden","occurredAt":"2026-04-09T12:30:00.000Z"}]
}
```
- Response includes updated `integritySummary`.

### Function: `exam-session-submit`
- Route: `POST /api/exam/session/submit`
- Purpose: submit proctored attempt and attach integrity summary.
- Request:
```json
{
  "sessionId":"<session-id>",
  "answers":[{"questionNo":"Q1","answerText":"option:1"}]
}
```
- Response includes `attemptDetail` + `integritySummary`.
