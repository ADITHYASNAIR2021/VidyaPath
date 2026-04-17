# Supabase schema + migrations

This directory is managed by the [Supabase CLI](https://supabase.com/docs/reference/cli/introduction).

## First-time setup

```bash
# 1. Log in
npx supabase login

# 2. Link to your remote project
npx supabase link --project-ref <YOUR_PROJECT_REF>

# 3. (Optional) Pull remote schema as a starting baseline
npx supabase db pull
```

## Layout

- `migrations/` — versioned SQL files (`<timestamp>_<name>.sql`). Applied in order.
  - `20260417000000_baseline.sql` — full initial schema snapshot (copy of legacy `scripts/sql/supabase_init.sql`).
- `seed.sql` — optional dev seed data. Runs after `db reset`.
- `config.toml` — local dev / CLI config.

## Everyday commands

```bash
# Create a new migration from a rough SQL diff (edit the generated file)
npx supabase migration new add_rls_student_profiles

# Apply pending migrations to the linked remote project
npm run db:push

# Reset LOCAL dev DB, re-run every migration + seed (DESTRUCTIVE, local only)
npm run db:reset

# Generate migration diff between local schema and remote
npm run db:diff

# Dump current remote schema back into a new migration
npx supabase db pull
```

## Rules

- NEVER edit an already-applied migration. Add a new one.
- NEVER run `db:reset` against production.
- The legacy monolith at `scripts/sql/supabase_init.sql` is frozen. All future schema changes land as new migration files here.
- RLS policies will live in dedicated migrations named `*_rls_*.sql`.
