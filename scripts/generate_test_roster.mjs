/**
 * generate_test_roster.mjs
 * Generates import-ready roster CSVs for "Adithya test school" (code ATS).
 *
 *   - scripts/seed-data/students.csv  (100 students: Class 10 A/B, Class 12 PCM/PCB/Commerce, 20 each)
 *   - scripts/seed-data/teachers.csv  (14 teachers: one per class/subject)
 *
 * Columns match app/api/admin/import/roster/route.ts readers.
 * Subjects use '|' separators (parseSubjectList splits on , | ;) to stay CSV-safe.
 * All subjects are in DEFAULT_SUBJECTS_BY_CLASS, so they pass isSubjectInCatalog
 * even with an empty school_subject_catalog.
 *
 * Usage: node scripts/generate_test_roster.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCHOOL_NAME = 'Adithya test school';
const SCHOOL_CODE = 'ATS';
const YEAR = '26'; // 2026 batch
const STUDENT_PASSWORD = 'Student@2026'; // valid: 12 chars, upper+lower+digit+special
const TEACHER_PASSWORD = 'Teacher@2026';

const C10 = ['Physics', 'Chemistry', 'Biology', 'Math', 'English Core', 'Social Science'];
const PCM = ['Physics', 'Chemistry', 'Math', 'English Core'];
const PCB = ['Physics', 'Chemistry', 'Biology', 'English Core'];
const COMMERCE = ['Accountancy', 'Business Studies', 'Economics', 'English Core'];

// Student identity groups. section letter feeds the roll code.
const GROUPS = [
  { classLevel: 10, section: 'A', stream: '', batch: '2026', subjects: C10 },
  { classLevel: 10, section: 'B', stream: '', batch: '2026', subjects: C10 },
  { classLevel: 12, section: 'M', stream: 'pcm', batch: 'PCM', subjects: PCM },
  { classLevel: 12, section: 'B', stream: 'pcb', batch: 'PCB', subjects: PCB },
  { classLevel: 12, section: 'C', stream: 'commerce', batch: 'COMMERCE', subjects: COMMERCE },
];

const FIRST = [
  'Arjun', 'Meena', 'Rohan', 'Priya', 'Karan', 'Ananya', 'Vikram', 'Sneha', 'Aditya', 'Divya',
  'Rahul', 'Pooja', 'Nikhil', 'Kavya', 'Sanjay', 'Riya', 'Manish', 'Ishita', 'Varun', 'Neha',
];
const LAST = [
  'Pillai', 'Krishnan', 'Varma', 'Suresh', 'Nair', 'Menon', 'Iyer', 'Reddy', 'Sharma', 'Gupta',
  'Rao', 'Das', 'Bose', 'Mehta', 'Kapoor', 'Joshi', 'Patel', 'Singh', 'Chandra', 'Mohan',
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','));
  return lines.join('\n') + '\n';
}

// ── Students ────────────────────────────────────────────────────────────────
const studentHeaders = ['name', 'rollNo', 'rollCode', 'classLevel', 'stream', 'section', 'batch', 'subjects', 'password'];
const studentRows = [];
for (const g of GROUPS) {
  for (let i = 1; i <= 20; i += 1) {
    const seq = String(i).padStart(4, '0');
    const rollNo = String(i).padStart(3, '0');
    const rollCode = `${SCHOOL_CODE}.STU.${g.classLevel}.${g.section}.${YEAR}${seq}`;
    const name = `${FIRST[(i - 1) % FIRST.length]} ${LAST[(i * 3 + g.classLevel) % LAST.length]}`;
    studentRows.push({
      name,
      rollNo,
      rollCode,
      classLevel: g.classLevel,
      stream: g.stream,
      section: g.section,
      batch: g.batch,
      subjects: g.subjects.join('|'),
      password: STUDENT_PASSWORD,
    });
  }
}

// ── Teachers ────────────────────────────────────────────────────────────────
const teacherHeaders = ['name', 'email', 'phone', 'staffCode', 'classLevel', 'subject', 'section', 'password'];
const teacherDefs = [
  // Class 10 — one per subject
  { classLevel: 10, subject: 'Physics' },
  { classLevel: 10, subject: 'Chemistry' },
  { classLevel: 10, subject: 'Biology' },
  { classLevel: 10, subject: 'Math' },
  { classLevel: 10, subject: 'English Core' },
  { classLevel: 10, subject: 'Social Science' },
  // Class 12 — covers PCM/PCB/Commerce subjects
  { classLevel: 12, subject: 'Physics' },
  { classLevel: 12, subject: 'Chemistry' },
  { classLevel: 12, subject: 'Biology' },
  { classLevel: 12, subject: 'Math' },
  { classLevel: 12, subject: 'Accountancy' },
  { classLevel: 12, subject: 'Business Studies' },
  { classLevel: 12, subject: 'Economics' },
  { classLevel: 12, subject: 'English Core' },
];
const teacherRows = teacherDefs.map((t, idx) => {
  const subjSlug = t.subject.toLowerCase().replace(/[^a-z]/g, '');
  return {
    name: `${FIRST[idx % FIRST.length]} ${LAST[(idx * 5) % LAST.length]}`,
    email: `${subjSlug}${t.classLevel}@adithyatest.school`,
    phone: `98000${String(10000 + idx).slice(-5)}`,
    staffCode: `${SCHOOL_CODE}.TC.${t.classLevel}.${subjSlug.slice(0, 4).toUpperCase()}`,
    classLevel: t.classLevel,
    subject: t.subject,
    section: '',
    password: TEACHER_PASSWORD,
  };
});

// ── Write ───────────────────────────────────────────────────────────────────
const outDir = path.join(process.cwd(), 'scripts', 'seed-data');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'students.csv'), toCsv(studentHeaders, studentRows), 'utf8');
await writeFile(path.join(outDir, 'teachers.csv'), toCsv(teacherHeaders, teacherRows), 'utf8');

console.log(`School : ${SCHOOL_NAME} (${SCHOOL_CODE})`);
console.log(`Students: ${studentRows.length} -> scripts/seed-data/students.csv`);
console.log(`Teachers: ${teacherRows.length} -> scripts/seed-data/teachers.csv`);
console.log(`Student password (all): ${STUDENT_PASSWORD}`);
console.log(`Teacher password (all): ${TEACHER_PASSWORD}`);
