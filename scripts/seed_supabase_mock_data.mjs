import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, scryptSync } from 'node:crypto';

const ROOT = process.cwd();
const SEED_VERSION = 'mock_seed_v1';

function parseEnvText(text) {
  const out = {};
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
    out[key] = value;
  }
  return out;
}

async function loadLocalEnvFiles() {
  for (const file of [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')]) {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const parsed = parseEnvText(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore
    }
  }
}

function cfg() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).'
    );
  }
  return { url, key, schema };
}

function encodeFilterValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function buildQuery(options = {}) {
  const params = new URLSearchParams();
  if (options.select) params.set('select', options.select);
  if (options.orderBy) params.set('order', `${options.orderBy}.${options.ascending === false ? 'desc' : 'asc'}`);
  if (Number.isFinite(options.limit)) params.set('limit', String(options.limit));
  for (const filter of options.filters ?? []) {
    const op = filter.op || 'eq';
    params.set(filter.column, `${op}.${encodeFilterValue(filter.value)}`);
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

async function fetchRest(pathname, init = {}) {
  const c = cfg();
  const response = await fetch(`${c.url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: c.key,
      Authorization: `Bearer ${c.key}`,
      'Content-Type': 'application/json',
      'Accept-Profile': c.schema,
      'Content-Profile': c.schema,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw new Error(`REST ${pathname} failed: ${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function selectRows(table, options = {}) {
  const query = buildQuery({ select: '*', ...options });
  const rows = await fetchRest(`${table}${query}`, { method: 'GET' });
  return Array.isArray(rows) ? rows : [];
}

async function upsertRows(table, rows, onConflict = 'id') {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const query = onConflict
    ? `?select=*&on_conflict=${encodeURIComponent(onConflict)}`
    : '?select=*';
  try {
    const inserted = await fetchRest(`${table}${query}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    });
    return Array.isArray(inserted) ? inserted : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (table === 'teacher_assignment_packs' && /teacher_assignment_packs_status_check/i.test(message)) {
      throw new Error(
        [
          'Schema mismatch: teacher_assignment_packs.status still uses old constraint.',
          'Run this SQL in Supabase first:',
          "alter table public.teacher_assignment_packs drop constraint if exists teacher_assignment_packs_status_check;",
          "alter table public.teacher_assignment_packs add constraint teacher_assignment_packs_status_check check (status in ('draft','review','published','archived'));",
          "update public.teacher_assignment_packs set status='published' where status='active';",
          '',
          'Then rerun: npm run seed:supabase-mock',
        ].join('\n')
      );
    }
    if (table === 'teacher_submissions' && /teacher_submissions_status_check/i.test(message)) {
      throw new Error(
        [
          'Schema mismatch: teacher_submissions.status still uses old constraint.',
          'Run this SQL in Supabase first:',
          "alter table public.teacher_submissions drop constraint if exists teacher_submissions_status_check;",
          "alter table public.teacher_submissions add constraint teacher_submissions_status_check check (status in ('pending_review','graded','released'));",
          '',
          'Then rerun: npm run seed:supabase-mock',
        ].join('\n')
      );
    }
    throw error;
  }
}

function hashPin(pin) {
  const normalized = String(pin ?? '').replace(/\s+/g, '').trim();
  const salt = randomUUID().replace(/-/g, '').slice(0, 32);
  const hash = scryptSync(normalized, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function makePackPayload(input) {
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const shareUrl = `/practice/assignment/${input.packId}`;
  const printUrl = `${shareUrl}?print=1`;
  return {
    packId: input.packId,
    title: input.title,
    chapterId: input.chapterId,
    classLevel: input.classLevel,
    subject: input.subject,
    section: input.section,
    portion: input.portion,
    questionCount: input.mcqs.length + input.shortAnswers.length + input.longAnswers.length,
    difficultyMix: input.difficultyMix,
    dueDate: input.dueDate,
    includeShortAnswers: input.shortAnswers.length > 0,
    includeFormulaDrill: input.formulaDrill.length > 0,
    mcqs: input.mcqs,
    shortAnswers: input.shortAnswers,
    longAnswers: input.longAnswers,
    formulaDrill: input.formulaDrill,
    commonMistakes: input.commonMistakes,
    answerKey: input.mcqs.map((item) => item.answer),
    questionMeta: input.questionMeta,
    estimatedTimeMinutes: input.estimatedTimeMinutes,
    shareUrl,
    printUrl,
    createdAt,
    updatedAt,
    createdByKeyId: input.createdByKeyId,
    status: input.status,
    feedbackHistory: input.feedbackHistory ?? [],
    approvedByTeacherId: input.approvedByTeacherId,
    approvedAt: input.approvedAt,
    publishedAt: input.publishedAt,
  };
}

async function assertTablesExist() {
  const requiredTables = [
    'schools',
    'school_admin_profiles',
    'platform_user_roles',
    'token_usage_events',
    'app_state',
    'teacher_profiles',
    'teacher_scopes',
    'teacher_activity',
    'teacher_announcements',
    'teacher_quiz_links',
    'teacher_topic_priority',
    'teacher_assignment_packs',
    'teacher_submissions',
    'student_profiles',
    'teacher_question_bank',
    'teacher_weekly_plans',
    'exam_sessions',
    'exam_violations',
    'identity_counters',
  ];
  for (const table of requiredTables) {
    await selectRows(table, { limit: 1 });
  }
}

async function main() {
  await loadLocalEnvFiles();
  await assertTablesExist();

  const ids = {
    schools: {
      s1: 'a1111111-1111-4111-8111-111111111111',
      s2: 'a2222222-2222-4222-8222-222222222222',
    },
    admins: {
      a1: 'b1111111-1111-4111-8111-111111111111',
      a2: 'b2222222-2222-4222-8222-222222222222',
    },
    teachers: {
      t1: 'c1111111-1111-4111-8111-111111111111',
      t2: 'c2222222-2222-4222-8222-222222222222',
      t3: 'c3333333-3333-4333-8333-333333333333',
      t4: 'c4444444-4444-4444-8444-444444444444',
    },
    scopes: {
      s1: 'd1111111-1111-4111-8111-111111111111',
      s2: 'd2222222-2222-4222-8222-222222222222',
      s3: 'd3333333-3333-4333-8333-333333333333',
      s4: 'd4444444-4444-4444-8444-444444444444',
      s5: 'd5555555-5555-4555-8555-555555555555',
      s6: 'd6666666-6666-4666-8666-666666666666',
      s7: 'd7777777-7777-4777-8777-777777777777',
    },
    students: {
      st1: 'e1111111-1111-4111-8111-111111111111',
      st2: 'e2222222-2222-4222-8222-222222222222',
      st3: 'e3333333-3333-4333-8333-333333333333',
      st4: 'e4444444-4444-4444-8444-444444444444',
    },
    packs: {
      p1: 'f1111111-1111-4111-8111-111111111111',
      p2: 'f2222222-2222-4222-8222-222222222222',
      p3: 'f3333333-3333-4333-8333-333333333333',
      p4: 'f4444444-4444-4444-8444-444444444444',
    },
    submissions: {
      su1: 'aa111111-1111-4111-8111-111111111111',
      su2: 'aa222222-2222-4222-8222-222222222222',
      su3: 'aa333333-3333-4333-8333-333333333333',
      su4: 'aa444444-4444-4444-8444-444444444444',
    },
    questionBank: {
      q1: 'ab111111-1111-4111-8111-111111111111',
      q2: 'ab222222-2222-4222-8222-222222222222',
      q3: 'ab333333-3333-4333-8333-333333333333',
      q4: 'ab444444-4444-4444-8444-444444444444',
      q5: 'ab555555-5555-4555-8555-555555555555',
    },
    weeklyPlans: {
      w1: 'ac111111-1111-4111-8111-111111111111',
      w2: 'ac222222-2222-4222-8222-222222222222',
    },
    examSessions: {
      ex1: 'ad111111-1111-4111-8111-111111111111',
      ex2: 'ad222222-2222-4222-8222-222222222222',
    },
    roles: {
      r1: 'ae111111-1111-4111-8111-111111111111',
      r2: 'ae222222-2222-4222-8222-222222222222',
      r3: 'ae333333-3333-4333-8333-333333333333',
      r4: 'ae444444-4444-4444-8444-444444444444',
      r5: 'ae555555-5555-4555-8555-555555555555',
      r6: 'ae666666-6666-4666-8666-666666666666',
      r7: 'ae777777-7777-4777-8777-777777777777',
      r8: 'ae888888-8888-4888-8888-888888888888',
      r9: 'ae999999-9999-4999-8999-999999999999',
    },
    tokens: {
      t1: 'af111111-1111-4111-8111-111111111111',
      t2: 'af222222-2222-4222-8222-222222222222',
      t3: 'af333333-3333-4333-8333-333333333333',
      t4: 'af444444-4444-4444-8444-444444444444',
    },
  };

  const fakeAuthUserIds = {
    developer: 'fa111111-1111-4111-8111-111111111111',
    admin1: 'fa222222-2222-4222-8222-222222222222',
    admin2: 'fa333333-3333-4333-8333-333333333333',
    teacher1: 'fa444444-4444-4444-8444-444444444444',
    teacher2: 'fa555555-5555-4555-8555-555555555555',
    teacher3: 'fa666666-6666-4666-8666-666666666666',
    teacher4: 'fa777777-7777-4777-8777-777777777777',
    student1: 'fa888888-8888-4888-8888-888888888888',
    student2: 'fa999999-9999-4999-8999-999999999999',
  };

  const schools = [
    {
      id: ids.schools.s1,
      school_name: 'VidyaPath Demo Senior Secondary School',
      school_code: 'VPD001',
      board: 'CBSE',
      city: 'Kochi',
      state: 'Kerala',
      contact_phone: '9876500001',
      contact_email: 'admin@vpd001.edu',
      status: 'active',
    },
    {
      id: ids.schools.s2,
      school_name: 'VidyaPath Commerce Academy',
      school_code: 'VPD002',
      board: 'CBSE',
      city: 'Bengaluru',
      state: 'Karnataka',
      contact_phone: '9876500002',
      contact_email: 'admin@vpd002.edu',
      status: 'active',
    },
  ];
  await upsertRows('schools', schools);

  const schoolAdmins = [
    {
      id: ids.admins.a1,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      admin_identifier: 'ADM001',
      phone: '9000000001',
      name: 'Rohit Varma',
      status: 'active',
    },
    {
      id: ids.admins.a2,
      school_id: ids.schools.s2,
      auth_user_id: null,
      auth_email: null,
      admin_identifier: 'ADM002',
      phone: '9000000002',
      name: 'Priya Menon',
      status: 'active',
    },
  ];
  await upsertRows('school_admin_profiles', schoolAdmins);

  const teachers = [
    {
      id: ids.teachers.t1,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      phone: '9001000001',
      staff_code: 'PHY12',
      name: 'Ananya Rao',
      pin_hash: hashPin('2468'),
      status: 'active',
    },
    {
      id: ids.teachers.t2,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      phone: '9001000002',
      staff_code: 'MAT10',
      name: 'Rahul Mehta',
      pin_hash: hashPin('1357'),
      status: 'active',
    },
    {
      id: ids.teachers.t3,
      school_id: ids.schools.s2,
      auth_user_id: null,
      auth_email: null,
      phone: '9002000001',
      staff_code: 'ACC12',
      name: 'Neha Iyer',
      pin_hash: hashPin('8080'),
      status: 'active',
    },
    {
      id: ids.teachers.t4,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      phone: '9001000003',
      staff_code: 'ENG10',
      name: 'Sarah Joseph',
      pin_hash: hashPin('1122'),
      status: 'active',
    },
  ];
  await upsertRows('teacher_profiles', teachers);

  const scopes = [
    { id: ids.scopes.s1, school_id: ids.schools.s1, teacher_id: ids.teachers.t1, class_level: 12, subject: 'Physics', section: 'A', is_active: true },
    { id: ids.scopes.s2, school_id: ids.schools.s1, teacher_id: ids.teachers.t1, class_level: 12, subject: 'Physics', section: null, is_active: true },
    { id: ids.scopes.s3, school_id: ids.schools.s1, teacher_id: ids.teachers.t2, class_level: 10, subject: 'Math', section: 'A', is_active: true },
    { id: ids.scopes.s4, school_id: ids.schools.s1, teacher_id: ids.teachers.t4, class_level: 10, subject: 'English Core', section: 'B', is_active: true },
    { id: ids.scopes.s5, school_id: ids.schools.s2, teacher_id: ids.teachers.t3, class_level: 12, subject: 'Accountancy', section: 'C', is_active: true },
    { id: ids.scopes.s6, school_id: ids.schools.s2, teacher_id: ids.teachers.t3, class_level: 12, subject: 'Economics', section: 'C', is_active: true },
    { id: ids.scopes.s7, school_id: ids.schools.s2, teacher_id: ids.teachers.t3, class_level: 12, subject: 'Business Studies', section: 'C', is_active: true },
  ];
  await upsertRows('teacher_scopes', scopes);

  const students = [
    {
      id: ids.students.st1,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '001',
      name: 'Arjun Nair',
      roll_code: 'C12A001',
      class_level: 12,
      section: 'A',
      pin_hash: hashPin('2244'),
      status: 'active',
    },
    {
      id: ids.students.st2,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      batch: '2028',
      roll_no: '014',
      name: 'Meera Das',
      roll_code: 'C10A014',
      class_level: 10,
      section: 'A',
      pin_hash: hashPin('3311'),
      status: 'active',
    },
    {
      id: ids.students.st3,
      school_id: ids.schools.s2,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '021',
      name: 'Karthik Menon',
      roll_code: 'C12C021',
      class_level: 12,
      section: 'C',
      pin_hash: hashPin('4455'),
      status: 'active',
    },
    {
      id: ids.students.st4,
      school_id: ids.schools.s1,
      auth_user_id: null,
      auth_email: null,
      batch: '2028',
      roll_no: '009',
      name: 'Ana Thomas',
      roll_code: 'C10B009',
      class_level: 10,
      section: 'B',
      pin_hash: hashPin('9900'),
      status: 'active',
    },
  ];
  await upsertRows('student_profiles', students);

  const announcements = [
    {
      id: 'b0aa1111-1111-4111-8111-111111111111',
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s2,
      class_level: 12,
      subject: 'Physics',
      section: null,
      chapter_id: 'c12-phy-1',
      title: 'Electrostatics test on Monday',
      body: 'Revise Coulomb law, electric field lines, and numericals from NCERT examples.',
      is_active: true,
    },
    {
      id: 'b0aa2222-2222-4222-8222-222222222222',
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      chapter_id: 'c12-acc-1',
      title: 'Accountancy ledger drill',
      body: 'Submit ledger balancing worksheet before Friday.',
      is_active: true,
    },
    {
      id: 'b0aa3333-3333-4333-8333-333333333333',
      teacher_id: ids.teachers.t4,
      scope_id: ids.scopes.s4,
      class_level: 10,
      subject: 'English Core',
      section: 'B',
      chapter_id: 'c10-eng-1',
      title: 'Reading comprehension practice',
      body: 'Attempt one unseen passage and write answers in board format.',
      is_active: true,
    },
  ];
  await upsertRows('teacher_announcements', announcements);

  const quizLinks = [
    {
      id: 'b0bb1111-1111-4111-8111-111111111111',
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s2,
      class_level: 12,
      subject: 'Physics',
      section: null,
      chapter_id: 'c12-phy-1',
      url: 'https://forms.gle/demo-physics-c12',
      is_active: true,
    },
    {
      id: 'b0bb2222-2222-4222-8222-222222222222',
      teacher_id: ids.teachers.t2,
      scope_id: ids.scopes.s3,
      class_level: 10,
      subject: 'Math',
      section: 'A',
      chapter_id: 'c10-math-1',
      url: 'https://forms.gle/demo-math-c10',
      is_active: true,
    },
    {
      id: 'b0bb3333-3333-4333-8333-333333333333',
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      chapter_id: 'c12-acc-1',
      url: 'https://forms.gle/demo-acc-c12',
      is_active: true,
    },
  ];
  await upsertRows('teacher_quiz_links', quizLinks);

  const topicPriority = [
    {
      id: 'b0cc1111-1111-4111-8111-111111111111',
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s2,
      class_level: 12,
      subject: 'Physics',
      section: null,
      chapter_id: 'c12-phy-1',
      topics: ['Coulomb law', 'Electric field intensity', 'Gauss theorem basics'],
      is_active: true,
    },
    {
      id: 'b0cc2222-2222-4222-8222-222222222222',
      teacher_id: ids.teachers.t2,
      scope_id: ids.scopes.s3,
      class_level: 10,
      subject: 'Math',
      section: 'A',
      chapter_id: 'c10-math-1',
      topics: ['Real numbers', 'Euclid division lemma', 'HCF and LCM'],
      is_active: true,
    },
    {
      id: 'b0cc3333-3333-4333-8333-333333333333',
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      chapter_id: 'c12-acc-1',
      topics: ['Journal entries', 'Ledger posting', 'Trial balance checks'],
      is_active: true,
    },
  ];
  await upsertRows('teacher_topic_priority', topicPriority);

  const pack1 = makePackPayload({
    packId: ids.packs.p1,
    title: 'Class 12 Physics Electrostatics Drill',
    chapterId: 'c12-phy-1',
    classLevel: 12,
    subject: 'Physics',
    section: 'A',
    portion: 'Electrostatics core numericals',
    difficultyMix: '30% easy, 50% medium, 20% hard',
    dueDate: daysFromNow(5),
    estimatedTimeMinutes: 55,
    createdByKeyId: ids.teachers.t1,
    status: 'published',
    approvedByTeacherId: ids.teachers.t1,
    approvedAt: daysFromNow(-2),
    publishedAt: daysFromNow(-1),
    mcqs: [
      {
        question: 'SI unit of electric field is:',
        options: ['N/C', 'C/N', 'V/C', 'J/C'],
        answer: 0,
        explanation: 'Electric field is force per unit charge.',
      },
      {
        question: 'Gauss law relates electric flux with:',
        options: ['Potential difference', 'Permittivity only', 'Enclosed charge', 'Current'],
        answer: 2,
        explanation: 'Flux through closed surface equals enclosed charge divided by epsilon0.',
      },
    ],
    shortAnswers: ['State Coulomb law and write its vector form.'],
    longAnswers: ['Derive expression for electric field due to an infinite line charge.'],
    formulaDrill: [{ name: 'Coulomb law', latex: 'F = k \\frac{q_1 q_2}{r^2}' }],
    commonMistakes: ['Sign error in vector direction', 'Unit conversion mistakes'],
    questionMeta: {
      Q1: { maxMarks: 1, rubric: 'Correct unit' },
      Q2: { maxMarks: 1, rubric: 'Correct concept statement' },
      Q3: { maxMarks: 3, rubric: 'Law + formula + direction' },
      Q4: { maxMarks: 5, rubric: 'Stepwise derivation with assumptions' },
    },
  });

  const pack2 = makePackPayload({
    packId: ids.packs.p2,
    title: 'Class 10 Math Real Numbers Worksheet',
    chapterId: 'c10-math-1',
    classLevel: 10,
    subject: 'Math',
    section: 'A',
    portion: 'Euclid lemma and applications',
    difficultyMix: '40% easy, 40% medium, 20% hard',
    dueDate: daysFromNow(7),
    estimatedTimeMinutes: 40,
    createdByKeyId: ids.teachers.t2,
    status: 'draft',
    mcqs: [
      {
        question: 'Euclid division lemma states:',
        options: ['a = bq + r', 'a = br + q', 'a = qr + b', 'a = b/r + q'],
        answer: 0,
        explanation: 'For positive integers a and b, a = bq + r, 0 <= r < b.',
      },
    ],
    shortAnswers: ['Find HCF of 96 and 404 using Euclid algorithm.'],
    longAnswers: [],
    formulaDrill: [],
    commonMistakes: ['Wrong remainder condition', 'Stopping Euclid algorithm too early'],
    questionMeta: {
      Q1: { maxMarks: 1 },
      Q2: { maxMarks: 3, rubric: 'Correct iterative steps + final HCF' },
    },
  });

  const pack3 = makePackPayload({
    packId: ids.packs.p3,
    title: 'Class 12 Accountancy Ledger + Trial Balance',
    chapterId: 'c12-acc-1',
    classLevel: 12,
    subject: 'Accountancy',
    section: 'C',
    portion: 'Journal to trial balance',
    difficultyMix: '25% easy, 50% medium, 25% hard',
    dueDate: daysFromNow(4),
    estimatedTimeMinutes: 60,
    createdByKeyId: ids.teachers.t3,
    status: 'review',
    feedbackHistory: [
      {
        id: 'seed-feedback-acc-1',
        feedback: 'Increase one practical transaction and reduce theory wording.',
        createdAt: daysFromNow(-1),
        createdByTeacherId: ids.teachers.t3,
      },
    ],
    approvedByTeacherId: ids.teachers.t3,
    approvedAt: daysFromNow(-1),
    mcqs: [
      {
        question: 'Trial balance is prepared to check:',
        options: ['Profit only', 'Arithmetical accuracy of ledger posting', 'Cash flows', 'Inventory valuation'],
        answer: 1,
        explanation: 'Trial balance checks debit-credit equality after posting.',
      },
    ],
    shortAnswers: ['Post journal entries to ledger and show balancing for two accounts.'],
    longAnswers: ['Prepare trial balance from the given ledger balances.'],
    formulaDrill: [{ name: 'Accounting equation', latex: 'Assets = Liabilities + Capital' }],
    commonMistakes: ['Wrong side posting', 'Omission of balancing c/d'],
    questionMeta: {
      Q1: { maxMarks: 1 },
      Q2: { maxMarks: 4 },
      Q3: { maxMarks: 5 },
    },
  });

  const pack4 = makePackPayload({
    packId: ids.packs.p4,
    title: 'Class 10 English Core Writing Skills Archive Set',
    chapterId: 'c10-eng-1',
    classLevel: 10,
    subject: 'English Core',
    section: 'B',
    portion: 'Notice and analytical paragraph',
    difficultyMix: '50% easy, 30% medium, 20% hard',
    dueDate: daysFromNow(-3),
    estimatedTimeMinutes: 45,
    createdByKeyId: ids.teachers.t4,
    status: 'archived',
    approvedByTeacherId: ids.teachers.t4,
    approvedAt: daysFromNow(-8),
    publishedAt: daysFromNow(-7),
    mcqs: [
      {
        question: 'A formal notice should include:',
        options: ['Date and heading', 'Only slogan', 'Only name', 'Only signature'],
        answer: 0,
        explanation: 'Formal structure needs heading/date/issuer/body.',
      },
    ],
    shortAnswers: ['Write a 50-word formal notice for an inter-school quiz.'],
    longAnswers: ['Write an analytical paragraph using given data.'],
    formulaDrill: [],
    commonMistakes: ['Missing word limit', 'Informal tone in formal writing'],
    questionMeta: {
      Q1: { maxMarks: 1 },
      Q2: { maxMarks: 3 },
      Q3: { maxMarks: 6 },
    },
  });

  const assignmentPacks = [
    {
      id: ids.packs.p1,
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s1,
      class_level: 12,
      subject: 'Physics',
      section: 'A',
      chapter_id: 'c12-phy-1',
      status: 'published',
      payload: pack1,
    },
    {
      id: ids.packs.p2,
      teacher_id: ids.teachers.t2,
      scope_id: ids.scopes.s3,
      class_level: 10,
      subject: 'Math',
      section: 'A',
      chapter_id: 'c10-math-1',
      status: 'draft',
      payload: pack2,
    },
    {
      id: ids.packs.p3,
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      chapter_id: 'c12-acc-1',
      status: 'review',
      payload: pack3,
    },
    {
      id: ids.packs.p4,
      teacher_id: ids.teachers.t4,
      scope_id: ids.scopes.s4,
      class_level: 10,
      subject: 'English Core',
      section: 'B',
      chapter_id: 'c10-eng-1',
      status: 'archived',
      payload: pack4,
    },
  ];
  await upsertRows('teacher_assignment_packs', assignmentPacks);

  const baseQuestionResults = [
    {
      questionNo: 'Q1',
      kind: 'mcq',
      prompt: pack1.mcqs[0].question,
      studentAnswer: 'N/C',
      expectedAnswer: 'N/C',
      verdict: 'correct',
      scoreAwarded: 1,
      maxScore: 1,
      feedback: 'Good.',
    },
    {
      questionNo: 'Q2',
      kind: 'mcq',
      prompt: pack1.mcqs[1].question,
      studentAnswer: 'Permittivity only',
      expectedAnswer: 'Enclosed charge',
      verdict: 'wrong',
      scoreAwarded: 0,
      maxScore: 1,
      feedback: 'Revise Gauss law statement.',
    },
  ];

  const submissions = [
    {
      id: ids.submissions.su1,
      pack_id: ids.packs.p1,
      student_id: ids.students.st1,
      student_name: 'Arjun Nair',
      submission_code: 'C12A001',
      attempt_no: 1,
      status: 'graded',
      answers: [
        { questionNo: 'Q1', answerText: 'N/C' },
        { questionNo: 'Q2', answerText: 'Permittivity only' },
      ],
      result: {
        scoreEstimate: 62,
        mistakes: ['Misread Gauss law relation'],
        weakTopics: ['Gauss law'],
        nextActions: ['Revise chapter summary and attempt 5 MCQs'],
        attemptDetail: {
          questionResults: baseQuestionResults,
          correctCount: 1,
          wrongCount: 1,
          partialCount: 0,
          unansweredCount: 0,
          attemptNo: 1,
          submittedAt: daysFromNow(-1),
        },
        integritySummary: {
          riskLevel: 'low',
          totalViolations: 1,
          violationCounts: { 'tab-hidden': 1 },
          lastViolationAt: daysFromNow(-1),
        },
      },
      grading: {
        gradedByTeacherId: ids.teachers.t1,
        gradedAt: daysFromNow(-1),
        totalScore: 4,
        maxScore: 10,
        percentage: 40,
        questionGrades: [
          { questionNo: 'Q1', scoreAwarded: 1, maxScore: 1, feedback: 'Correct.' },
          { questionNo: 'Q2', scoreAwarded: 0, maxScore: 1, feedback: 'Wrong concept.' },
          { questionNo: 'Q3', scoreAwarded: 1, maxScore: 3, feedback: 'Need proper law statement.' },
          { questionNo: 'Q4', scoreAwarded: 2, maxScore: 5, feedback: 'Derivation incomplete.' },
        ],
      },
      released_at: null,
    },
    {
      id: ids.submissions.su2,
      pack_id: ids.packs.p1,
      student_id: ids.students.st1,
      student_name: 'Arjun Nair',
      submission_code: 'C12A001',
      attempt_no: 2,
      status: 'released',
      answers: [
        { questionNo: 'Q1', answerText: 'N/C' },
        { questionNo: 'Q2', answerText: 'Enclosed charge' },
      ],
      result: {
        scoreEstimate: 84,
        mistakes: ['Minor unit slip in derivation'],
        weakTopics: ['Field derivation'],
        nextActions: ['Practice one hard derivation daily'],
        attemptDetail: {
          questionResults: [
            ...baseQuestionResults.slice(0, 1),
            {
              ...baseQuestionResults[1],
              studentAnswer: 'Enclosed charge',
              verdict: 'correct',
              scoreAwarded: 1,
              feedback: 'Correct after revision.',
            },
          ],
          correctCount: 2,
          wrongCount: 0,
          partialCount: 0,
          unansweredCount: 0,
          attemptNo: 2,
          submittedAt: nowIso(),
        },
        integritySummary: {
          riskLevel: 'low',
          totalViolations: 0,
          violationCounts: {},
        },
      },
      grading: {
        gradedByTeacherId: ids.teachers.t1,
        gradedAt: nowIso(),
        totalScore: 8,
        maxScore: 10,
        percentage: 80,
        questionGrades: [
          { questionNo: 'Q1', scoreAwarded: 1, maxScore: 1, feedback: 'Correct.' },
          { questionNo: 'Q2', scoreAwarded: 1, maxScore: 1, feedback: 'Correct.' },
          { questionNo: 'Q3', scoreAwarded: 2, maxScore: 3, feedback: 'Good progress.' },
          { questionNo: 'Q4', scoreAwarded: 4, maxScore: 5, feedback: 'Almost complete derivation.' },
        ],
      },
      released_at: nowIso(),
    },
    {
      id: ids.submissions.su3,
      pack_id: ids.packs.p2,
      student_id: ids.students.st2,
      student_name: 'Meera Das',
      submission_code: 'C10A014',
      attempt_no: 1,
      status: 'pending_review',
      answers: [{ questionNo: 'Q1', answerText: 'a = bq + r' }],
      result: {
        scoreEstimate: 55,
        mistakes: ['HCF steps incomplete'],
        weakTopics: ['Euclid algorithm'],
        nextActions: ['Write full Euclid steps with remainder chain'],
      },
      grading: {},
      released_at: null,
    },
    {
      id: ids.submissions.su4,
      pack_id: ids.packs.p3,
      student_id: ids.students.st3,
      student_name: 'Karthik Menon',
      submission_code: 'C12C021',
      attempt_no: 1,
      status: 'pending_review',
      answers: [
        { questionNo: 'Q1', answerText: 'Checks arithmetical accuracy.' },
        { questionNo: 'Q2', answerText: 'Ledger posting answer attached.' },
      ],
      result: {
        scoreEstimate: 68,
        mistakes: ['Balancing format issue'],
        weakTopics: ['Trial balance formatting'],
        nextActions: ['Re-practice balancing c/d and b/d presentation'],
      },
      grading: {},
      released_at: null,
    },
  ];
  await upsertRows('teacher_submissions', submissions);

  const questionBank = [
    {
      id: ids.questionBank.q1,
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s1,
      class_level: 12,
      subject: 'Physics',
      section: 'A',
      chapter_id: 'c12-phy-1',
      kind: 'mcq',
      prompt: 'What is the SI unit of electric flux?',
      options: ['N m²/C', 'N/C', 'V/m', 'C/N'],
      answer_index: 0,
      rubric: 'Concept + unit correctness',
      max_marks: 1,
      image_url: null,
      is_active: true,
    },
    {
      id: ids.questionBank.q2,
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s1,
      class_level: 12,
      subject: 'Physics',
      section: 'A',
      chapter_id: 'c12-phy-1',
      kind: 'long',
      prompt: 'Derive electric field due to uniformly charged ring on its axis.',
      options: [],
      answer_index: null,
      rubric: 'Diagram + derivation + final expression',
      max_marks: 5,
      image_url: null,
      is_active: true,
    },
    {
      id: ids.questionBank.q3,
      teacher_id: ids.teachers.t2,
      scope_id: ids.scopes.s3,
      class_level: 10,
      subject: 'Math',
      section: 'A',
      chapter_id: 'c10-math-1',
      kind: 'short',
      prompt: 'Using Euclid algorithm, find HCF of 135 and 225.',
      options: [],
      answer_index: null,
      rubric: 'Correct iterative steps',
      max_marks: 3,
      image_url: null,
      is_active: true,
    },
    {
      id: ids.questionBank.q4,
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      chapter_id: 'c12-acc-1',
      kind: 'short',
      prompt: 'Differentiate between journal and ledger in 3 points.',
      options: [],
      answer_index: null,
      rubric: 'Clear conceptual comparison',
      max_marks: 3,
      image_url: null,
      is_active: true,
    },
    {
      id: ids.questionBank.q5,
      teacher_id: ids.teachers.t4,
      scope_id: ids.scopes.s4,
      class_level: 10,
      subject: 'English Core',
      section: 'B',
      chapter_id: 'c10-eng-1',
      kind: 'long',
      prompt: 'Write an analytical paragraph from tabular data in 120 words.',
      options: [],
      answer_index: null,
      rubric: 'Structure + data interpretation + grammar',
      max_marks: 6,
      image_url: null,
      is_active: true,
    },
  ];
  await upsertRows('teacher_question_bank', questionBank);

  const weeklyPlans = [
    {
      id: ids.weeklyPlans.w1,
      teacher_id: ids.teachers.t1,
      scope_id: ids.scopes.s2,
      class_level: 12,
      subject: 'Physics',
      section: null,
      status: 'active',
      payload: {
        planId: ids.weeklyPlans.w1,
        title: 'Mock legacy weekly plan - Physics',
        classPreset: 'class12-pcm',
        classLevel: 12,
        subject: 'Physics',
        focusChapterIds: ['c12-phy-1', 'c12-phy-2'],
        planWeeks: [
          {
            week: 1,
            focusChapters: ['c12-phy-1'],
            tasks: ['Revise notes', 'Solve 20 PYQs'],
            targetMarks: 12,
            reviewSlots: ['D3 evening'],
            miniTests: ['15-minute MCQ check'],
          },
        ],
        dueDate: daysFromNow(14),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdByKeyId: ids.teachers.t1,
        status: 'active',
      },
    },
    {
      id: ids.weeklyPlans.w2,
      teacher_id: ids.teachers.t3,
      scope_id: ids.scopes.s5,
      class_level: 12,
      subject: 'Accountancy',
      section: 'C',
      status: 'archived',
      payload: {
        planId: ids.weeklyPlans.w2,
        title: 'Mock legacy weekly plan - Accountancy',
        classPreset: 'custom',
        classLevel: 12,
        subject: 'Accountancy',
        focusChapterIds: ['c12-acc-1'],
        planWeeks: [
          {
            week: 1,
            focusChapters: ['c12-acc-1'],
            tasks: ['Journal entries practice', 'Trial balance set'],
            targetMarks: 10,
            reviewSlots: ['D5 afternoon'],
            miniTests: ['Case-based ledger test'],
          },
        ],
        dueDate: daysFromNow(-5),
        createdAt: daysFromNow(-20),
        updatedAt: daysFromNow(-6),
        createdByKeyId: ids.teachers.t3,
        status: 'archived',
      },
    },
  ];
  await upsertRows('teacher_weekly_plans', weeklyPlans);

  const examSessions = [
    {
      id: ids.examSessions.ex1,
      pack_id: ids.packs.p1,
      student_name: 'Arjun Nair',
      submission_code: 'C12A001',
      status: 'submitted',
      violation_counts: { 'tab-hidden': 1, 'fullscreen-exit': 0 },
      total_violations: 1,
      started_at: daysFromNow(-1),
      last_heartbeat_at: daysFromNow(-1),
      submitted_at: daysFromNow(-1),
    },
    {
      id: ids.examSessions.ex2,
      pack_id: ids.packs.p3,
      student_name: 'Karthik Menon',
      submission_code: 'C12C021',
      status: 'active',
      violation_counts: {},
      total_violations: 0,
      started_at: nowIso(),
      last_heartbeat_at: nowIso(),
      submitted_at: null,
    },
  ];
  await upsertRows('exam_sessions', examSessions);

  const examViolations = [
    {
      id: 900001,
      session_id: ids.examSessions.ex1,
      event_type: 'tab-hidden',
      detail: 'left tab for 8 seconds',
      occurred_at: daysFromNow(-1),
    },
    {
      id: 900002,
      session_id: ids.examSessions.ex1,
      event_type: 'window-blur',
      detail: 'focus switched once',
      occurred_at: daysFromNow(-1),
    },
  ];
  await upsertRows('exam_violations', examViolations);

  const teacherActivity = [
    {
      id: 910001,
      teacher_id: ids.teachers.t1,
      actor_type: 'teacher',
      action: 'publish-assignment-pack',
      chapter_id: 'c12-phy-1',
      pack_id: ids.packs.p1,
      metadata: { seed: SEED_VERSION, note: 'Published after review' },
      created_at: daysFromNow(-1),
    },
    {
      id: 910002,
      teacher_id: ids.teachers.t1,
      actor_type: 'teacher',
      action: 'grade-submission',
      chapter_id: 'c12-phy-1',
      pack_id: ids.packs.p1,
      metadata: { seed: SEED_VERSION, submissionId: ids.submissions.su2 },
      created_at: nowIso(),
    },
    {
      id: 910003,
      teacher_id: ids.teachers.t3,
      actor_type: 'teacher',
      action: 'create-assignment-pack',
      chapter_id: 'c12-acc-1',
      pack_id: ids.packs.p3,
      metadata: { seed: SEED_VERSION, status: 'review' },
      created_at: daysFromNow(-2),
    },
  ];
  await upsertRows('teacher_activity', teacherActivity);

  const tokenEvents = [
    {
      id: ids.tokens.t1,
      school_id: ids.schools.s1,
      auth_user_id: fakeAuthUserIds.teacher1,
      role: 'teacher',
      endpoint: '/api/teacher/assignment-pack',
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      request_id: `${SEED_VERSION}-tok-1`,
      prompt_tokens: 480,
      completion_tokens: 290,
      total_tokens: 770,
      estimated: false,
      created_at: nowIso(),
    },
    {
      id: ids.tokens.t2,
      school_id: ids.schools.s1,
      auth_user_id: fakeAuthUserIds.student1,
      role: 'student',
      endpoint: '/api/ai-tutor',
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      request_id: `${SEED_VERSION}-tok-2`,
      prompt_tokens: 320,
      completion_tokens: 410,
      total_tokens: 730,
      estimated: false,
      created_at: nowIso(),
    },
    {
      id: ids.tokens.t3,
      school_id: ids.schools.s2,
      auth_user_id: fakeAuthUserIds.teacher3,
      role: 'teacher',
      endpoint: '/api/chapter-pack',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      request_id: `${SEED_VERSION}-tok-3`,
      prompt_tokens: 250,
      completion_tokens: 200,
      total_tokens: 450,
      estimated: true,
      created_at: nowIso(),
    },
    {
      id: ids.tokens.t4,
      school_id: ids.schools.s2,
      auth_user_id: fakeAuthUserIds.developer,
      role: 'developer',
      endpoint: '/api/developer/usage/tokens',
      provider: 'system',
      model: 'rollup',
      request_id: `${SEED_VERSION}-tok-4`,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated: true,
      created_at: nowIso(),
    },
  ];
  await upsertRows('token_usage_events', tokenEvents);

  const platformRoles = [
    {
      id: ids.roles.r1,
      auth_user_id: fakeAuthUserIds.developer,
      role: 'developer',
      school_id: null,
      profile_id: null,
      is_active: true,
    },
    {
      id: ids.roles.r2,
      auth_user_id: fakeAuthUserIds.admin1,
      role: 'admin',
      school_id: ids.schools.s1,
      profile_id: ids.admins.a1,
      is_active: true,
    },
    {
      id: ids.roles.r3,
      auth_user_id: fakeAuthUserIds.admin2,
      role: 'admin',
      school_id: ids.schools.s2,
      profile_id: ids.admins.a2,
      is_active: true,
    },
    {
      id: ids.roles.r4,
      auth_user_id: fakeAuthUserIds.teacher1,
      role: 'teacher',
      school_id: ids.schools.s1,
      profile_id: ids.teachers.t1,
      is_active: true,
    },
    {
      id: ids.roles.r5,
      auth_user_id: fakeAuthUserIds.teacher2,
      role: 'teacher',
      school_id: ids.schools.s1,
      profile_id: ids.teachers.t2,
      is_active: true,
    },
    {
      id: ids.roles.r6,
      auth_user_id: fakeAuthUserIds.teacher3,
      role: 'teacher',
      school_id: ids.schools.s2,
      profile_id: ids.teachers.t3,
      is_active: true,
    },
    {
      id: ids.roles.r7,
      auth_user_id: fakeAuthUserIds.teacher4,
      role: 'teacher',
      school_id: ids.schools.s1,
      profile_id: ids.teachers.t4,
      is_active: true,
    },
    {
      id: ids.roles.r8,
      auth_user_id: fakeAuthUserIds.student1,
      role: 'student',
      school_id: ids.schools.s1,
      profile_id: ids.students.st1,
      is_active: true,
    },
    {
      id: ids.roles.r9,
      auth_user_id: fakeAuthUserIds.student2,
      role: 'student',
      school_id: ids.schools.s2,
      profile_id: ids.students.st3,
      is_active: true,
    },
  ];
  await upsertRows('platform_user_roles', platformRoles);

  const appStateRows = [
    {
      state_key: 'analytics_store_v1',
      state_json: {
        generatedAt: nowIso(),
        seedVersion: SEED_VERSION,
        chapterViews: {
          'c12-phy-1': 42,
          'c10-math-1': 31,
          'c12-acc-1': 19,
        },
      },
    },
    {
      state_key: 'teacher_store_v2',
      state_json: {
        generatedAt: nowIso(),
        seedVersion: SEED_VERSION,
        note: 'Legacy compatibility state blob for fallback readers.',
      },
    },
  ];
  await upsertRows('app_state', appStateRows, 'state_key');

  // ── APS (Adithya Public School) — new roll-code format demo block ───────────
  const APS_SCHOOL_ID = 'ca0a5111-1111-4111-8111-111111111111';
  const APS_TEACHER_ID = 'ca0a5b01-b001-4b01-8b01-b00100000001';
  const APS_SCOPE_ID   = 'ca0a5333-3333-4333-8333-333333333333';

  await upsertRows('schools', [
    {
      id: APS_SCHOOL_ID,
      school_name: 'Adithya Public School',
      school_code: 'APS',
      board: 'CBSE',
      city: 'Thiruvananthapuram',
      state: 'Kerala',
      contact_phone: '9800000001',
      contact_email: 'admin@aps.edu',
      status: 'active',
    },
  ]);

  await upsertRows('teacher_profiles', [
    {
      id: APS_TEACHER_ID,
      school_id: APS_SCHOOL_ID,
      auth_user_id: null,
      auth_email: null,
      phone: '9800000002',
      staff_code: 'APS.TC.00.X.2600001',
      name: 'Adithya Nair',
      pin_hash: hashPin('1111'),
      must_change_password: false,
      status: 'active',
    },
  ]);

  await upsertRows('teacher_scopes', [
    { id: APS_SCOPE_ID, school_id: APS_SCHOOL_ID, teacher_id: APS_TEACHER_ID, class_level: 10, subject: 'Physics', section: null, is_active: true },
  ]);

  // APS students — new composite roll-code format
  await upsertRows('student_profiles', [
    {
      id: 'ca0a5c01-c001-4c01-8c01-c00100000001',
      school_id: APS_SCHOOL_ID,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '001',
      name: 'Arjun Pillai',
      roll_code: 'APS.STU.10.A.2600001',
      class_level: 10,
      section: 'A',
      pin_hash: hashPin('0000'),
      must_change_password: true,
      status: 'active',
    },
    {
      id: 'ca0a5c02-c002-4c02-8c02-c00200000002',
      school_id: APS_SCHOOL_ID,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '500',
      name: 'Meena Krishnan',
      roll_code: 'APS.STU.10.B.2600500',
      class_level: 10,
      section: 'B',
      pin_hash: hashPin('0000'),
      must_change_password: true,
      status: 'active',
    },
    {
      id: 'ca0a5c03-c003-4c03-8c03-c00300000003',
      school_id: APS_SCHOOL_ID,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '100',
      name: 'Rohan Varma',
      roll_code: 'APS.STU.12.A.2600100',
      class_level: 12,
      section: 'A',
      pin_hash: hashPin('0000'),
      must_change_password: true,
      status: 'active',
    },
    {
      id: 'ca0a5c04-c004-4c04-8c04-c00400000004',
      school_id: APS_SCHOOL_ID,
      auth_user_id: null,
      auth_email: null,
      batch: '2026',
      roll_no: '500',
      name: 'Priya Suresh',
      roll_code: 'APS.STU.12.B.2600500',
      class_level: 12,
      section: 'B',
      pin_hash: hashPin('0000'),
      must_change_password: true,
      status: 'active',
    },
  ]);

  // APS identity counters (next_seq already advanced past seeded students)
  await upsertRows(
    'identity_counters',
    [
      { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'A', year_code: '26', next_seq: 2 },
      { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '10', batch_code: 'B', year_code: '26', next_seq: 501 },
      { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'A', year_code: '26', next_seq: 101 },
      { school_id: APS_SCHOOL_ID, role_code: 'STU', class_code: '12', batch_code: 'B', year_code: '26', next_seq: 501 },
      { school_id: APS_SCHOOL_ID, role_code: 'TC',  class_code: '00', batch_code: 'X', year_code: '26', next_seq: 2 },
    ],
    'school_id,role_code,class_code,batch_code,year_code'
  );
  // ─────────────────────────────────────────────────────────────────────────────

  const counts = await Promise.all([
    selectRows('schools', { limit: 10000 }),
    selectRows('school_admin_profiles', { limit: 10000 }),
    selectRows('teacher_profiles', { limit: 10000 }),
    selectRows('teacher_scopes', { limit: 10000 }),
    selectRows('student_profiles', { limit: 10000 }),
    selectRows('teacher_assignment_packs', { limit: 10000 }),
    selectRows('teacher_submissions', { limit: 10000 }),
    selectRows('teacher_question_bank', { limit: 10000 }),
    selectRows('exam_sessions', { limit: 10000 }),
    selectRows('exam_violations', { limit: 10000 }),
    selectRows('token_usage_events', { limit: 10000 }),
  ]);

  console.log('[seed_supabase_mock_data] completed');
  console.log(`schools=${counts[0].length}, admins=${counts[1].length}, teachers=${counts[2].length}, scopes=${counts[3].length}`);
  console.log(`students=${counts[4].length}, packs=${counts[5].length}, submissions=${counts[6].length}, questionBank=${counts[7].length}`);
  console.log(`examSessions=${counts[8].length}, examViolations=${counts[9].length}, tokenUsage=${counts[10].length}`);
  console.log('--- Mock credentials ---');
  console.log('Teacher login:');
  console.log('  schoolCode=VPD001, identifier=9001000001, password=2468');
  console.log('  schoolCode=VPD001, identifier=9001000002, password=1357');
  console.log('  schoolCode=VPD002, identifier=9002000001, password=8080');
  console.log('Student legacy login (fallback fields):');
  console.log('  rollCode=C12A001, pin=2244');
  console.log('  rollCode=C10A014, pin=3311');
  console.log('  rollCode=C12C021, pin=4455');
  console.log('APS new-format student login (must change password on first login):');
  console.log('  rollCode=APS.STU.10.A.2600001, password=apsstu10a2600001');
  console.log('  rollCode=APS.STU.10.B.2600500, password=apsstu10b2600500');
  console.log('  rollCode=APS.STU.12.A.2600100, password=apsstu12a2600100');
  console.log('  rollCode=APS.STU.12.B.2600500, password=apsstu12b2600500');
  console.log('Admin login: use admin email + password (bootstrap key mode removed).');
}

main().catch((error) => {
  console.error('[seed_supabase_mock_data] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
