import { randomUUID } from 'node:crypto';
import {
  enforceAcademicStreamForClass,
  getSubjectsForAcademicTrack,
  normalizeAcademicStream,
  isSupportedSubject,
  type AcademicStream,
  type SupportedSubject,
} from '@/lib/academic-taxonomy';
import { getChapterById } from '@/lib/data';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

type RowId = string;

type ClassSectionStatus = 'active' | 'inactive' | 'archived';
type TeacherClassRole = 'class_teacher' | 'subject_teacher';
type EnrollmentStatus = 'active' | 'inactive';

interface ClassSectionRow {
  id: RowId;
  school_id: RowId;
  class_level: 10 | 12;
  section: string;
  batch: string | null;
  class_teacher_id: RowId | null;
  notes: string | null;
  status: ClassSectionStatus;
  created_at: string;
  updated_at: string;
}

interface TeacherClassAssignmentRow {
  id: RowId;
  school_id: RowId;
  class_section_id: RowId;
  teacher_id: RowId;
  role: TeacherClassRole;
  subject: SupportedSubject | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StudentSubjectEnrollmentRow {
  id: RowId;
  school_id: RowId;
  student_id: RowId;
  class_section_id: RowId | null;
  subject: SupportedSubject;
  assigned_by_teacher_id: RowId | null;
  status: EnrollmentStatus;
  created_at: string;
  updated_at: string;
}

interface TeacherProfileRow {
  id: RowId;
  name: string;
  school_id: RowId | null;
  status: 'active' | 'inactive';
}

interface StudentProfileRow {
  id: RowId;
  school_id: RowId | null;
  class_level: number;
  section: string | null;
  batch: string | null;
  status: 'active' | 'inactive';
}

const TABLES = {
  classSections: 'class_sections',
  teacherClassAssignments: 'teacher_class_assignments',
  studentSubjectEnrollments: 'student_subject_enrollments',
  teachers: 'teacher_profiles',
  students: 'student_profiles',
};

export interface ClassSectionView {
  id: string;
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  classTeacherId?: string;
  classTeacherName?: string;
  status: ClassSectionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherClassAssignmentView {
  id: string;
  schoolId: string;
  classSectionId: string;
  teacherId: string;
  role: TeacherClassRole;
  subject?: SupportedSubject;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function sanitizeText(value: string, max = 140): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 90);
}

function toClassSectionView(
  row: ClassSectionRow,
  teacherNames: Map<string, string>
): ClassSectionView {
  return {
    id: row.id,
    schoolId: row.school_id,
    classLevel: row.class_level,
    section: row.section,
    batch: row.batch ?? undefined,
    classTeacherId: row.class_teacher_id ?? undefined,
    classTeacherName: row.class_teacher_id ? teacherNames.get(row.class_teacher_id) : undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getDefaultSubjectsForClass(classLevel: 10 | 12, stream?: AcademicStream): SupportedSubject[] {
  return getSubjectsForAcademicTrack(classLevel, stream);
}

async function getTeacherNameMap(schoolId: string): Promise<Map<string, string>> {
  if (!isSupabaseServiceConfigured()) return new Map();
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.teachers, {
    select: 'id,name,school_id,status',
    filters: [{ column: 'school_id', value: schoolId }],
    limit: 4000,
  }).catch(() => []);
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, sanitizeText(row.name || 'Teacher', 120) || 'Teacher');
  }
  return map;
}

export async function listClassSectionsForSchool(schoolId: string): Promise<ClassSectionView[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const scopedSchoolId = sanitizeId(schoolId);
  if (!scopedSchoolId) return [];
  const [rows, teacherNames] = await Promise.all([
    supabaseSelect<ClassSectionRow>(TABLES.classSections, {
      select: '*',
      filters: [{ column: 'school_id', value: scopedSchoolId }],
      orderBy: 'updated_at',
      ascending: false,
      limit: 3000,
    }).catch(() => []),
    getTeacherNameMap(scopedSchoolId),
  ]);
  return rows.map((row) => toClassSectionView(row, teacherNames));
}

