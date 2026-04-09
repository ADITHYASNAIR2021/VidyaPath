# Free Database Options for VidyaPath (Next.js)

This is a practical shortlist for a free, production-usable DB that works well with Next.js API routes.

## Recommended Choice: Supabase Postgres

Why this is a good fit for VidyaPath now:
- Free tier supports multiple active projects and native Postgres.
- Easy to use from Next.js server routes.
- Can be accessed over REST (no extra DB driver required).
- Works well with local-first fallback in this codebase.

Official references:
- Supabase Billing FAQ (free project limits):
  https://supabase.com/docs/guides/platform/billing-faq
- Supabase Data REST API docs:
  https://supabase.com/docs/guides/api
- Supabase Next.js quickstart:
  https://supabase.com/docs/guides/getting-started/quickstarts/nextjs

## Strong Alternative: Turso (libSQL)

Why it can also work well:
- Serverless SQLite over HTTP/libSQL.
- Works with Node and edge runtimes.
- Good for fast, lightweight SQL workloads.

Official references:
- Turso TypeScript SDK runtime compatibility and install:
  https://docs.turso.tech/sdk/ts/reference
- Turso free-plan PITR retention note (plan behavior example):
  https://docs.turso.tech/features/point-in-time-recovery

## What is now implemented in VidyaPath

VidyaPath now supports optional Supabase-backed persistence for:
- teacher-store
- analytics-store

If Supabase env variables are set, writes go to Supabase table app_state.
If not set (or remote unavailable), the existing local file + in-memory fallback still works.

## One-time setup

1. Create a Supabase project.
2. Run SQL script in Supabase SQL editor:
- scripts/sql/supabase_init.sql
3. Set server env vars:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- optional: SUPABASE_STATE_TABLE (default app_state)
- optional: SUPABASE_STATE_SCHEMA (default public)

Important:
- Keep SUPABASE_SERVICE_ROLE_KEY server-only (never expose in browser).
