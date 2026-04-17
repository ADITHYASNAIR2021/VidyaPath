/**
 * seed_auth_users.mjs
 * Creates Supabase auth users + profile rows + platform_user_roles for full login testing.
 *
 * Run AFTER clear_supabase_db.mjs (or after seed_supabase_mock_data.mjs).
 * This enables the FULL login → first-login → password-change flow for students and teachers.
 *
 * Usage: node scripts/seed_auth_users.mjs
 *
 * Credentials created:
 * ─────────────────────────────────────────────────────────────────
 * ADMIN (email+password login):
 *   email:    admin@aps.school
 *   password: Admin@APS2026!
 *   Login:    /admin/login  →  identifier=admin@aps.school, password=Admin@APS2026!
 *
 * TEACHER (first-login required):
 *   email:    adithya.teacher@aps.school
 *   password: adithya.teacher@aps.school   (initial = own email verbatim)
 *   Login:    /teacher/login  →  identifier=adithya.teacher@aps.school, password=adithya.teacher@aps.school
 *   → redirected to /teacher/first-login
 *   Current password: adithya.teacher@aps.school
 *   New password: must pass policy (6-18 chars, upper+lower+digit+special)
 *
 * STUDENTS (first-login required):
 *   rollCode → initial password (lowercase, dots stripped):
 *   APS.STU.10.A.2600001 → apsstu10a2600001  (class 10, section A)
 *   APS.STU.10.B.2600500 → apsstu10b2600500  (class 10, section B)
 *   APS.STU.12.A.2600100 → apsstu12a2600100  (class 12, section A)
 *   APS.STU.12.B.2600500 → apsstu12b2600500  (class 12, section B)
 *   Login:    /student/login  →  rollCode=APS.STU.10.A.2600001, password=apsstu10a2600001
 *   → redirected to /student/first-login
 * ─────────────────────────────────────────────────────────────────
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

// ── Supabase Admin Auth API ──────────────────────────────────────────────────

async function createAuthUser({ email, password, userMetadata = {} }) {
  const c = cfg();
  const response = await fetch(`${c.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // If user already exists, look it up
    if (response.status === 422 && JSON.stringify(data).toLowerCase().includes('already')) {
      return await getAuthUserByEmail(email);
    }
    throw new Error(`createAuthUser(${email}): ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function getAuthUserByEmail(email) {
  const c = cfg();
  const response = await fetch(`${c.url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`getAuthUserByEmail(${email}): ${response.status}`);
  const users = data?.users ?? (Array.isArray(data) ? data : []);
  const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`Auth user ${email} not found after creation conflict.`);
  return found;
}

async function updateAuthUserPassword(userId, password) {
  const c = cfg();
  const response = await fetch(`${c.url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`  [WARN] updateAuthUserPassword(${userId}): ${response.status} ${text.slice(0, 100)}`);
  }
}

// ── REST helpers ─────────────────────────────────────────────────────────────

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

function normalizeAuthLocalPart(value, max = 40) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
  return cleaned || randomUUID().slice(0, 12);
}

function buildProvisionedAuthEmail(role, schoolToken, userToken, profileId) {
  const r = normalizeAuthLocalPart(role, 20);
  const s = normalizeAuthLocalPart(schoolToken, 30);
  const u = normalizeAuthLocalPart(userToken, 30);
  const p = normalizeAuthLocalPart(profileId, 36);
  return `${r}.${s}.${u}.${p}@vidyapath.local`;
}

// ── Definitions ───────────────────────────────────────────────────────────────

const APS_SCHOOL_ID   = 'c0aps111-aps1-4ap1-8ap1-aps111111111';
const ADMIN_PROFILE_ID = 'c0apsa01-aps1-4ap1-8ap1-apsadm0001';
const TEACHER_PROFILE_ID = 'c0apst01-aps1-4ap1-8ap1-apstch0001';

const STUDENTS = [
  { id: 'c0apss01-aps1-4ap1-8ap1-apsstud0001', rollCode: 'APS.STU.10.A.2600001', name: 'Arjun Pillai',   classLevel: 10, section: 'A', rollNo: '001' },
  { id: 'c0apss02-aps1-4ap1-8ap1-apsstud0002', rollCode: 'APS.STU.10.B.2600500', name: 'Meena Krishnan', classLevel: 10, section: 'B', rollNo: '500' },
  { id: 'c0apss03-aps1-4ap1-8ap1-apsstud0003', rollCode: 'APS.STU.12.A.2600100', name: 'Rohan Varma',    classLevel: 12, section: 'A', rollNo: '100' },
  { id: 'c0apss04-aps1-4ap1-8ap1-apsstud0004', rollCode: 'APS.STU.12.B.2600500', name: 'Priya Suresh',   classLevel: 12, section: 'B', rollNo: '500' },
];

function studentInitialPassword(rollCode) {
  // mirrors buildInitialStudentPasswordFromLoginId: lowercase, strip non-alphanumeric
  return rollCode.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await loadLocalEnvFiles();
  const c = cfg();
  console.log(`[seed_auth_users] target: ${c.url}`);

  // ── 1. School ──────────────────────────────────────────────────────────────
  console.log('\n[1/4] Ensuring APS school...');
  await upsertRow('schools', {
    id: APS_SCHOOL_ID,
    school_name: 'Adithya Public School',
    school_code: 'APS',
    board: 'CBSE',
    city: 'Thiruvananthapuram',
    state: 'Kerala',
    contact_phone: '9800000001',
    contact_email: 'admin@aps.school',
    status: 'active',
  });
  console.log('  ✓ APS school ready');

  // ── 2. Admin ───────────────────────────────────────────────────────────────
  console.log('\n[2/4] Creating admin (admin@aps.school)...');
  const adminEmail = 'admin@aps.school';
  const adminPassword = 'Admin@APS2026!';
  const adminAuthUser = await createAuthUser({
    email: adminEmail,
    password: adminPassword,
    userMetadata: { role: 'admin', school_id: APS_SCHOOL_ID },
  });
  console.log(`  ✓ auth user: ${adminAuthUser.id}`);

  await upsertRow('school_admin_profiles', {
    id: ADMIN_PROFILE_ID,
    school_id: APS_SCHOOL_ID,
    auth_user_id: adminAuthUser.id,
    auth_email: adminEmail,
    admin_identifier: 'APSADM001',
    phone: '9800000010',
    name: 'APS Admin',
    status: 'active',
  });

  await upsertRow('platform_user_roles', {
    id: randomUUID(),
    auth_user_id: adminAuthUser.id,
    role: 'admin',
    school_id: APS_SCHOOL_ID,
    profile_id: ADMIN_PROFILE_ID,
    is_active: true,
  }, 'auth_user_id,role,school_id');

  console.log('  ✓ admin profile + role ready');
  console.log(`  Login: identifier=${adminEmail}  password=${adminPassword}`);

  // ── 3. Teacher ─────────────────────────────────────────────────────────────
  console.log('\n[3/4] Creating teacher (adithya.teacher@aps.school)...');
  const teacherEmail = 'adithya.teacher@aps.school';
  const teacherInitialPassword = teacherEmail; // email verbatim
  const teacherAuthUser = await createAuthUser({
    email: teacherEmail,
    password: teacherInitialPassword,
    userMetadata: { role: 'teacher', school_id: APS_SCHOOL_ID, name: 'Adithya Nair' },
  });
  // Ensure password matches (in case user already existed with different password)
  await updateAuthUserPassword(teacherAuthUser.id, teacherInitialPassword);
  console.log(`  ✓ auth user: ${teacherAuthUser.id}`);

  await upsertRow('teacher_profiles', {
    id: TEACHER_PROFILE_ID,
    school_id: APS_SCHOOL_ID,
    auth_user_id: teacherAuthUser.id,
    auth_email: teacherEmail,
    phone: '9800000020',
    staff_code: 'APS.TC.00.X.2600001',
    name: 'Adithya Nair',
    pin_hash: hashPin('1111'),
    must_change_password: true,
    status: 'active',
  });

  await upsertRow('teacher_scopes', {
    id: randomUUID(),
    school_id: APS_SCHOOL_ID,
    teacher_id: TEACHER_PROFILE_ID,
    class_level: 10,
    subject: 'Physics',
    section: null,
    is_active: true,
  }, 'teacher_id,class_level,subject,school_id');

  await upsertRow('platform_user_roles', {
    id: randomUUID(),
    auth_user_id: teacherAuthUser.id,
    role: 'teacher',
    school_id: APS_SCHOOL_ID,
    profile_id: TEACHER_PROFILE_ID,
    is_active: true,
  }, 'auth_user_id,role,school_id');

  console.log('  ✓ teacher profile + scope + role ready');
  console.log(`  Login: identifier=${teacherEmail}  password=${teacherInitialPassword}`);
  console.log('  → Will redirect to /teacher/first-login');
  console.log(`  First-login current password: ${teacherInitialPassword}`);

  // ── 4. Students ────────────────────────────────────────────────────────────
  console.log('\n[4/4] Creating students...');
  for (const student of STUDENTS) {
    const initPw = studentInitialPassword(student.rollCode);
    const authEmail = buildProvisionedAuthEmail('student', 'APS', student.rollCode, student.id);

    const authUser = await createAuthUser({
      email: authEmail,
      password: initPw,
      userMetadata: {
        role: 'student',
        school_id: APS_SCHOOL_ID,
        roll_code: student.rollCode,
        name: student.name,
      },
    });
    await updateAuthUserPassword(authUser.id, initPw);

    await upsertRow('student_profiles', {
      id: student.id,
      school_id: APS_SCHOOL_ID,
      auth_user_id: authUser.id,
      auth_email: authEmail,
      batch: '2026',
      roll_no: student.rollNo,
      name: student.name,
      roll_code: student.rollCode,
      class_level: student.classLevel,
      section: student.section,
      pin_hash: hashPin('0000'),
      must_change_password: true,
      status: 'active',
    });

    await upsertRow('platform_user_roles', {
      id: randomUUID(),
      auth_user_id: authUser.id,
      role: 'student',
      school_id: APS_SCHOOL_ID,
      profile_id: student.id,
      is_active: true,
    }, 'auth_user_id,role,school_id');

    console.log(`  ✓ ${student.rollCode} → password: ${initPw}`);
    console.log(`    Login: rollCode=${student.rollCode}  password=${initPw}`);
    console.log('    → Will redirect to /student/first-login');
  }

  // ── Identity counters ──────────────────────────────────────────────────────
  const counters = [
    { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'A', year_code: '26', next_seq: 2 },
    { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'B', year_code: '26', next_seq: 501 },
    { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'A', year_code: '26', next_seq: 101 },
    { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'B', year_code: '26', next_seq: 501 },
    { school_id: APS_SCHOOL_ID, role_code: 'TC',  class_code: '00', batch_code: 'X', year_code: '26', next_seq: 2 },
  ];
  for (const counter of counters) {
    await upsertRow('identity_counters', counter, 'school_id,role_code,class_code,batch_code,year_code').catch(() => {});
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('                   CREDENTIALS SUMMARY');
  console.log('════════════════════════════════════════════════════════');
  console.log('\nADMIN LOGIN  →  /admin/login');
  console.log(`  School code : APS`);
  console.log(`  Email       : ${adminEmail}`);
  console.log(`  Password    : ${adminPassword}`);

  console.log('\nTEACHER LOGIN  →  /teacher/login  (first-login required)');
  console.log(`  School code : APS`);
  console.log(`  Email       : ${teacherEmail}`);
  console.log(`  Password    : ${teacherInitialPassword}`);
  console.log(`  After login : redirect → /teacher/first-login`);
  console.log(`  Enter current password: ${teacherInitialPassword}`);

  console.log('\nSTUDENT LOGIN  →  /student/login  (first-login required)');
  for (const student of STUDENTS) {
    const initPw = studentInitialPassword(student.rollCode);
    console.log(`  rollCode=${student.rollCode}  password=${initPw}`);
  }
  console.log(`  After login : redirect → /student/first-login`);
  console.log('\n════════════════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('[seed_auth_users] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
