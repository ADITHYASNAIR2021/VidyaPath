import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

function parseEnvText(text) {
  const out = {};
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadLocalEnvFiles() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(ROOT, fileName);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = parseEnvText(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore
    }
  }
}

function getConfig() {
  return {
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, ''),
    key: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
    schema: (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim(),
  };
}

function assertConfig(config) {
  if (!config.url) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).');
  if (!config.key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
}

async function patchTable(config, table, payload, filters) {
  const params = new URLSearchParams();
  params.set('select', '*');
  for (const filter of filters) {
    params.set(filter.column, `${filter.op || 'eq'}.${filter.value}`);
  }
  const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': config.schema,
      'Content-Profile': config.schema,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    const detail = typeof data?.message === 'string' ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`Patch failed for ${table}: ${response.status} ${detail}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function main() {
  await loadLocalEnvFiles();
  const config = getConfig();
  assertConfig(config);

  const [archivedSchools, deactivatedRoles, inactiveTeachers, inactiveStudents, inactiveAdmins] = await Promise.all([
    patchTable(config, 'schools', { status: 'archived' }, [{ column: 'status', op: 'neq', value: 'archived' }]).catch(() => 0),
    patchTable(config, 'platform_user_roles', { is_active: false }, [{ column: 'is_active', value: 'true' }]).catch(() => 0),
    patchTable(config, 'teacher_profiles', { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => 0),
    patchTable(config, 'student_profiles', { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => 0),
    patchTable(config, 'school_admin_profiles', { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => 0),
  ]);

  console.log('[soft-reset] completed');
  console.log(`schools archived: ${archivedSchools}`);
  console.log(`platform roles deactivated: ${deactivatedRoles}`);
  console.log(`teachers set inactive: ${inactiveTeachers}`);
  console.log(`students set inactive: ${inactiveStudents}`);
  console.log(`admins set inactive: ${inactiveAdmins}`);
}

main().catch((error) => {
  console.error('[soft-reset] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
