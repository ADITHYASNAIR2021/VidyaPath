# Observability, SLOs, and Alert Routing

## SLO Targets
- Auth endpoints p95: `< 300ms`
- Core read endpoints p95: `< 500ms`
- AI endpoints p95: `< 4s` (excluding model provider latency variance)

## Primary Metrics (24h window)
- `authFailures` / `authEvents`
- `fiveXxEvents`
- `blockedThrottleBuckets`
- `totalTokens`

## Alert Policies
- `auth-failure-rate`
  - Warn: `>= 8%`
  - Critical: `>= 15%`
- `server-5xx-spike`
  - Warn: `>= 8`
  - Critical: `>= 20`
- `bruteforce-throttle-signals`
  - Warn: `>= 3`
  - Critical: `>= 8`
- `token-usage-surge`
  - Warn: `>= 250000`
  - Critical: `>= 600000`

## External Routing
- Cron endpoint: `GET /api/cron/dispatch-observability-alerts`
- Manual endpoint (developer): `POST /api/developer/observability/dispatch`
- Destination env var: `OBSERVABILITY_ALERT_WEBHOOK_URL`
- Security:
  - Cron requires `x-vercel-cron` + `Authorization: Bearer <CRON_SECRET>`.
  - Manual dispatch requires developer session.

## Vercel Cron Schedule
- `0 * * * *` (hourly dispatch sweep)
