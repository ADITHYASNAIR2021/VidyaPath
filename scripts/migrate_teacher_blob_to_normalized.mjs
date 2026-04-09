import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const LOCAL_TEACHER_STORE_PATH = path.join(ROOT, 'lib', 'runtime', 'teacher-config.json');

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
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const schema = (process.env.SUPABASE_STATE_SCHEMA || 'public').trim();
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return { url, key, schema };
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
  });
  const text = await response.text().catch(() => '');
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`REST ${pathname} failed: ${response.status} ${text?.slice(0, 220)}`);
  }
  return data;
}

async function readTeacherBlob() {
  try {
    const rows = await fetchRest(
      `app_state?state_key=eq.${encodeURIComponent('teacher_store_v2')}&select=state_json&limit=1`,
      { method: 'GET' }
    );
    if (Array.isArray(rows) && rows[0]?.state_json) return rows[0].state_json;
  } catch {
    // continue local
  }

  try {
    const raw = await fs.readFile(LOCAL_TEACHER_STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureSystemTeacher() {
  const existing = await fetchRest(
    `teacher_profiles?phone=eq.${encodeURIComponent('0000000000')}&select=*&limit=1`,
    { method: 'GET' }
  );
  if (Array.isArray(existing) && existing[0]) return existing[0];

  const pinHash = `scrypt:legacy:${crypto.createHash('sha256').update('0000').digest('hex')}`;
  const inserted = await fetchRest('teacher_profiles?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{
      id: crypto.randomUUID(),
      phone: '0000000000',
      name: 'Legacy Migrated Teacher',
      pin_hash: pinHash,
      status: 'active',
    }]),
  });
  return inserted[0];
}

function guessScopeFromChapter(chapterId) {
  const parts = chapterId.split('-');
  const classPart = Number(parts[0]?.replace(/[^\d]/g, ''));
  let subject = 'Physics';
  if (chapterId.includes('-chem-')) subject = 'Chemistry';
  if (chapterId.includes('-bio-')) subject = 'Biology';
  if (chapterId.includes('-math-')) subject = 'Math';
  return {
    classLevel: classPart === 10 ? 10 : 12,
    subject,
  };
}

async function ensureScope(teacherId, classLevel, subject) {
  const existing = await fetchRest(
    `teacher_scopes?teacher_id=eq.${teacherId}&class_level=eq.${classLevel}&subject=eq.${encodeURIComponent(subject)}&is_active=eq.true&select=*&limit=1`,
    { method: 'GET' }
  );
  if (Array.isArray(existing) && existing[0]) return existing[0];
  const inserted = await fetchRest('teacher_scopes?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{
      id: crypto.randomUUID(),
      teacher_id: teacherId,
      class_level: classLevel,
      subject,
      is_active: true,
    }]),
  });
  return inserted[0];
}

