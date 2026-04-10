# Rollback Rehearsal

## Goal
Practice a full rollback before production cutover to ensure fast recovery with minimal data risk.

## Rehearsal Inputs
- Target deployment ID for rollback.
- Latest migrations list and reverse/compensating SQL plan.
- On-call owner for app + database.

## Steps
1. Deploy latest release to Vercel preview.
2. Run smoke checks (auth, chapter load, core APIs).
3. Promote to canary (single school/internal tenant).
4. Intentionally trigger rollback drill:
   - Vercel: redeploy previous stable build to production alias.
   - Database: run only approved down/compensating migration if required.
5. Re-run smoke checks on rolled-back version.
6. Confirm all critical endpoints respond and sessions remain valid.

## Data Safety Rules
- Never run destructive SQL without explicit reviewed script.
- For additive migrations, prefer forward-fix over destructive rollback.
- Keep backups/snapshots before irreversible schema changes.

## Exit Criteria
- App rollback completes in < 15 minutes.
- Critical student/teacher flows restored.
- Incident notes recorded with exact timestamps and owners.

## Post-Rehearsal Output
- Document actual rollback duration.
- List friction points and owners for remediation.
- Update cutover runbook with improvements.
