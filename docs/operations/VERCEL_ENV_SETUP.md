# Vercel Environment Setup

## Required Production Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SIGNING_SECRET`

## Security and Operations Variables
- `CRON_SECRET` (required for secure cron routes in production)
- `OBSERVABILITY_ALERT_WEBHOOK_URL` (external alert routing)
- `ADMIN_BOOTSTRAP_ENABLED=false` (recommended in production)

## AI Variables
- `GEMINI_API_KEY` (required for image solve and fallback)
- `GROQ_API_KEY` (primary for tutor/quiz/flashcard generation fallback chain)

## Validation Notes
- Build is intentionally blocked when required production env vars are missing.
- Keep preview and production envs separate.
- Rotate `SESSION_SIGNING_SECRET` and `CRON_SECRET` on schedule.
