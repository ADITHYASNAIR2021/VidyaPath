import { randomUUID } from 'node:crypto';
import { hashPin, verifyPin } from '@/lib/auth/pin';
import { getStudentById } from '@/lib/teacher-admin-db';
import {
  getStudentAttendanceSummary,
  listResources,
  listSchoolAnnouncements,
  listSchoolEvents,
  listStudentGrades,
} from '@/lib/school-ops-db';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

const TABLE = 'parent_links';

interface ParentLinkRow {
  id: string;
  student_id: string;
  school_id: string;
  phone: string;
  pin_hash: string;
  name: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at?: string;
}

function sanitizeText(value: string, max = 240): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 100);
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').trim().slice(0, 20);
}

export async function createOrUpdateParentLink(input: {
  schoolId: string;
  studentId: string;
  phone: string;
  pin: string;
  name?: string;
}): Promise<{ parentId: string; phone: string; name?: string }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitizeId(input.schoolId);
  const studentId = sanitizeId(input.studentId);
  const phone = normalizePhone(input.phone);
  const name = input.name ? sanitizeText(input.name, 120) : undefined;
  if (!schoolId || !studentId || !phone) {
    throw new Error('schoolId, studentId, and phone are required.');
  }
  const pinHash = hashPin(input.pin);

  const existing = await supabaseSelect<ParentLinkRow>(TABLE, {
    select: '*',
    filters: [{ column: 'student_id', value: studentId }, { column: 'school_id', value: schoolId }],
    limit: 1,
  }).catch(() => []);

  if (existing[0]?.id) {
    const [updated] = await supabaseUpdate<ParentLinkRow>(
      TABLE,
      {
        phone,
        pin_hash: pinHash,
        name: name ?? null,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      [{ column: 'id', value: existing[0].id }]
    ).catch(() => []);

    return {
      parentId: updated?.id ?? existing[0].id,
      phone: updated?.phone ?? phone,
      name: updated?.name ?? name,
    };
  }

  const [inserted] = await supabaseInsert<ParentLinkRow>(TABLE, {
    id: randomUUID(),
    student_id: studentId,
    school_id: schoolId,
    phone,
    pin_hash: pinHash,
    name: name ?? null,
    status: 'active',
  }).catch(() => []);

  if (!inserted?.id) throw new Error('Failed to create parent link.');
  return {
    parentId: inserted.id,
    phone: inserted.phone,
    name: inserted.name ?? undefined,
  };
}

export async function authenticateParent(input: {
  phone: string;
  pin: string;
  schoolId?: string;
  studentId?: string;
}): Promise<{
  parentId: string;
  studentId: string;
  schoolId: string;
  phone: string;
  parentName?: string;
} | { ambiguous: true } | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const phone = normalizePhone(input.phone);
  const schoolId = input.schoolId ? sanitizeId(input.schoolId) : '';
  const studentId = input.studentId ? sanitizeId(input.studentId) : '';
  if (!phone || !input.pin) return null;

  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'phone', value: phone },
    { column: 'status', value: 'active' },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: schoolId });
  if (studentId) filters.push({ column: 'student_id', value: studentId });

  const rows = await supabaseSelect<ParentLinkRow>(TABLE, {
    select: '*',
    filters,
    limit: 20,
  }).catch(() => []);

  const matches: ParentLinkRow[] = [];
  for (const row of rows) {
    if (!verifyPin(input.pin, row.pin_hash)) continue;
    matches.push(row);
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    return { ambiguous: true };
  }
  const match = matches[0];
  return {
    parentId: match.id,
    studentId: match.student_id,
    schoolId: match.school_id,
    phone: match.phone,
    parentName: match.name ?? undefined,
  };
}

export async function getParentDashboard(input: {
  studentId: string;
  schoolId?: string;
}): Promise<{
  student: {
    id: string;
    name: string;
    classLevel: 10 | 12;
    section?: string;
    rollCode: string;
    batch?: string;
  };
  attendance: {
    percentage: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  grades: Array<{
    subject: string;
    chapterId: string;
    score: number;
    createdAt: string;
    status: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    eventDate: string;
    type: string;
  }>;
  resources: Array<{
    id: string;
    title: string;
    type: string;
    url: string;
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
}> {
  const student = await getStudentById(sanitizeId(input.studentId), input.schoolId ? sanitizeId(input.schoolId) : undefined);
  if (!student) throw new Error('Student not found for parent dashboard.');
  if (!student.schoolId) throw new Error('Student school mapping missing.');

  const [attendance, grades, events, resources, announcementsAll] = await Promise.all([
    getStudentAttendanceSummary({ studentId: student.id, schoolId: student.schoolId, days: 180 }),
    listStudentGrades({ studentId: student.id, rollCode: student.rollCode, schoolId: student.schoolId }),
    listSchoolEvents({
      schoolId: student.schoolId,
      classLevel: student.classLevel,
      section: student.section,
      fromDate: new Date().toISOString().slice(0, 10),
      limit: 25,
    }),
    listResources({
      schoolId: student.schoolId,
      classLevel: student.classLevel,
      section: student.section,
      limit: 15,
    }),
    listSchoolAnnouncements({ schoolId: student.schoolId, limit: 40 }),
  ]);

  const announcements = announcementsAll.filter((item) => {
    if (item.audience === 'all' || item.audience === 'students') return true;
    if (item.audience === 'class10' && student.classLevel === 10) return true;
    if (item.audience === 'class12' && student.classLevel === 12) return true;
    return false;
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      classLevel: student.classLevel,
      section: student.section,
      rollCode: student.rollCode,
      batch: student.batch,
    },
    attendance: {
      percentage: attendance.percentage,
      present: attendance.present,
      absent: attendance.absent,
      late: attendance.late,
      excused: attendance.excused,
      total: attendance.total,
    },
    grades: grades.slice(0, 30).map((item) => ({
      subject: item.subject,
      chapterId: item.chapterId,
      score: item.score,
      createdAt: item.createdAt,
      status: item.status,
    })),
    upcomingEvents: events.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      eventDate: item.eventDate,
      type: item.type,
    })),
    resources: resources.slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      url: item.url,
      createdAt: item.createdAt,
    })),
    announcements: announcements.slice(0, 10).map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
    })),
  };
}