export async function listTeacherClassAssignments(
  teacherId: string,
  schoolId?: string
): Promise<TeacherClassAssignmentView[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const scopedTeacherId = sanitizeId(teacherId);
  if (!scopedTeacherId) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'teacher_id', value: scopedTeacherId },
    { column: 'is_active', value: true },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeId(schoolId) });
  const rows = await supabaseSelect<TeacherClassAssignmentRow>(TABLES.teacherClassAssignments, {
    select: '*',
    filters,
    orderBy: 'updated_at',
    ascending: false,
    limit: 4000,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    schoolId: row.school_id,
    classSectionId: row.class_section_id,
    teacherId: row.teacher_id,
    role: row.role,
    subject: row.subject ?? undefined,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listClassSectionsForTeacher(teacherId: string): Promise<{
  managedSections: ClassSectionView[];
  classAssignments: TeacherClassAssignmentView[];
}> {
  if (!isSupabaseServiceConfigured()) {
    return { managedSections: [], classAssignments: [] };
  }
  const scopedTeacherId = sanitizeId(teacherId);
  if (!scopedTeacherId) {
    return { managedSections: [], classAssignments: [] };
  }
  const teacherRows = await supabaseSelect<TeacherProfileRow>(TABLES.teachers, {
    select: 'id,name,school_id,status',
    filters: [{ column: 'id', value: scopedTeacherId }],
    limit: 1,
  }).catch(() => []);
  const teacher = teacherRows[0];
  if (!teacher?.school_id) return { managedSections: [], classAssignments: [] };

  const schoolId = sanitizeId(teacher.school_id);
  const [managedRows, assignments, teacherNames] = await Promise.all([
    supabaseSelect<ClassSectionRow>(TABLES.classSections, {
      select: '*',
      filters: [{ column: 'school_id', value: schoolId }, { column: 'class_teacher_id', value: scopedTeacherId }],
      orderBy: 'updated_at',
      ascending: false,
      limit: 1000,
    }).catch(() => []),
    listTeacherClassAssignments(scopedTeacherId, schoolId),
    getTeacherNameMap(schoolId),
  ]);

  const sectionIds = new Set(managedRows.map((row) => row.id));
  for (const assignment of assignments) sectionIds.add(assignment.classSectionId);

  const sectionRows = await supabaseSelect<ClassSectionRow>(TABLES.classSections, {
    select: '*',
    filters: [{ column: 'school_id', value: schoolId }],
    limit: 3000,
  }).catch(() => []);

  const managedSections = sectionRows
    .filter((row) => sectionIds.has(row.id))
    .map((row) => toClassSectionView(row, teacherNames))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { managedSections, classAssignments: assignments };
}

export async function getClassSectionById(
  classSectionId: string,
  schoolId?: string
): Promise<ClassSectionView | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const scopedId = sanitizeId(classSectionId);
  if (!scopedId) return null;
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: scopedId },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeId(schoolId) });
  const rows = await supabaseSelect<ClassSectionRow>(TABLES.classSections, {
    select: '*',
    filters,
    limit: 1,
  }).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const names = await getTeacherNameMap(row.school_id);
  return toClassSectionView(row, names);
}

export async function createClassSection(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
  notes?: string;
  classTeacherId?: string;
}): Promise<ClassSectionView> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const section = sanitizeText(input.section, 40).toUpperCase();
  const batch = input.batch ? sanitizeText(input.batch, 40).toUpperCase() : null;
  if (!schoolId || !section) throw new Error('schoolId and section are required.');
  if (input.classLevel !== 10 && input.classLevel !== 12) throw new Error('classLevel must be 10 or 12.');
  const [row] = await supabaseInsert<ClassSectionRow>(TABLES.classSections, {
    id: randomUUID(),
    school_id: schoolId,
    class_level: input.classLevel,
    section,
    batch,
    class_teacher_id: input.classTeacherId ? sanitizeId(input.classTeacherId) : null,
    notes: input.notes ? sanitizeText(input.notes, 600) : null,
    status: 'active',
  });
  if (!row) throw new Error('Failed to create class section.');
  const names = await getTeacherNameMap(schoolId);
  return toClassSectionView(row, names);
}

