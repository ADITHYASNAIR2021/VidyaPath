import { supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

export type FriendlyRoleCode = 'STU' | 'TC' | 'AD';

interface SchoolMinimalRow {
  id: string;
  school_code: string;
  school_name: string;
}

interface IdentityCounterRow {
  id: string;
  school_id: string;
  role_code: FriendlyRoleCode;
  class_code: string;
  batch_code: string;
  year_code: string;
  next_seq: number;
}

const TABLES = {
  schools: 'schools',
  counters: 'identity_counters',
};

function compactText(value: string, max = 140): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeLetters(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '');
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function getNameTrigrams(input: string): string[] {
  const letters = normalizeLetters(input);
  const trigrams: string[] = [];
  if (letters.length < 3) return trigrams;
  for (let i = 0; i <= letters.length - 3; i += 1) {
    trigrams.push(letters.slice(i, i + 3));
    if (trigrams.length >= 200) break;
  }
  return trigrams;
}

function deriveAcronym(input: string): string {
  const words = compactText(input, 200).split(' ').filter(Boolean);
  const initials = words.map((word) => normalizeLetters(word).slice(0, 1)).join('');
  const letters = normalizeLetters(initials + input);
  return (letters + 'SCH').slice(0, 3);
}

function randomThreeLetters(seed: number): string {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const a = alpha[(seed * 31 + 7) % alpha.length];
  const b = alpha[(seed * 17 + 11) % alpha.length];
  const c = alpha[(seed * 13 + 19) % alpha.length];
  return `${a}${b}${c}`;
}

function normalizeBatchCode(value?: string | null): string {
  const cleaned = compactText(value || '', 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned || 'X').slice(0, 1);
}

function normalizeClassCode(value?: number | null): string {
  if (value === 10 || value === 12) return String(value);
  return '00';
}

function normalizeYearCode(value?: string): string {
  const cleaned = compactText(value || '', 6).replace(/\D/g, '');
  if (cleaned.length >= 2) return cleaned.slice(-2);
  const year = String(new Date().getFullYear());
  return year.slice(-2);
}

function normalizeRoleCode(value: FriendlyRoleCode): FriendlyRoleCode {
  if (value === 'STU' || value === 'TC' || value === 'AD') return value;
  throw new Error('Unsupported role code.');
}

function normalizeSchoolCodeForId(code: string, fallbackName?: string): string {
  const letters = normalizeLetters(code || '').slice(0, 3);
  if (letters.length === 3) return letters;
  return deriveAcronym(fallbackName || code || 'School');
}

async function isSchoolCodeTaken(code: string): Promise<boolean> {
  const rows = await supabaseSelect<Pick<SchoolMinimalRow, 'id'>>(TABLES.schools, {
    select: 'id',
    filters: [{ column: 'school_code', value: code }],
    limit: 1,
  }).catch(() => []);
  return !!rows[0];
}

export async function generateUniqueThreeLetterSchoolCode(input: {
  schoolName: string;
  preferredCode?: string;
}): Promise<string> {
  const schoolName = compactText(input.schoolName || '', 180);
  if (!schoolName) throw new Error('School name is required to generate school code.');
  const preferred = normalizeLetters(input.preferredCode || '').slice(0, 3);
  const acronym = deriveAcronym(schoolName);
  const letters = normalizeLetters(schoolName);
  const candidates = uniqueValues([
    preferred,
    acronym,
    ...getNameTrigrams(schoolName),
    letters.slice(0, 3),
    letters.slice(-3),
  ]).filter((candidate) => candidate.length === 3);

  for (const candidate of candidates) {
    if (!(await isSchoolCodeTaken(candidate))) return candidate;
  }

  for (let attempt = 1; attempt <= 17576; attempt += 1) {
    const candidate = randomThreeLetters(attempt);
    if (!(await isSchoolCodeTaken(candidate))) return candidate;
  }
  throw new Error('Unable to generate a unique 3-letter school code.');
}

export async function getSchoolIdentityContext(schoolId: string): Promise<{
  schoolId: string;
  schoolName: string;
  schoolCode: string;
}> {
  const normalizedSchoolId = compactText(schoolId, 80);
  if (!normalizedSchoolId) throw new Error('schoolId is required.');
  const rows = await supabaseSelect<SchoolMinimalRow>(TABLES.schools, {
    select: 'id,school_code,school_name',
    filters: [{ column: 'id', value: normalizedSchoolId }],
    limit: 1,
  }).catch(() => []);
  const school = rows[0];
  if (!school) throw new Error('School not found.');
  return {
    schoolId: school.id,
    schoolName: school.school_name,
    schoolCode: normalizeSchoolCodeForId(school.school_code, school.school_name),
  };
}

async function allocateSequence(input: {
  schoolId: string;
  roleCode: FriendlyRoleCode;
  classCode: string;
  batchCode: string;
  yearCode: string;
}): Promise<number> {
  const schoolId = compactText(input.schoolId, 80);
  const roleCode = normalizeRoleCode(input.roleCode);
  const classCode = normalizeClassCode(Number(input.classCode));
  const batchCode = normalizeBatchCode(input.batchCode);
  const yearCode = normalizeYearCode(input.yearCode);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentRows = await supabaseSelect<IdentityCounterRow>(TABLES.counters, {
      select: 'id,school_id,role_code,class_code,batch_code,year_code,next_seq',
      filters: [
        { column: 'school_id', value: schoolId },
        { column: 'role_code', value: roleCode },
        { column: 'class_code', value: classCode },
        { column: 'batch_code', value: batchCode },
        { column: 'year_code', value: yearCode },
      ],
      limit: 1,
    }).catch(() => []);

    const current = currentRows[0];
    if (!current) {
      try {
        const inserted = await supabaseInsert<IdentityCounterRow>(TABLES.counters, {
          school_id: schoolId,
          role_code: roleCode,
          class_code: classCode,
          batch_code: batchCode,
          year_code: yearCode,
          next_seq: 2,
        });
        if (inserted[0]) return 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!/duplicate|conflict|409|unique/i.test(message)) {
          throw error;
        }
      }
      continue;
    }

    const currentSeq = Math.max(1, Number(current.next_seq) || 1);
    const updated = await supabaseUpdate<IdentityCounterRow>(
      TABLES.counters,
      {
        next_seq: currentSeq + 1,
      },
      [
        { column: 'id', value: current.id },
        { column: 'next_seq', value: currentSeq },
      ]
    ).catch(() => []);
    if (updated[0]) return currentSeq;
  }
  throw new Error('Unable to allocate sequence for friendly identity. Please retry.');
}

