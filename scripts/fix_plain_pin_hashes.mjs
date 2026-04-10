/**
 * fix_plain_pin_hashes.mjs
 *
 * Repairs teacher_profiles and student_profiles rows where pin_hash was
 * manually inserted as plain text (e.g. "1234") instead of being hashed
 * by the app's hashPin() function (scrypt:salt:hash format).
 *
 * Usage:
 *   node scripts/fix_plain_pin_hashes.mjs
 *
 * It will:
 * 1. Fetch all active teachers and students
 * 2. For any row where pin_hash does NOT start with "scrypt:", treat the
 *    existing value as the plain-text PIN and re-hash it properly
 * 3. Update the row in Supabase
 * 4. Print a summary of what was changed
 *
 * DRY RUN by default — set APPLY=1 to actually write:
 *   APPLY=1 node scripts/fix_plain_pin_hashes.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

const ROOT = process.cwd();
// Accept --apply as a CLI flag (works on all platforms including Windows)
const DRY_RUN = !process.argv.includes('--apply');

// ── env loading ─────────────────────────────────────────────────────────────
async function loadEnv() {
  for (const file of [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')]) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    } catch { /* ignore missing */ }
  }
}

// ── supabase helpers ─────────────────────────────────────────────────────────
function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  return { url, key, schema: (process.env.SUPABASE_STATE_SCHEMA || 'public').trim() };
}

async function sbGet(table, filters = []) {
  const { url, key, schema } = supabaseConfig();
  const params = new URLSearchParams({ select: '*', limit: '5000' });
  for (const { col, val } of filters) params.set(col, `eq.${val}`);
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': schema },
  });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, id, patch) {
  const { url, key, schema } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': schema,
      'Content-Profile': schema,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${table}/${id} failed: ${res.status} ${await res.text()}`);
}

// ── pin hashing ──────────────────────────────────────────────────────────────
function isHashedPin(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts[0] === 'scrypt' && parts.length === 3 && parts[1].length >= 16 && parts[2].length >= 32;
}

function hashPin(plainPin) {
  const normalized = String(plainPin).replace(/\s+/g, '').trim();
  const salt = randomBytes(16).toString('hex'); // 32 hex chars
  const hash = scryptSync(normalized, salt, 32).toString('hex'); // 64 hex chars
  return `scrypt:${salt}:${hash}`;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  await loadEnv();
  console.log(DRY_RUN ? '[fix_pin_hashes] DRY RUN — no changes will be written. Set APPLY=1 to apply.' : '[fix_pin_hashes] APPLY MODE — changes will be written to Supabase.');
  console.log('');

  let fixedTeachers = 0;
  let fixedStudents = 0;
  let skippedTeachers = 0;
  let skippedStudents = 0;

  // ── Teachers ────────────────────────────────────────────────────────────
  console.log('Checking teacher_profiles...');
  const teachers = await sbGet('teacher_profiles', [{ col: 'status', val: 'active' }]);
  for (const t of teachers) {
    if (isHashedPin(t.pin_hash)) {
      skippedTeachers++;
      continue;
    }
    const plainPin = t.pin_hash ?? '';
    console.log(`  TEACHER ${t.id} (${t.name}, phone=${t.phone}): pin_hash="${plainPin.slice(0, 20)}..." → will re-hash`);
    if (!DRY_RUN) {
      const newHash = hashPin(plainPin || '0000');
      await sbPatch('teacher_profiles', t.id, { pin_hash: newHash });
    }
    fixedTeachers++;
  }
  console.log(`  Teachers: ${fixedTeachers} to fix, ${skippedTeachers} already hashed`);
  console.log('');

  // ── Students ─────────────────────────────────────────────────────────────
  console.log('Checking student_profiles...');
  const students = await sbGet('student_profiles', [{ col: 'status', val: 'active' }]);
  for (const s of students) {
    if (!s.pin_hash || isHashedPin(s.pin_hash)) {
      skippedStudents++;
      continue;
    }
    const plainPin = s.pin_hash;
    console.log(`  STUDENT ${s.id} (${s.name}, roll_code=${s.roll_code}): pin_hash="${plainPin.slice(0, 20)}..." → will re-hash`);
    if (!DRY_RUN) {
      const newHash = hashPin(plainPin);
      await sbPatch('student_profiles', s.id, { pin_hash: newHash });
    }
    fixedStudents++;
  }
  console.log(`  Students: ${fixedStudents} to fix, ${skippedStudents} already hashed (or no PIN)`);
  console.log('');

  if (DRY_RUN && (fixedTeachers > 0 || fixedStudents > 0)) {
    console.log(`Found ${fixedTeachers + fixedStudents} record(s) with bad PIN hashes.`);
    console.log('Re-run with --apply to fix them:');
    console.log('  npm run fix:pin-hashes:apply');
  } else if (!DRY_RUN) {
    console.log(`Done. Fixed ${fixedTeachers} teacher(s) and ${fixedStudents} student(s).`);
    if (fixedTeachers > 0 || fixedStudents > 0) {
      console.log('NOTE: The PIN for each fixed record is now the same as what was stored before (the plain-text value).');
      console.log('Users can log in with that same value as their PIN.');
    }
  } else {
    console.log('All pin_hash values are already in the correct scrypt format. No fixes needed.');
  }
}

main().catch((err) => {
  console.error('[fix_pin_hashes] Fatal error:', err?.message || err);
  process.exit(1);
});