export async function updateClassSection(
  classSectionId: string,
  schoolId: string,
  updates: Partial<{
    section: string;
    batch: string;
    notes: string;
    status: ClassSectionStatus;
    classTeacherId?: string | null;
  }>
): Promise<ClassSectionView | null> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const patch: Record<string, unknown> = {};
  if (typeof updates.section === 'string') patch.section = sanitizeText(updates.section, 40).toUpperCase();
  if (typeof updates.batch === 'string') patch.batch = updates.batch.trim() ? sanitizeText(updates.batch, 40).toUpperCase() : null;
  if (typeof updates.notes === 'string') patch.notes = updates.notes.trim() ? sanitizeText(updates.notes, 600) : null;
  if (updates.status === 'active' || updates.status === 'inactive' || updates.status === 'archived') {
    patch.status = updates.status;
  }
  if (updates.classTeacherId !== undefined) {
    patch.class_teacher_id = updates.classTeacherId ? sanitizeId(updates.classTeacherId) : null;
  }
  if (Object.keys(patch).length === 0) return getClassSectionById(classSectionId, schoolId);
  const rows = await supabaseUpdate<ClassSectionRow>(
    TABLES.classSections,
    patch,
    [{ column: 'id', value: sanitizeId(classSectionId) }, { column: 'school_id', value: sanitizeId(schoolId) }]
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  const names = await getTeacherNameMap(sanitizeId(schoolId));
  return toClassSectionView(row, names);
}

export async function assignTeacherToClassSection(input: {
  schoolId: string;
  classSectionId: string;
  teacherId: string;
  role: TeacherClassRole;
  subject?: SupportedSubject;
}): Promise<TeacherClassAssignmentView> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const classSectionId = sanitizeId(input.classSectionId);
  const teacherId = sanitizeId(input.teacherId);
  if (!schoolId || !classSectionId || !teacherId) throw new Error('schoolId, classSectionId and teacherId are required.');
  if (input.role === 'subject_teacher') {
    if (!input.subject || !isSupportedSubject(input.subject)) throw new Error('Valid subject is required for subject_teacher role.');
  }
  if (input.role === 'class_teacher') {
    await supabaseUpdate<ClassSectionRow>(
      TABLES.classSections,
      { class_teacher_id: teacherId },
      [{ column: 'id', value: classSectionId }, { column: 'school_id', value: schoolId }]
    ).catch(() => []);
  }
  const existingFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: schoolId },
    { column: 'class_section_id', value: classSectionId },
    { column: 'teacher_id', value: teacherId },
    { column: 'role', value: input.role },
  ];
  if (input.role === 'subject_teacher') {
    existingFilters.push({ column: 'subject', value: input.subject as string });
  } else {
    existingFilters.push({ column: 'subject', op: 'is', value: null });
  }
  const existing = await supabaseSelect<TeacherClassAssignmentRow>(TABLES.teacherClassAssignments, {
    select: '*',
    filters: existingFilters,
    limit: 1,
  }).catch(() => []);
  let row: TeacherClassAssignmentRow | null = null;
  if (existing[0]) {
    const updated = await supabaseUpdate<TeacherClassAssignmentRow>(
      TABLES.teacherClassAssignments,
      { is_active: true },
      [{ column: 'id', value: existing[0].id }]
    ).catch(() => []);
    row = updated[0] ?? existing[0];
  } else {
    const inserted = await supabaseInsert<TeacherClassAssignmentRow>(TABLES.teacherClassAssignments, {
      id: randomUUID(),
      school_id: schoolId,
      class_section_id: classSectionId,
      teacher_id: teacherId,
      role: input.role,
      subject: input.role === 'subject_teacher' ? input.subject : null,
      is_active: true,
    });
    row = inserted[0] ?? null;
  }
  if (!row) throw new Error('Failed to assign teacher to class section.');
  return {
    id: row.id,
    schoolId: row.school_id,
    classSectionId: row.class_section_id,
    teacherId: row.teacher_id,
    role: row.role,
    subject: row.subject ?? undefined,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function isTeacherClassTeacherForSection(
  teacherId: string,
  classSectionId: string,
  schoolId?: string
): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const section = await getClassSectionById(classSectionId, schoolId);
  if (!section || section.status !== 'active') return false;
  return section.classTeacherId === sanitizeId(teacherId);
}

