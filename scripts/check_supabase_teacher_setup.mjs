import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_TABLES = [
  'teacher_profiles',
  'teacher_scopes',
  'teacher_activity',
  'teacher_announcements',
  'teacher_quiz_links',
  'teacher_topic_priority',
  'teacher_assignment_packs',
  'teacher_submissions',
  'teacher_weekly_plans',
];

function parseEnvText(text) {
  const output = {};
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

async function loadEnvFiles() {
  for (const file of [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')]) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const parsed = parseEnvText(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore missing file
    }
  }
}

function readConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY.');
  }
  return { url, key, schema };
}

async function checkTable(config, table) {
  const endpoint = `${config.url}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Accept-Profile': config.schema,
      Prefer: 'count=exact',
    },
  });
  const body = await response.text().catch(() => '');
  return {
    table,
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 400),
  };
}

async function main() {
  await loadEnvFiles();
  const config = readConfig();
  console.log(`[check_supabase_teacher_setup] URL=${config.url} schema=${config.schema}`);

  const results = [];
  for (const table of REQUIRED_TABLES) {
    results.push(await checkTable(config, table));
  }

  let failures = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`OK   ${result.table}`);
      continue;
    }
    failures += 1;
    console.log(`FAIL ${result.table} -> ${result.status}`);
    if (result.body) console.log(`      ${result.body}`);
  }

  if (failures > 0) {
    console.log('');
    console.log('Action: run scripts/sql/supabase_init.sql in Supabase SQL editor,');
    console.log("then re-run this check. Also keep SUPABASE_SCHEMA/SUPABASE_STATE_SCHEMA='public'.");
    process.exitCode = 1;
    return;
  }

  console.log('[check_supabase_teacher_setup] All required tables are reachable.');
}

main().catch((error) => {
  console.error('[check_supabase_teacher_setup] failed:', error?.message || error);
  process.exitCode = 1;
});