async function insertRows(table, rows) {
  if (rows.length === 0) return;
  await fetchRest(`${table}?select=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
}

async function main() {
  await loadLocalEnvFiles();
  const blob = await readTeacherBlob();
  if (!blob) {
    console.log('No legacy teacher blob found. Nothing to migrate.');
    return;
  }
  const systemTeacher = await ensureSystemTeacher();

  const importantTopics = blob.importantTopics || {};
  const quizLinks = blob.quizLinks || {};
  const announcements = Array.isArray(blob.announcements) ? blob.announcements : [];
  const assignmentPacks = blob.assignmentPacks || {};
  const submissionsByPack = blob.submissionsByPack || {};
  const weeklyPlans = blob.weeklyPlans || {};

  const topicRows = [];
  const quizRows = [];
  const announcementRows = [];
  const packRows = [];
  const submissionRows = [];
  const weeklyPlanRows = [];

  for (const [chapterId, topics] of Object.entries(importantTopics)) {
    const scopeInfo = guessScopeFromChapter(chapterId);
    const scope = await ensureScope(systemTeacher.id, scopeInfo.classLevel, scopeInfo.subject);
    topicRows.push({
      id: crypto.randomUUID(),
      teacher_id: systemTeacher.id,
      scope_id: scope.id,
      class_level: scopeInfo.classLevel,
      subject: scopeInfo.subject,
      chapter_id: chapterId,
      topics: Array.isArray(topics) ? topics : [],
      is_active: Array.isArray(topics) && topics.length > 0,
    });
  }

  for (const [chapterId, url] of Object.entries(quizLinks)) {
    const scopeInfo = guessScopeFromChapter(chapterId);
    const scope = await ensureScope(systemTeacher.id, scopeInfo.classLevel, scopeInfo.subject);
    quizRows.push({
      id: crypto.randomUUID(),
      teacher_id: systemTeacher.id,
      scope_id: scope.id,
      class_level: scopeInfo.classLevel,
      subject: scopeInfo.subject,
      chapter_id: chapterId,
      url: String(url || ''),
      is_active: !!url,
    });
  }

  for (const item of announcements) {
    announcementRows.push({
      id: crypto.randomUUID(),
      teacher_id: systemTeacher.id,
      class_level: 12,
      subject: 'Physics',
      title: String(item.title || 'Announcement'),
      body: String(item.body || ''),
      is_active: true,
      chapter_id: null,
      scope_id: null,
    });
  }

  for (const [packId, payload] of Object.entries(assignmentPacks)) {
    const chapterId = payload.chapterId || 'c12-phy-1';
    const dbPackId = crypto.randomUUID();
    const scopeInfo = guessScopeFromChapter(chapterId);
    const scope = await ensureScope(systemTeacher.id, scopeInfo.classLevel, scopeInfo.subject);
    const migratedPayload = {
      ...payload,
      packId: dbPackId,
      shareUrl: `/practice/assignment/${dbPackId}`,
      printUrl: `/practice/assignment/${dbPackId}?print=1`,
    };
    packRows.push({
      id: dbPackId,
      teacher_id: systemTeacher.id,
      scope_id: scope.id,
      class_level: scopeInfo.classLevel,
      subject: scopeInfo.subject,
      chapter_id: chapterId,
      status: payload.status || 'active',
      payload: migratedPayload,
    });
    const submissions = Array.isArray(submissionsByPack[packId]) ? submissionsByPack[packId] : [];
    for (const sub of submissions) {
      submissionRows.push({
        id: crypto.randomUUID(),
        pack_id: dbPackId,
        submission_code: String(sub.submissionCode || 'LEGACY'),
        answers: Array.isArray(sub.answers) ? sub.answers : [],
        result: {
          scoreEstimate: Number(sub.scoreEstimate || 0),
          mistakes: Array.isArray(sub.mistakes) ? sub.mistakes : [],
          weakTopics: Array.isArray(sub.weakTopics) ? sub.weakTopics : [],
          nextActions: Array.isArray(sub.nextActions) ? sub.nextActions : [],
        },
      });
    }
  }

  for (const payload of Object.values(weeklyPlans)) {
    const chapterId = payload.focusChapterIds?.[0] || 'c12-phy-1';
    const dbPlanId = crypto.randomUUID();
    const scopeInfo = guessScopeFromChapter(chapterId);
    const scope = await ensureScope(systemTeacher.id, scopeInfo.classLevel, scopeInfo.subject);
    const migratedPayload = {
      ...payload,
      planId: dbPlanId,
    };
    weeklyPlanRows.push({
      id: dbPlanId,
      teacher_id: systemTeacher.id,
      scope_id: scope.id,
      class_level: scopeInfo.classLevel,
      subject: scopeInfo.subject,
      status: payload.status || 'active',
      payload: migratedPayload,
    });
  }

  await insertRows('teacher_topic_priority', topicRows);
  await insertRows('teacher_quiz_links', quizRows);
  await insertRows('teacher_announcements', announcementRows);
  await insertRows('teacher_assignment_packs', packRows);
  await insertRows('teacher_submissions', submissionRows);
  await insertRows('teacher_weekly_plans', weeklyPlanRows);

  console.log(`Migrated teacher blob -> normalized tables.
topics=${topicRows.length}
quizLinks=${quizRows.length}
announcements=${announcementRows.length}
packs=${packRows.length}
submissions=${submissionRows.length}
weeklyPlans=${weeklyPlanRows.length}`);
}

main().catch((error) => {
  console.error('[migrate_teacher_blob_to_normalized] failed:', error?.message || error);
  process.exitCode = 1;
});