async function listStudentsForSection(input: {
  schoolId: string;
  classLevel: 10 | 12;
  section: string;
  batch?: string;
}): Promise<StudentProfileRow[]> {
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'school_id', value: sanitizeId(input.schoolId) },
    { column: 'class_level', value: input.classLevel },
    { column: 'section', value: sanitizeText(input.section, 40).toUpperCase() },
    { column: 'status', value: 'active' },
  ];
  if (input.batch) filters.push({ column: 'batch', value: sanitizeText(input.batch, 40).toUpperCase() });
  return supabaseSelect<StudentProfileRow>(TABLES.students, {
    select: 'id,school_id,class_level,section,batch,status',
    filters,
    limit: 20000,
  }).catch(() => []);
}

export async function setStudentSubjectEnrollmentsForClassSection(input: {
  schoolId: string;
  classSectionId: string;
  subjects: string[];
  assignedByTeacherId?: string;
}): Promise<{ students: number; subjects: string[]; activated: number; deactivated: number }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const classSection = await getClassSectionById(input.classSectionId, schoolId);
  if (!classSection) throw new Error('Class section not found.');
  const subjects = [...new Set(input.subjects.map((subject) => sanitizeText(subject, 60)).filter(isSupportedSubject))];
  if (subjects.length === 0) throw new Error('At least one valid subject is required.');

  const students = await listStudentsForSection({
    schoolId,
    classLevel: classSection.classLevel,
    section: classSection.section,
    batch: classSection.batch,
  });
  if (students.length === 0) {
    return { students: 0, subjects, activated: 0, deactivated: 0 };
  }

  const studentIds = students.map((student) => student.id);
  const existing = await supabaseSelect<StudentSubjectEnrollmentRow>(TABLES.studentSubjectEnrollments, {
    select: '*',
    filters: [{ column: 'school_id', value: schoolId }, { column: 'class_section_id', value: classSection.id }],
    limit: 60000,
  }).catch(() => []);

  let activated = 0;
  let deactivated = 0;
  for (const studentId of studentIds) {
    const studentRows = existing.filter((row) => row.student_id === studentId);
    for (const subject of subjects) {
      const match = studentRows.find((row) => row.subject === subject);
      if (match) {
        if (match.status !== 'active') {
          const rows = await supabaseUpdate<StudentSubjectEnrollmentRow>(
            TABLES.studentSubjectEnrollments,
            { status: 'active', assigned_by_teacher_id: input.assignedByTeacherId ? sanitizeId(input.assignedByTeacherId) : null },
            [{ column: 'id', value: match.id }]
          ).catch(() => []);
          if (rows[0]) activated += 1;
        }
      } else {
        const rows = await supabaseInsert<StudentSubjectEnrollmentRow>(TABLES.studentSubjectEnrollments, {
          id: randomUUID(),
          school_id: schoolId,
          student_id: studentId,
          class_section_id: classSection.id,
          subject,
          assigned_by_teacher_id: input.assignedByTeacherId ? sanitizeId(input.assignedByTeacherId) : null,
          status: 'active',
        });
        if (rows[0]) activated += 1;
      }
    }
    for (const row of studentRows) {
      if (!subjects.includes(row.subject) && row.status === 'active') {
        const rows = await supabaseUpdate<StudentSubjectEnrollmentRow>(
          TABLES.studentSubjectEnrollments,
          { status: 'inactive' },
          [{ column: 'id', value: row.id }]
        ).catch(() => []);
        if (rows[0]) deactivated += 1;
      }
    }
  }
  return { students: students.length, subjects, activated, deactivated };
}

