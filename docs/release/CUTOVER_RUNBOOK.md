# Production Cutover Runbook

## Deployment Target
- Primary URL: `https://sreyas-vidyapath.vercel.com`

## Pre-Cutover Checklist
1. Vercel env vars set in Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SIGNING_SECRET`
   - `CRON_SECRET`
   - `OBSERVABILITY_ALERT_WEBHOOK_URL` (recommended)
2. Latest migrations applied and verified.
3. Auth suite executed (`npm run check:auth-suite`) against preview/canary.
4. UAT matrix completed and signed off.

## Cutover Steps
1. Freeze schema and feature toggles for cutover window.
2. Deploy to Vercel preview and run quick smoke checks.
3. Promote to canary cohort.
4. Monitor:
   - auth failure rate
   - 5xx spikes
   - throttle blocks
   - token usage surge
5. If stable for agreed window, promote to full production.

## Immediate Post-Cutover Checks
1. Student login -> chapter -> AI -> assignment submit.
2. Teacher login -> publish -> grade -> release.
3. Admin login -> teacher/student update.
4. Developer console -> observability summary + alert dispatch.

## Rollback Trigger Conditions
- Sustained 5xx spike above threshold.
- Auth failure anomaly above threshold.
- Critical cross-role/cross-tenant security defect.
- Data integrity breach in assignment/exam flow.

## Rollback Action
1. Re-point production to previous stable Vercel deployment.
2. Announce rollback in incident channel.
3. Execute rollback rehearsal procedure if DB compensation is needed.
4. Re-run smoke checks and confirm stabilization.
