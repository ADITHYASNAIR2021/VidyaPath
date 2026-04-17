/**
 * clear_supabase_db.mjs
 * Deletes ALL rows from every app table. Runs before a fresh seed.
 * Does NOT delete Supabase auth.users (managed separately).
 *
 * Usage: node scripts/clear_supabase_db.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function loadLocalEnvFiles() {
  for (const file of [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')]) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      for (const lineRaw of raw.split(/\r?\n/)) {
        const line = lineRaw.trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch { /* ignore */ }
  }
}

function cfg() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || 'public').trim();
  if (!url || !key) throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return { url, key, schema };
}

async function deleteAll(table) {
  const c = cfg();
  // PostgREST: DELETE with a filter that matches all rows
  const response = await fetch(`${c.url}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000&id=gte.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Accept-Profile': c.schema,
      'Content-Profile': c.schema,
      Prefer: 'return=minimal',
    },
  });
  // Accept 200, 204, or 404 (empty table)
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    console.warn(`  [WARN] DELETE ${table}: ${response.status} ${text.slice(0, 120)}`);
  }
}

async function deleteAllNoIdFilter(table) {
  // For tables with non-uuid primary keys or composite PKs
  const c = cfg();
  const response = await fetch(`${c.url}/rest/v1/${table}`, {
    method: 'DELETE',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Accept-Profile': c.schema,
      'Content-Profile': c.schema,
      Prefer: 'return=minimal',
    },
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    console.warn(`  [WARN] DELETE ${table}: ${response.status} ${text.slice(0, 120)}`);
  }
}

async function main() {
  await loadLocalEnvFiles();
  console.log('[clear_supabase_db] clearing all tables...');

  // Order matters: delete children before parents
  const tablesWithUuidId = [
    'exam_violations',
    'exam_sessions',
    'teacher_submissions',
    'teacher_assignment_packs',
    'teacher_question_bank',
    'teacher_weekly_plans',
    'teacher_activity',
    'teacher_announcements',
    'teacher_quiz_links',
    'teacher_topic_priority',
    'teacher_scopes',
    'student_profiles',
    'teacher_profiles',
    'school_admin_profiles',
    'platform_user_roles',
    'identity_counters',
    'schools',
  ];

  const tablesWithOtherKey = [
    'token_usage_events',
    'app_state',
    'audit_events',
    'rate_limit_buckets',
  ];

  for (const table of tablesWithUuidId) {
    process.stdout.write(`  Clearing ${table}...`);
    await deleteAll(table);
    console.log(' done');
  }

  for (const table of tablesWithOtherKey) {
    process.stdout.write(`  Clearing ${table}...`);
    await deleteAllNoIdFilter(table).catch(() => {});
    console.log(' done (or skipped)');
  }

  console.log('[clear_supabase_db] all tables cleared.');
}

main().catch((error) => {
  console.error('[clear_supabase_db] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