export function formatFriendlyIdentifier(input: {
  schoolCode: string;
  roleCode: FriendlyRoleCode;
  classCode: string;
  batchCode: string;
  yearCode: string;
  sequence: number;
}): string {
  const schoolCode = normalizeSchoolCodeForId(input.schoolCode);
  const roleCode = normalizeRoleCode(input.roleCode);
  const classCode = normalizeClassCode(Number(input.classCode));
  const batchCode = normalizeBatchCode(input.batchCode);
  const yearCode = normalizeYearCode(input.yearCode);
  const sequence = String(Math.max(1, Math.floor(input.sequence))).padStart(5, '0');
  return `${schoolCode}.${roleCode}.${classCode}.${batchCode}.${yearCode}${sequence}`;
}

export async function issueFriendlyIdentifier(input: {
  schoolId: string;
  roleCode: FriendlyRoleCode;
  classLevel?: 10 | 12;
  batch?: string;
  yearCode?: string;
}): Promise<{
  identifier: string;
  schoolCode: string;
  classCode: string;
  batchCode: string;
  yearCode: string;
  sequence: number;
  sequenceToken: string;
}> {
  const school = await getSchoolIdentityContext(input.schoolId);
  const classCode = normalizeClassCode(input.classLevel);
  const batchCode = normalizeBatchCode(input.batch);
  const yearCode = normalizeYearCode(input.yearCode);
  const sequence = await allocateSequence({
    schoolId: school.schoolId,
    roleCode: input.roleCode,
    classCode,
    batchCode,
    yearCode,
  });
  return {
    identifier: formatFriendlyIdentifier({
      schoolCode: school.schoolCode,
      roleCode: input.roleCode,
      classCode,
      batchCode,
      yearCode,
      sequence,
    }),
    schoolCode: school.schoolCode,
    classCode,
    batchCode,
    yearCode,
    sequence,
    sequenceToken: String(sequence).padStart(5, '0'),
  };
}
