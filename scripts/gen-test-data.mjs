#!/usr/bin/env node
/**
 * Generates INSERT SQL for test accounts (school, teacher, student).
 * Run: node scripts/gen-test-data.mjs
 * Paste the output into Supabase SQL Editor > Run.
 *
 * Admin login uses ADMIN_PORTAL_KEY env var — no DB record needed.
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { randomUUID } from 'node:crypto';

// ── Test credentials ──────────────────────────────────────────────────────────
const TEST_PIN_TEACHER  = '123456';  // teacher login pin
const TEST_PIN_STUDENT  = '1234';    // student login pin

const TEST_SCHOOL_CODE  = 'TESTSCH';
const TEST_SCHOOL_NAME  = 'VidyaPath Test School';

const TEACHER_PHONE     = '9999900001'; // login identifier
const TEACHER_NAME      = 'Test Teacher';
const TEACHER_STAFF_CODE = 'TC-TEST-001';

const STUDENT_ROLL_CODE = 'STU-TEST-001';
const STUDENT_ROLL_NO   = 'T001';
const STUDENT_NAME      = 'Test Student';
const STUDENT_CLASS     = 10;  // 10 or 12
const STUDENT_SECTION   = 'A';

// ── Hash function (mirrors lib/auth/pin.ts) ───────────────────────────────────
function hashPin(pin) {
  const normalized = pin.replace(/\s+/g, '').trim();
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(normalized, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

// ── UUIDs ─────────────────────────────────────────────────────────────────────
const schoolId   = randomUUID();
const teacherId  = randomUUID();
const scopeId    = randomUUID();
const studentId  = randomUUID();

const teacherPinHash = hashPin(TEST_PIN_TEACHER);
const studentPinHash = hashPin(TEST_PIN_STUDENT);

// ── Output SQL ────────────────────────────────────────────────────────────────
const sql = `
-- ============================================================
-- VidyaPath Test Data — generated ${new Date().toISOString()}
-- Run once in Supabase SQL Editor.  Safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================

-- 1. School
INSERT INTO public.schools (id, school_name, school_code, board, status)
VALUES (
  '${schoolId}',
  '${TEST_SCHOOL_NAME}',
  '${TEST_SCHOOL_CODE}',
  'CBSE',
  'active'
) ON CONFLICT (school_code) DO NOTHING;

-- 2. Teacher profile
--    Login: phone=${TEACHER_PHONE}  pin=${TEST_PIN_TEACHER}
--    Endpoint: POST /api/teacher/session/login
--    Body: { "identifier": "${TEACHER_PHONE}", "password": "${TEST_PIN_TEACHER}", "schoolCode": "${TEST_SCHOOL_CODE}" }
INSERT INTO public.teacher_profiles (id, school_id, phone, staff_code, name, pin_hash, status)
VALUES (
  '${teacherId}',
  '${schoolId}',
  '${TEACHER_PHONE}',
  '${TEACHER_STAFF_CODE}',
  '${TEACHER_NAME}',
  '${teacherPinHash}',
  'active'
) ON CONFLICT DO NOTHING;

-- 3. Teacher scope (Class 10 Physics)
INSERT INTO public.teacher_scopes (id, school_id, teacher_id, class_level, subject, is_active)
VALUES (
  '${scopeId}',
  '${schoolId}',
  '${teacherId}',
  10,
  'Physics',
  true
) ON CONFLICT DO NOTHING;

-- 4. Student profile
--    Login (roll_code): roll_code=${STUDENT_ROLL_CODE}  pin=${TEST_PIN_STUDENT}
--    Login (roll_no):   schoolCode=${TEST_SCHOOL_CODE}  classLevel=${STUDENT_CLASS}  section=${STUDENT_SECTION}  rollNo=${STUDENT_ROLL_NO}  pin=${TEST_PIN_STUDENT}
--    Endpoint: POST /api/student/session/login
--    Body (roll_code):  { "rollCode": "${STUDENT_ROLL_CODE}", "password": "${TEST_PIN_STUDENT}" }
--    Body (roll_no):    { "rollNo": "${STUDENT_ROLL_NO}", "password": "${TEST_PIN_STUDENT}", "schoolCode": "${TEST_SCHOOL_CODE}", "classLevel": ${STUDENT_CLASS}, "section": "${STUDENT_SECTION}" }
INSERT INTO public.student_profiles (id, school_id, name, roll_code, roll_no, class_level, section, pin_hash, must_change_password, status)
VALUES (
  '${studentId}',
  '${schoolId}',
  '${STUDENT_NAME}',
  '${STUDENT_ROLL_CODE}',
  '${STUDENT_ROLL_NO}',
  ${STUDENT_CLASS},
  '${STUDENT_SECTION}',
  '${studentPinHash}',
  false,
  'active'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- CREDENTIALS SUMMARY
-- ============================================================
-- ADMIN
--   URL:   /admin  (or POST /api/admin/session/bootstrap)
--   Body:  { "key": "<value of ADMIN_PORTAL_KEY in .env.local>" }
--   Note:  ADMIN_PORTAL_KEY is an env var — no DB record needed.
--
-- TEACHER
--   URL:   /teacher  (or POST /api/teacher/session/login)
--   Body:  { "identifier": "${TEACHER_PHONE}", "password": "${TEST_PIN_TEACHER}", "schoolCode": "${TEST_SCHOOL_CODE}" }
--
-- STUDENT (by roll code)
--   URL:   /  (or POST /api/student/session/login)
--   Body:  { "rollCode": "${STUDENT_ROLL_CODE}", "password": "${TEST_PIN_STUDENT}" }
--
-- STUDENT (by roll number + school)
--   Body:  { "rollNo": "${STUDENT_ROLL_NO}", "password": "${TEST_PIN_STUDENT}", "schoolCode": "${TEST_SCHOOL_CODE}", "classLevel": ${STUDENT_CLASS}, "section": "${STUDENT_SECTION}" }
-- ============================================================
`;

console.log(sql);
console.log('-- IDs for reference:');
console.log(`-- schoolId:  ${schoolId}`);
console.log(`-- teacherId: ${teacherId}`);
console.log(`-- studentId: ${studentId}`);