export async function ensureDefaultEnrollmentsForStudent(input: {
  schoolId: string;
  studentId: string;
  classLevel: 10 | 12;
  classSectionId?: string;
  stream?: AcademicStream;
  replaceExisting?: boolean;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const schoolId = sanitizeId(input.schoolId);
  const studentId = sanitizeId(input.studentId);
  if (!schoolId || !studentId) return;
  const stream = input.classLevel === 10
    ? 'foundation'
    : enforceAcademicStreamForClass(input.classLevel, normalizeAcademicStream(input.stream));
  const defaults = getDefaultSubjectsForClass(input.classLevel, stream);
  const defaultsSet = new Set(defaults);
  const existing = await supabaseSelect<StudentSubjectEnrollmentRow>(TABLES.studentSubjectEnrollments, {
    select: '*',
    filters: [{ column: 'school_id', value: schoolId }, { column: 'student_id', value: studentId }],
    limit: 2000,
  }).catch(() => []);
  for (const subject of defaults) {
    const row = existing.find((entry) => entry.subject === subject);
    if (row) {
      if (row.status !== 'active') {
        await supabaseUpdate<StudentSubjectEnrollmentRow>(
          TABLES.studentSubjectEnrollments,
          { status: 'active' },
          [{ column: 'id', value: row.id }]
        ).catch(() => undefined);
      }
      continue;
    }
    await supabaseInsert<StudentSubjectEnrollmentRow>(TABLES.studentSubjectEnrollments, {
      id: randomUUID(),
      school_id: schoolId,
      student_id: studentId,
      class_section_id: input.classSectionId ? sanitizeId(input.classSectionId) : null,
      subject,
      assigned_by_teacher_id: null,
      status: 'active',
    }).catch(() => undefined);
  }

  if (input.replaceExisting === true) {
    for (const row of existing) {
      if (row.status !== 'active') continue;
      if (defaultsSet.has(row.subject)) continue;
      await supabaseUpdate<StudentSubjectEnrollmentRow>(
        TABLES.studentSubjectEnrollments,
        { status: 'inactive' },
        [{ column: 'id', value: row.id }]
      ).catch(() => undefined);
    }
  }
}

export async function getStudentEnrolledSubjects(
  studentId: string,
  schoolId?: string
): Promise<SupportedSubject[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const scopedStudentId = sanitizeId(studentId);
  if (!scopedStudentId) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'student_id', value: scopedStudentId },
    { column: 'status', value: 'active' },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeId(schoolId) });
  const rows = await supabaseSelect<StudentSubjectEnrollmentRow>(TABLES.studentSubjectEnrollments, {
    select: '*',
    filters,
    orderBy: 'subject',
    ascending: true,
    limit: 2000,
  }).catch(() => []);
  const subjects = [...new Set(rows.map((row) => row.subject).filter(isSupportedSubject))];
  return subjects;
}

export function deriveStudentStream(
  subjects: SupportedSubject[],
  classLevel: 10 | 12,
  explicitStream?: AcademicStream
): AcademicStream {
  if (classLevel === 10) return 'foundation';
  const normalizedExplicit = normalizeAcademicStream(explicitStream);
  if (normalizedExplicit && normalizedExplicit !== 'foundation') return normalizedExplicit;

  const set = new Set(subjects);
  const hasPhysics = set.has('Physics');
  const hasChemistry = set.has('Chemistry');
  const hasBiology = set.has('Biology');
  const hasMath = set.has('Math');
  const hasCommerce = ['Accountancy', 'Business Studies', 'Economics'].some((item) => set.has(item as SupportedSubject));
  const hasCoreScience = hasPhysics && hasChemistry;

  if (hasCommerce && !(hasMath || hasBiology || hasCoreScience)) return 'commerce';
  if (hasCoreScience && hasMath && !hasBiology && !hasCommerce) return 'pcm';
  if (hasCoreScience && hasBiology && !hasMath && !hasCommerce) return 'pcb';
  if (hasCoreScience && hasMath && hasBiology && !hasCommerce) return 'interdisciplinary';
  if (hasCommerce) return 'commerce';
  if (hasCoreScience && hasMath) return 'pcm';
  if (hasCoreScience && hasBiology) return 'pcb';
  return 'interdisciplinary';
}

export async function studentCanAccessSubject(input: {
  studentId: string;
  subject: string;
  schoolId?: string;
}): Promise<boolean> {
  if (!isSupportedSubject(input.subject)) return false;
  const subjects = await getStudentEnrolledSubjects(input.studentId, input.schoolId);
  return subjects.includes(input.subject);
}

export async function studentCanAccessChapter(input: {
  studentId: string;
  chapterId: string;
  schoolId?: string;
}): Promise<boolean> {
  const chapter = getChapterById(sanitizeText(input.chapterId, 80));
  if (!chapter) return false;
  return studentCanAccessSubject({
    studentId: input.studentId,
    subject: chapter.subject,
    schoolId: input.schoolId,
  });
}
