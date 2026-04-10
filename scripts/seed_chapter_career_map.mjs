#!/usr/bin/env node
/**
 * Seeds commerce-focused career catalogs and chapter career mapping into Supabase.
 * Requires:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
const SUPABASE_SCHEMA = (process.env.SUPABASE_SCHEMA || process.env.SUPABASE_STATE_SCHEMA || 'public').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const VERIFIED_AT = '2026-04-10';
const OWNER = 'VidyaPath Content Ops';

const tracks = [
  {
    track_code: 'track-commerce-core',
    stream: 'commerce',
    title: 'Commerce Core (CA/CMA/CS/BBA Finance)',
    description: 'Structured pathway for accountancy, management, taxation, and finance careers.',
    source_url: 'https://www.ncs.gov.in/pages/about-us.aspx',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
];

const exams = [
  {
    exam_code: 'ca-foundation',
    track_code: 'track-commerce-core',
    title: 'CA Foundation (ICAI)',
    summary: 'Entry exam for Chartered Accountancy pathway.',
    eligibility: 'Class 12 pass/appearing as per ICAI notifications.',
    schedule: 'As announced by ICAI.',
    official_url: 'https://boslive.icai.org/announcement_details.php?id=484',
    source_url: 'https://boslive.icai.org/announcement_details.php?id=484',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
  {
    exam_code: 'cseet',
    track_code: 'track-commerce-core',
    title: 'CSEET (ICSI)',
    summary: 'Entry exam for Company Secretary pathway.',
    eligibility: 'As per ICSI guidelines.',
    schedule: 'As announced by ICSI.',
    official_url: 'https://www.icsi.edu/',
    source_url: 'https://www.icsi.edu/',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
  {
    exam_code: 'cma-foundation',
    track_code: 'track-commerce-core',
    title: 'CMA Foundation (ICMAI)',
    summary: 'Entry exam for cost and management accounting.',
    eligibility: 'As per ICMAI admission criteria.',
    schedule: 'As announced by ICMAI.',
    official_url: 'https://icmai.in/studentswebsite/mgmtaccexam.php',
    source_url: 'https://icmai.in/studentswebsite/mgmtaccexam.php',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
  {
    exam_code: 'cuet-ug-commerce',
    track_code: 'track-commerce-core',
    title: 'CUET UG (Commerce)',
    summary: 'Commerce domain route for university admissions.',
    eligibility: 'As per CUET UG bulletin.',
    schedule: 'As announced by NTA.',
    official_url: 'https://exams.nta.ac.in/CUET-UG',
    source_url: 'https://exams.nta.ac.in/CUET-UG',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
  {
    exam_code: 'ipmat-indore',
    track_code: 'track-commerce-core',
    title: 'IPM AT (IIM Indore)',
    summary: 'Integrated management admissions route.',
    eligibility: 'As per IIM Indore admissions details.',
    schedule: 'As announced by IIM Indore.',
    official_url: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    source_url: 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/',
    last_verified_at: VERIFIED_AT,
    verification_owner: OWNER,
    status: 'active',
    version: 1,
  },
];

const chapterMap = [
  'c12-acc-1', 'c12-acc-2', 'c12-acc-3', 'c12-acc-4', 'c12-acc-5',
  'c12-bst-1', 'c12-bst-2', 'c12-bst-3', 'c12-bst-4', 'c12-bst-5',
  'c12-eco-1', 'c12-eco-2', 'c12-eco-3', 'c12-eco-4', 'c12-eco-5',
].map((chapter_id) => ({
  chapter_id,
  track_code: 'track-commerce-core',
  pathways: chapter_id.includes('-acc-')
    ? ['CA Foundation', 'CMA Foundation', 'BCom Accounts']
    : chapter_id.includes('-bst-')
      ? ['IPM', 'BBA', 'Management Programs']
      : ['CUET UG Commerce', 'Economics Majors', 'Finance Pathways'],
  relevance: chapter_id.includes('-acc-')
    ? 'Accounting chapter mapped to accountancy and finance pathways.'
    : chapter_id.includes('-bst-')
      ? 'Business chapter mapped to management and entrepreneurship pathways.'
      : 'Economics chapter mapped to commerce and management admissions pathways.',
  source_url: chapter_id.includes('-acc-')
    ? 'https://icmai.in/studentswebsite/mgmtaccexam.php'
    : chapter_id.includes('-bst-')
      ? 'https://iimidr.ac.in/programmes/academic-programmes/five-year-integrated-programme-in-management-ipm/ipm-admissions-details/'
      : 'https://exams.nta.ac.in/CUET-UG',
  last_verified_at: VERIFIED_AT,
  verification_owner: OWNER,
  status: 'active',
  version: 1,
}));

async function upsert(table, rows, onConflict) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      'Accept-Profile': SUPABASE_SCHEMA,
      'Content-Profile': SUPABASE_SCHEMA,
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Upsert failed for ${table}: ${response.status} ${text}`);
  }
}

async function main() {
  await upsert('career_track_catalog', tracks, 'track_code');
  await upsert('career_exam_catalog', exams, 'exam_code');
  await upsert('chapter_career_map', chapterMap, 'chapter_id,track_code');
  console.log(`Seeded tracks=${tracks.length}, exams=${exams.length}, chapter_map=${chapterMap.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
