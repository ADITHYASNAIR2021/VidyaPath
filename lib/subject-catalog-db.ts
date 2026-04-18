import { CLASS_10_SUBJECTS, CLASS_12_SUBJECTS } from '@/lib/academic-taxonomy';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

interface SubjectCatalogRow {
  id: string;
  school_id: string | null;
  class_level: number | null;
  subject: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = 'school_subject_catalog';

function normalizeSubject(subject: string): string {
  return subject.replace(/\s+/g, ' ').trim().slice(0, 80);
}

const DEFAULT_SUBJECTS_BY_CLASS: Record<10 | 12, string[]> = {
  10: [...CLASS_10_SUBJECTS],
  12: [...CLASS_12_SUBJECTS],
};

function subjectMatches(a: string, b: string): boolean {
  return normalizeSubject(a).toLowerCase() === normalizeSubject(b).toLowerCase();
}

export async function getSchoolSubjectCatalog(input: {
  schoolId?: string;
  classLevel?: 10 | 12;
}): Promise<Array<{ classLevel: 10 | 12; subject: string; source: 'default' | 'custom' }>> {
  const schoolId = typeof input.schoolId === 'string' ? input.schoolId.trim() : '';
  const rows = isSupabaseServiceConfigured()
    ? await supabaseSelect<SubjectCatalogRow>(TABLE, {
        select: '*',
        filters: schoolId ? [{ column: 'school_id', value: schoolId }, { column: 'is_active', value: true }] : [{ column: 'is_active', value: true }],
        limit: 5000,
      }).catch(() => [])
    : [];

  const entries: Array<{ classLevel: 10 | 12; subject: string; source: 'default' | 'custom' }> = [];
  const seen = new Set<string>();

  for (const classLevel of [10, 12] as const) {
    if (input.classLevel && input.classLevel !== classLevel) continue;
    for (const subject of DEFAULT_SUBJECTS_BY_CLASS[classLevel]) {
      const normalized = normalizeSubject(subject);
      const key = `${classLevel}|${normalized.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ classLevel, subject: normalized, source: 'default' });
    }
  }

  for (const row of rows) {
    const classLevel = row.class_level === 10 || row.class_level === 12 ? (row.class_level as 10 | 12) : null;
    if (!classLevel) continue;
    if (input.classLevel && input.classLevel !== classLevel) continue;
    const subject = normalizeSubject(row.subject || '');
    if (!subject) continue;
    const key = `${classLevel}|${subject.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ classLevel, subject, source: 'custom' });
  }

  return entries;
}

export async function isSubjectInCatalog(input: {
  schoolId?: string;
  classLevel: 10 | 12;
  subject: string;
}): Promise<boolean> {
  const target = normalizeSubject(input.subject);
  if (!target) return false;
  const catalog = await getSchoolSubjectCatalog({ schoolId: input.schoolId, classLevel: input.classLevel });
  return catalog.some((entry) => entry.classLevel === input.classLevel && subjectMatches(entry.subject, target));
}

export async function listCatalogSubjectsForClass(input: {
  schoolId?: string;
  classLevel: 10 | 12;
}): Promise<string[]> {
  const catalog = await getSchoolSubjectCatalog({ schoolId: input.schoolId, classLevel: input.classLevel });
  return catalog
    .filter((entry) => entry.classLevel === input.classLevel)
    .map((entry) => normalizeSubject(entry.subject));
}

export async function upsertSchoolSubject(input: {
  schoolId: string;
  classLevel: 10 | 12;
  subject: string;
  isActive?: boolean;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const schoolId = input.schoolId.trim();
  const subject = normalizeSubject(input.subject);
  if (!schoolId || !subject) return;

  const existing = await supabaseSelect<SubjectCatalogRow>(TABLE, {
    select: '*',
    filters: [
      { column: 'school_id', value: schoolId },
      { column: 'class_level', value: input.classLevel },
      { column: 'subject', value: subject },
    ],
    limit: 1,
  }).catch(() => []);

  if (existing[0]) {
    await supabaseUpdate<SubjectCatalogRow>(TABLE, {
      is_active: input.isActive !== false,
    }, [{ column: 'id', value: existing[0].id }]).catch(() => []);
    return;
  }

  await supabaseInsert<SubjectCatalogRow>(TABLE, {
    school_id: schoolId,
    class_level: input.classLevel,
    subject,
    is_active: input.isActive !== false,
  }).catch(() => []);
}
