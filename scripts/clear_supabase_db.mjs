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

async function deleteByFilter(table, filter) {
  const c = cfg();
  const response = await fetch(`${c.url}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Accept-Profile': c.schema,
      'Content-Profile': c.schema,
      Prefer: 'return=minimal',
    },
  });
  const body = await response.text().catch(() => '');
  return { ok: response.ok, status: response.status, body };
}

async function clearTable(table, filters) {
  let lastFailure = '';
  for (const filter of filters) {
    const result = await deleteByFilter(table, filter);
    if (result.ok || result.status === 404) return { cleared: true, via: filter };
    lastFailure = `${result.status} ${result.body.slice(0, 180)}`;
    // Try the next filter if the current one is invalid for this table.
    if (result.status === 400 && /column .* does not exist|42703/i.test(result.body)) continue;
  }
  return { cleared: false, via: filters[0] ?? '', error: lastFailure };
}

async function main() {
  await loadLocalEnvFiles();
  console.log('[clear_supabase_db] clearing all tables...');

  // Order matters: clear child tables first.
  const clearPlan = [
    { table: 'exam_violations', filters: ['id=not.is.null'] },
    { table: 'exam_sessions', filters: ['id=not.is.null'] },
    { table: 'teacher_submissions', filters: ['id=not.is.null'] },
    { table: 'teacher_assignment_packs', filters: ['id=not.is.null'] },
    { table: 'teacher_question_bank', filters: ['id=not.is.null'] },
    { table: 'teacher_weekly_plans', filters: ['id=not.is.null'] },
    { table: 'teacher_activity', filters: ['id=not.is.null'] },
    { table: 'teacher_announcements', filters: ['id=not.is.null'] },
    { table: 'teacher_quiz_links', filters: ['id=not.is.null'] },
    { table: 'teacher_topic_priority', filters: ['id=not.is.null'] },
    { table: 'teacher_class_assignments', filters: ['id=not.is.null'] },
    { table: 'student_subject_enrollments', filters: ['id=not.is.null'] },
    { table: 'attendance_records', filters: ['id=not.is.null'] },
    { table: 'class_resources', filters: ['id=not.is.null'] },
    { table: 'timetable_slots', filters: ['id=not.is.null'] },
    { table: 'school_events', filters: ['id=not.is.null'] },
    { table: 'announcement_reads', filters: ['id=not.is.null'] },
    { table: 'push_subscriptions', filters: ['id=not.is.null'] },
    { table: 'srs_cards', filters: ['id=not.is.null'] },
    { table: 'student_badges', filters: ['id=not.is.null'] },
    { table: 'chapter_notes', filters: ['id=not.is.null'] },
    { table: 'mock_exam_sessions', filters: ['id=not.is.null'] },
    { table: 'parent_links', filters: ['id=not.is.null'] },
    { table: 'student_streaks', filters: ['student_id=not.is.null'] },
    { table: 'teacher_scopes', filters: ['id=not.is.null'] },
    { table: 'class_sections', filters: ['id=not.is.null'] },
    { table: 'student_profiles', filters: ['id=not.is.null'] },
    { table: 'teacher_profiles', filters: ['id=not.is.null'] },
    { table: 'school_subject_catalog', filters: ['id=not.is.null'] },
    { table: 'school_admin_profiles', filters: ['id=not.is.null'] },
    { table: 'platform_user_roles', filters: ['id=not.is.null'] },
    { table: 'identity_counters', filters: ['id=not.is.null'] },
    { table: 'school_announcements', filters: ['id=not.is.null'] },
    { table: 'school_affiliate_requests', filters: ['id=not.is.null'] },
    { table: 'token_usage_events', filters: ['id=not.is.null'] },
    { table: 'api_idempotency', filters: ['id=not.is.null'] },
    { table: 'audit_events', filters: ['id=not.is.null'] },
    { table: 'admin_mutation_audit', filters: ['id=not.is.null'] },
    { table: 'request_throttle', filters: ['id=not.is.null'] },
    { table: 'app_state', filters: ['state_key=not.is.null'] },
    { table: 'data_quality_issues', filters: ['id=not.is.null'] },
    { table: 'chapter_career_map', filters: ['id=not.is.null'] },
    { table: 'career_exam_catalog', filters: ['id=not.is.null'] },
    { table: 'career_track_catalog', filters: ['id=not.is.null'] },
    { table: 'document_embeddings', filters: ['id=not.is.null'] },
    // Legacy compatibility (older schema name)
    { table: 'rate_limit_buckets', filters: ['id=not.is.null', 'bucket_key=not.is.null'] },
    { table: 'schools', filters: ['id=not.is.null'] },
  ];

  for (const item of clearPlan) {
    process.stdout.write(`  Clearing ${item.table}...`);
    const result = await clearTable(item.table, item.filters).catch((error) => ({
      cleared: false,
      error: error instanceof Error ? error.message : String(error),
      via: item.filters[0],
    }));
    if (result.cleared) {
      console.log(` done (${result.via})`);
    } else {
      console.log(' done (or skipped)');
      console.warn(`  [WARN] DELETE ${item.table}: ${result.error ?? 'unknown error'}`);
    }
  }

  console.log('[clear_supabase_db] all tables cleared.');
}

main().catch((error) => {
  console.error('[clear_supabase_db] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
