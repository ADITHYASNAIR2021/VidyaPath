# Vercel Environment Setup

VidyaPath is a public, no-login site with no database. Nothing below blocks the build;
missing values only log warnings at startup.

## AI (at least one key for AI features)
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`

## Recommended
- `NEXT_PUBLIC_APP_URL` — canonical URL (sitemap, robots, metadata, CSRF origin pinning)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — shared rate limits, daily AI budget and developer-console usage metrics across instances
- `DEVELOPER_DASHBOARD_KEY` — 24+ random characters; enables the operator console at `/developer`
  (`node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`)
- `CONTEXT_CDN_URL` — **required in production for full PYQ grounding.** `lib/context/chunks.jsonl(.gz)` (board-paper
  chunks) is gitignored, so Vercel builds don't contain it. Upload `chunks.jsonl.gz` (and optionally `chunk_vectors.jsonl.gz`)
  to any public static host and set this to that folder URL. Check /developer → RAG index: every file except
  `chunk_vectors.jsonl` should show `local`, `local-gz` or `cdn`.

## Cost controls for public AI
- `AI_PUBLIC_DAILY_REQUESTS_PER_IP` (default 120)
- `AI_DAILY_TOKEN_BUDGET_GLOBAL` (default 1,000,000 tokens/day; AI pauses until 00:00 UTC once spent)
- `AI_MAX_TOKENS_PER_REQUEST` (default 4000)

## Optional
- `AI_IMAGE_SOLVE_MODELS` — comma-separated Gemini vision models for the image solver (default: gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-2.5-flash)
- `AI_ENABLE_NVIDIA_RERANK=0` — skip the NVIDIA reranker (its default model was retired 2026-08-25; the app pauses it automatically after a 410)
- `AI_TASK_MODEL_MAP` / `AI_TASK_MODEL_<TASK>` — override model fallback chains without a code change
- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` or `NEXT_PUBLIC_UMAMI_WEBSITE_ID` + `NEXT_PUBLIC_UMAMI_SCRIPT_URL` — cookieless analytics
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error tracking

## No longer used (safe to delete from the Vercel project)
`SESSION_SIGNING_SECRET`, `TEACHER_PORTAL_KEY`, `ADMIN_PORTAL_KEY`, `DEVELOPER_USERNAME`, `DEVELOPER_PASSWORD`,
`AUTH_ENABLE_LEGACY_SESSIONS`, `SINGLE_ENV_MODE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_ENABLE_PGVECTOR_RAG`, `CRON_SECRET`, VAPID keys,
`OBSERVABILITY_ALERT_WEBHOOK_URL`, `ADMIN_BOOTSTRAP_ENABLED`, `STRICT_ENV_VALIDATION`.
