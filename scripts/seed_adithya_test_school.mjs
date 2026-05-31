/**
 * seed_adithya_test_school.mjs
 * Creates a clean test setup for "Adithya test school" (code ATS):
 *   - School row
 *   - DEVELOPER   (Supabase auth user + platform_user_roles role=developer)  ← also fixes prod developer login
 *   - ADMIN       (Supabase auth user + school_admin_profiles + role)
 *   - 1 base TEACHER + 1 base STUDENT (for instant all-role testing; bulk roster via CSV import)
 *   - identity counters
 *
 * Run AFTER wiping: `npm run db:clear` then `node scripts/seed_adithya_test_school.mjs`
 * Bulk students/teachers: import scripts/seed-data/{students,teachers}.csv via Admin → Import roster.
 *
 * Does NOT delete anything. Idempotent (upserts on fixed ids).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, scryptSync } from 'node:crypto';

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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
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

function publicApiKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
}

async function signInAuthUserByPassword(email, password) {
  const c = cfg();
  const apiKey = publicApiKey();
  if (!apiKey) return null;
  const response = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  return data?.user?.id ? data.user : null;
}

async function getAuthUserByEmail(email) {
  const c = cfg();
  const needle = String(email || '').trim().toLowerCase();
  const perPage = 1;
  for (let page = 1; page <= 1000; page++) {
    const response = await fetch(`${c.url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`getAuthUserByEmail(${email}): ${response.status} ${JSON.stringify(data)}`);
    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((u) => String(u?.email || '').toLowerCase() === needle);
    if (found) return found;
    if (users.length < perPage) break;
  }
  throw new Error(`Auth user ${email} not found after creation conflict.`);
}

async function createAuthUser({ email, password, userMetadata = {} }) {
  const c = cfg();
  const response = await fetch(`${c.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: userMetadata }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 422 && JSON.stringify(data).toLowerCase().includes('email')) {
      const signedIn = await signInAuthUserByPassword(email, password).catch(() => null);
      if (signedIn?.id) return signedIn;
      return await getAuthUserByEmail(email);
    }
    throw new Error(`createAuthUser(${email}): ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function updateAuthUserPassword(userId, password) {
  const c = cfg();
  const response = await fetch(`${c.url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`  [WARN] updateAuthUserPassword(${userId}): ${response.status} ${text.slice(0, 100)}`);
  }
}

async function upsertRow(table, row, onConflict = 'id') {
  const c = cfg();
  const qs = onConflict ? `?select=*&on_conflict=${encodeURIComponent(onConflict)}` : '?select=*';
  const response = await fetch(`${c.url}/rest/v1/${table}${qs}`, {
    method: 'POST',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': c.schema,
      'Content-Profile': c.schema,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`upsertRow(${table}): ${response.status} ${text.slice(0, 200)}`);
  }
  const data = await response.json().catch(() => null);
  return Array.isArray(data) ? data[0] : data;
}

function hashPin(pin) {
  const normalized = String(pin ?? '').replace(/\s+/g, '').trim();
  const salt = randomUUID().replace(/-/g, '').slice(0, 32);
  const hash = scryptSync(normalized, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

// ── Fixed ids (idempotent upserts) ───────────────────────────────────────────
const SCHOOL_ID    = 'a7510000-0000-4000-8000-000000000001';
const DEV_ROLE_ID  = 'a7510000-0000-4000-8000-0000000000de';
const ADMIN_PROFILE_ID = 'a7510000-0000-4000-8000-0000000000a1';
const ADMIN_ROLE_ID    = 'a7510000-0000-4000-8000-0000000000a2';
const TEACHER_PROFILE_ID = 'a7510000-0000-4000-8000-0000000000b1';
const TEACHER_SCOPE_ID   = 'a7510000-0000-4000-8000-0000000000b2';
const TEACHER_ROLE_ID    = 'a7510000-0000-4000-8000-0000000000b3';
const STUDENT_PROFILE_ID = 'a7510000-0000-4000-8000-0000000000c1';
const STUDENT_ROLE_ID    = 'a7510000-0000-4000-8000-0000000000c2';

// ── Credentials ──────────────────────────────────────────────────────────────
const DEV_EMAIL = 'developer@adithyatest.school';
const DEV_PASSWORD = 'Developer@2026!';
const ADMIN_EMAIL = 'admin@adithyatest.school';
const ADMIN_PASSWORD = 'Admin@2026!';
const TEACHER_EMAIL = 'teacher@adithyatest.school';
const TEACHER_PASSWORD = TEACHER_EMAIL; // initial = email verbatim → forces first-login change
const STUDENT_ROLLCODE = 'ATS.STU.10.A.260001';
const STUDENT_PASSWORD = STUDENT_ROLLCODE.toLowerCase().replace(/[^a-z0-9]/g, '');

function provisionedStudentEmail(rollCode) {
  return `student.ats.${rollCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@vidyapath.local`;
}

async function main() {
  await loadLocalEnvFiles();
  const c = cfg();
  console.log(`[seed_adithya_test_school] target: ${c.url}`);

  // 1. School
  console.log('\n[1/5] School...');
  await upsertRow('schools', {
    id: SCHOOL_ID,
    school_name: 'Adithya test school',
    school_code: 'ATS',
    board: 'CBSE',
    city: 'Thiruvananthapuram',
    state: 'Kerala',
    contact_phone: '9800000001',
    contact_email: ADMIN_EMAIL,
    status: 'active',
  });
  console.log('  ✓ Adithya test school (ATS)');

  // 2. Developer (platform-level; Supabase-based so it survives NODE_ENV=production)
  console.log('\n[2/5] Developer...');
  const devUser = await createAuthUser({ email: DEV_EMAIL, password: DEV_PASSWORD, userMetadata: { role: 'developer' } });
  await updateAuthUserPassword(devUser.id, DEV_PASSWORD);
  await upsertRow('platform_user_roles', {
    id: DEV_ROLE_ID,
    auth_user_id: devUser.id,
    role: 'developer',
    school_id: SCHOOL_ID,
    is_active: true,
  });
  console.log(`  ✓ developer → ${DEV_EMAIL} / ${DEV_PASSWORD}`);

  // 3. Admin
  console.log('\n[3/5] Admin...');
  const adminUser = await createAuthUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userMetadata: { role: 'admin', school_id: SCHOOL_ID } });
  await updateAuthUserPassword(adminUser.id, ADMIN_PASSWORD);
  await upsertRow('school_admin_profiles', {
    id: ADMIN_PROFILE_ID,
    school_id: SCHOOL_ID,
    auth_user_id: adminUser.id,
    auth_email: ADMIN_EMAIL,
    admin_identifier: 'ATSADM001',
    phone: '9800000010',
    name: 'ATS Admin',
    status: 'active',
  });
  await upsertRow('platform_user_roles', {
    id: ADMIN_ROLE_ID, auth_user_id: adminUser.id, role: 'admin', school_id: SCHOOL_ID, profile_id: ADMIN_PROFILE_ID, is_active: true,
  });
  console.log(`  ✓ admin → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  // 4. Base teacher (class 10 Physics scope)
  console.log('\n[4/5] Base teacher...');
  const teacherUser = await createAuthUser({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD, userMetadata: { role: 'teacher', school_id: SCHOOL_ID, name: 'ATS Teacher' } });
  await updateAuthUserPassword(teacherUser.id, TEACHER_PASSWORD);
  await upsertRow('teacher_profiles', {
    id: TEACHER_PROFILE_ID, school_id: SCHOOL_ID, auth_user_id: teacherUser.id, auth_email: TEACHER_EMAIL,
    phone: '9800000020', staff_code: 'ATS.TC.10.PHYS', name: 'ATS Teacher', pin_hash: hashPin('1111'),
    must_change_password: true, status: 'active',
  });
  await upsertRow('teacher_scopes', {
    id: TEACHER_SCOPE_ID, school_id: SCHOOL_ID, teacher_id: TEACHER_PROFILE_ID, class_level: 10, subject: 'Physics', section: null, is_active: true,
  });
  await upsertRow('platform_user_roles', {
    id: TEACHER_ROLE_ID, auth_user_id: teacherUser.id, role: 'teacher', school_id: SCHOOL_ID, profile_id: TEACHER_PROFILE_ID, is_active: true,
  });
  console.log(`  ✓ teacher → ${TEACHER_EMAIL} / ${TEACHER_PASSWORD} (first-login change)`);

  // 5. Base student (class 10 A)
  console.log('\n[5/5] Base student...');
  const studentEmail = provisionedStudentEmail(STUDENT_ROLLCODE);
  const studentUser = await createAuthUser({ email: studentEmail, password: STUDENT_PASSWORD, userMetadata: { role: 'student', school_id: SCHOOL_ID, roll_code: STUDENT_ROLLCODE, name: 'ATS Student' } });
  await updateAuthUserPassword(studentUser.id, STUDENT_PASSWORD);
  await upsertRow('student_profiles', {
    id: STUDENT_PROFILE_ID, school_id: SCHOOL_ID, auth_user_id: studentUser.id, auth_email: studentEmail,
    batch: '2026', roll_no: '001', name: 'ATS Student', roll_code: STUDENT_ROLLCODE, class_level: 10, section: 'A',
    pin_hash: hashPin('0000'), must_change_password: true, status: 'active',
  });
  await upsertRow('platform_user_roles', {
    id: STUDENT_ROLE_ID, auth_user_id: studentUser.id, role: 'student', school_id: SCHOOL_ID, profile_id: STUDENT_PROFILE_ID, is_active: true,
  });
  console.log(`  ✓ student → rollCode=${STUDENT_ROLLCODE} / ${STUDENT_PASSWORD} (first-login change)`);

  // identity counters
  for (const counter of [
    { school_id: SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'A', year_code: '26', next_seq: 21 },
    { school_id: SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'B', year_code: '26', next_seq: 21 },
    { school_id: SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'M', year_code: '26', next_seq: 21 },
    { school_id: SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'B', year_code: '26', next_seq: 21 },
    { school_id: SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'C', year_code: '26', next_seq: 21 },
    { school_id: SCHOOL_ID, role_code: 'TC', class_code: '00', batch_code: 'X', year_code: '26', next_seq: 15 },
  ]) {
    await upsertRow('identity_counters', counter, 'school_id,role_code,class_code,batch_code,year_code').catch(() => {});
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  ADITHYA TEST SCHOOL — CREDENTIALS');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  DEVELOPER  /developer/login  ${DEV_EMAIL} / ${DEV_PASSWORD}`);
  console.log(`  ADMIN      /admin/login      ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}   (school code ATS)`);
  console.log(`  TEACHER    /teacher/login    ${TEACHER_EMAIL} / ${TEACHER_PASSWORD}`);
  console.log(`  STUDENT    /student/login    rollCode=${STUDENT_ROLLCODE} / ${STUDENT_PASSWORD}`);
  console.log('════════════════════════════════════════════════════════');
  console.log('  Next: Admin → Import roster → scripts/seed-data/teachers.csv then students.csv');
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('[seed_adithya_test_school] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
