import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, 'lib', 'runtime');
const ANALYTICS_PATH = path.join(RUNTIME_DIR, 'analytics.json');
const TEACHER_PATH = path.join(RUNTIME_DIR, 'teacher-config.json');

function parseEnvText(text) {
  const out = {};
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadLocalEnvFiles() {
  const envFiles = [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')];
  for (const envFile of envFiles) {
    try {
      const raw = await fs.readFile(envFile, 'utf-8');
      const parsed = parseEnvText(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore missing env files
    }
  }
}

function getConfig() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    key: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
    table: (process.env.SUPABASE_STATE_TABLE || 'app_state').trim(),
    schema: (process.env.SUPABASE_STATE_SCHEMA || 'public').trim(),
  };
}

function assertEnv(config) {
  const SUPABASE_URL = config.url;
  const SUPABASE_SERVICE_ROLE_KEY = config.key;
  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  }
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function upsertState(stateKey, stateJson, config) {
  const url = `${config.url}/rest/v1/${encodeURIComponent(config.table)}`;
  const payload = [
    {
      state_key: stateKey,
      state_json: stateJson,
      updated_at: new Date().toISOString(),
    },
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': config.schema,
      'Content-Profile': config.schema,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Upsert failed for ${stateKey}: ${response.status} ${text.slice(0, 300)}`);
  }
}

async function main() {
  await loadLocalEnvFiles();
  const config = getConfig();
  assertEnv(config);

  const [analyticsState, teacherState] = await Promise.all([
    readJsonIfExists(ANALYTICS_PATH),
    readJsonIfExists(TEACHER_PATH),
  ]);

  let migrated = 0;

  if (analyticsState) {
    await upsertState('analytics_store_v1', analyticsState, config);
    migrated += 1;
    console.log('Migrated analytics_store_v1');
  } else {
    console.log('Skipped analytics_store_v1 (no local file found)');
  }

  if (teacherState) {
    await upsertState('teacher_store_v2', teacherState, config);
    migrated += 1;
    console.log('Migrated teacher_store_v2');
  } else {
    console.log('Skipped teacher_store_v2 (no local file found)');
  }

  console.log(`Done. Migrated ${migrated} state blob(s) to Supabase.`);
}

main().catch((error) => {
  console.error('[migrate_state_to_supabase] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
