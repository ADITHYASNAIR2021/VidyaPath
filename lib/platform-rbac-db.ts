import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';
import { chooseHighestRole, isPlatformRole, type PlatformRole } from '@/lib/auth/roles';
import type { SupportedSubject } from '@/lib/academic-taxonomy';
import { generateUniqueThreeLetterSchoolCode } from '@/lib/auth/friendly-ids';

export interface SchoolProfile {
  id: string;
  schoolName: string;
  schoolCode: string;
  board: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformRoleContext {
  role: Exclude<PlatformRole, 'anonymous'>;
  authUserId: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  profileId?: string;
  displayName?: string;
  classLevel?: 10 | 12;
  section?: string;
  availableRoles: Array<Exclude<PlatformRole, 'anonymous'>>;
}

interface SchoolRow {
  id: string;
  school_name: string;
  school_code: string;
  board: string;
  city: string | null;
  state: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at: string;
  updated_at: string;
}

interface PlatformRoleRow {
  id: string;
  auth_user_id: string;
  role: string;
  school_id: string | null;
  profile_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TeacherProfileMinimalRow {
  id: string;
  name: string;
  status: string;
  school_id: string | null;
  auth_user_id: string | null;
}

interface StudentProfileMinimalRow {
  id: string;
  name: string;
  class_level: number;
  section: string | null;
  status: string;
  school_id: string | null;
  auth_user_id: string | null;
}

interface SchoolAdminMinimalRow {
  id: string;
  name: string;
  status: string;
  school_id: string;
  auth_user_id: string | null;
  phone?: string | null;
  auth_email?: string | null;
  admin_identifier?: string;
}

interface TokenUsageRow {
  id: string;
  school_id: string | null;
  auth_user_id: string | null;
  role: string | null;
  endpoint: string;
  provider: string | null;
  model: string | null;
  request_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated: boolean;
  created_at: string;
}

interface TokenUsageEventInput {
  schoolId?: string;
  authUserId?: string;
  role?: Exclude<PlatformRole, 'anonymous'>;
  endpoint: string;
  provider?: string;
  model?: string;
  requestId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimated?: boolean;
}

const TABLES = {
  schools: 'schools',
  schoolAdmins: 'school_admin_profiles',
  platformRoles: 'platform_user_roles',
  teacherProfiles: 'teacher_profiles',
  studentProfiles: 'student_profiles',
  tokenUsageEvents: 'token_usage_events',
};

function sanitize(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSchoolCode(value: string): string {
  return sanitize(value, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizeThreeLetterSchoolCode(value: string): string {
  return sanitize(value, 8).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function normalizePhoneIdentifier(value: string): string {
  const digits = sanitize(value, 40).replace(/[^\d]/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function toSchoolProfile(row: SchoolRow): SchoolProfile {
  return {
    id: row.id,
    schoolName: row.school_name,
    schoolCode: row.school_code,
    board: row.board,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSchoolById(schoolId: string): Promise<SchoolProfile | null> {
  if (!isSupabaseServiceConfigured() || !schoolId) return null;
  const rows = await supabaseSelect<SchoolRow>(TABLES.schools, {
    select: '*',
    filters: [{ column: 'id', value: schoolId }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ? toSchoolProfile(rows[0]) : null;
}

export async function getSchoolByCode(code: string): Promise<SchoolProfile | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const normalized = normalizeSchoolCode(code);
  if (!normalized) return null;
  const rows = await supabaseSelect<SchoolRow>(TABLES.schools, {
    select: '*',
    filters: [{ column: 'school_code', value: normalized }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ? toSchoolProfile(rows[0]) : null;
}

export async function listSchools(status?: 'active' | 'inactive' | 'archived'): Promise<SchoolProfile[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters = status ? [{ column: 'status', value: status }] : undefined;
  const rows = await supabaseSelect<SchoolRow>(TABLES.schools, {
    select: '*',
    filters,
    orderBy: 'updated_at',
    ascending: false,
    limit: 2000,
  }).catch(() => []);
  return rows.map(toSchoolProfile);
}

export async function createSchool(input: {
  schoolName: string;
  schoolCode?: string;
  board?: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
}): Promise<SchoolProfile> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolName = sanitize(input.schoolName, 140);
  if (!schoolName) throw new Error('Valid schoolName is required.');
  const preferredCode = normalizeThreeLetterSchoolCode(input.schoolCode || '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const schoolCode = await generateUniqueThreeLetterSchoolCode({
      schoolName,
      preferredCode: attempt === 0 ? (preferredCode || undefined) : undefined,
    });
    try {
      const [created] = await supabaseInsert<SchoolRow>(TABLES.schools, {
        school_name: schoolName,
        school_code: schoolCode,
        board: sanitize(input.board || 'CBSE', 40),
        city: input.city ? sanitize(input.city, 80) : null,
        state: input.state ? sanitize(input.state, 80) : null,
        contact_phone: input.contactPhone ? sanitize(input.contactPhone, 30) : null,
        contact_email: input.contactEmail ? sanitize(input.contactEmail, 140) : null,
        status: 'active',
      });
      if (created) return toSchoolProfile(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/duplicate|conflict|409|unique/i.test(message)) {
        throw error;
      }
      if (attempt === 4) throw new Error('Unable to allocate unique school code. Please retry.');
      continue;
    }
  }
  throw new Error('Failed to create school.');
}

export async function updateSchool(
  schoolId: string,
  updates: Partial<{
    schoolName: string;
    schoolCode: string;
    board: string;
    city: string;
    state: string;
    contactPhone: string;
    contactEmail: string;
    status: 'active' | 'inactive' | 'archived';
  }>
): Promise<SchoolProfile | null> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const patch: Record<string, unknown> = {};
  if (typeof updates.schoolName === 'string') patch.school_name = sanitize(updates.schoolName, 140);
  if (typeof updates.schoolCode === 'string') {
    const schoolCode = normalizeThreeLetterSchoolCode(updates.schoolCode);
    if (schoolCode.length !== 3) throw new Error('schoolCode must be exactly 3 letters.');
    patch.school_code = schoolCode;
  }
  if (typeof updates.board === 'string') patch.board = sanitize(updates.board, 40);
  if (typeof updates.city === 'string') patch.city = sanitize(updates.city, 80);
  if (typeof updates.state === 'string') patch.state = sanitize(updates.state, 80);
  if (typeof updates.contactPhone === 'string') patch.contact_phone = sanitize(updates.contactPhone, 30);
  if (typeof updates.contactEmail === 'string') patch.contact_email = sanitize(updates.contactEmail, 140);
  if (updates.status === 'active' || updates.status === 'inactive' || updates.status === 'archived') {
    patch.status = updates.status;
  }
  if (Object.keys(patch).length === 0) {
    return getSchoolById(schoolId);
  }
  const rows = await supabaseUpdate<SchoolRow>(TABLES.schools, patch, [{ column: 'id', value: schoolId }]).catch(() => []);
  return rows[0] ? toSchoolProfile(rows[0]) : null;
}

export async function softResetOperationalData(): Promise<{
  archivedSchools: number;
  deactivatedRoles: number;
  inactiveTeachers: number;
  inactiveStudents: number;
  inactiveAdmins: number;
}> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const [schools, roles, teachers, students, admins] = await Promise.all([
    supabaseUpdate<SchoolRow>(TABLES.schools, { status: 'archived' }, [{ column: 'status', op: 'neq', value: 'archived' }]).catch(() => []),
    supabaseUpdate<PlatformRoleRow>(TABLES.platformRoles, { is_active: false }, [{ column: 'is_active', value: true }]).catch(() => []),
    supabaseUpdate<TeacherProfileMinimalRow>(TABLES.teacherProfiles, { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => []),
    supabaseUpdate<StudentProfileMinimalRow>(TABLES.studentProfiles, { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => []),
    supabaseUpdate<SchoolAdminMinimalRow>(TABLES.schoolAdmins, { status: 'inactive' }, [{ column: 'status', value: 'active' }]).catch(() => []),
  ]);
  return {
    archivedSchools: schools.length,
    deactivatedRoles: roles.length,
    inactiveTeachers: teachers.length,
    inactiveStudents: students.length,
    inactiveAdmins: admins.length,
  };
}

export async function resolveRoleContextByAuthUserId(authUserId: string): Promise<PlatformRoleContext | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const normalizedId = sanitize(authUserId, 90);
  if (!normalizedId) return null;
  const roleRows = await supabaseSelect<PlatformRoleRow>(TABLES.platformRoles, {
    select: '*',
    filters: [{ column: 'auth_user_id', value: normalizedId }, { column: 'is_active', value: true }],
    orderBy: 'created_at',
    ascending: false,
    limit: 100,
  }).catch(() => []);

  const allRoles = roleRows
    .map((row) => (isPlatformRole(row.role) ? row.role : null))
    .filter((role): role is Exclude<PlatformRole, 'anonymous'> => !!role);
  const chosenRole = chooseHighestRole(allRoles);
  if (!chosenRole) return null;
  const chosen = roleRows.find((row) => row.role === chosenRole) ?? roleRows[0];
  if (!chosen) return null;

  const school = chosen.school_id ? await getSchoolById(chosen.school_id) : null;
  const contextBase: PlatformRoleContext = {
    role: chosenRole,
    authUserId: normalizedId,
    schoolId: chosen.school_id ?? undefined,
    schoolCode: school?.schoolCode,
    schoolName: school?.schoolName,
    profileId: chosen.profile_id ?? undefined,
    availableRoles: Array.from(new Set(allRoles)),
  };

  if (chosenRole === 'teacher' && chosen.profile_id) {
    const rows = await supabaseSelect<TeacherProfileMinimalRow>(TABLES.teacherProfiles, {
      select: 'id,name,status,school_id,auth_user_id',
      filters: [{ column: 'id', value: chosen.profile_id }],
      limit: 1,
    }).catch(() => []);
    const teacher = rows[0];
    if (!teacher || teacher.status !== 'active') return null;
    return {
      ...contextBase,
      schoolId: teacher.school_id ?? contextBase.schoolId,
      displayName: teacher.name,
      profileId: teacher.id,
    };
  }

  if (chosenRole === 'student' && chosen.profile_id) {
    const rows = await supabaseSelect<StudentProfileMinimalRow>(TABLES.studentProfiles, {
      select: 'id,name,class_level,section,status,school_id,auth_user_id',
      filters: [{ column: 'id', value: chosen.profile_id }],
      limit: 1,
    }).catch(() => []);
    const student = rows[0];
    if (!student || student.status !== 'active' || (student.class_level !== 10 && student.class_level !== 12)) {
      return null;
    }
    return {
      ...contextBase,
      schoolId: student.school_id ?? contextBase.schoolId,
      displayName: student.name,
      profileId: student.id,
      classLevel: student.class_level as 10 | 12,
      section: student.section ?? undefined,
    };
  }

  if (chosenRole === 'admin' && chosen.profile_id) {
    const rows = await supabaseSelect<SchoolAdminMinimalRow>(TABLES.schoolAdmins, {
      select: 'id,name,status,school_id,auth_user_id',
      filters: [{ column: 'id', value: chosen.profile_id }],
      limit: 1,
    }).catch(() => []);
    const admin = rows[0];
    if (!admin || admin.status !== 'active') return null;
    return {
      ...contextBase,
      schoolId: admin.school_id ?? contextBase.schoolId,
      displayName: admin.name,
      profileId: admin.id,
    };
  }

  return contextBase;
}

export async function findTeacherAuthIdentity(input: {
  schoolCode: string;
  identifier: string;
}): Promise<{ authEmail: string; teacherId: string; schoolId: string } | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const school = await getSchoolByCode(input.schoolCode);
  if (!school || school.status !== 'active') return null;
  const identifier = sanitize(input.identifier, 80);
  const normalizedIdentifier = identifier.toUpperCase();
  const normalizedEmail = identifier.toLowerCase();
  const normalizedPhone = normalizePhoneIdentifier(identifier);
  if (!identifier) return null;
  const rows = await supabaseSelect<Array<{
    id: string;
    school_id: string | null;
    status: string;
    auth_email: string | null;
    phone: string;
    staff_code: string | null;
  }>[number]>(TABLES.teacherProfiles, {
    select: 'id,school_id,status,auth_email,phone,staff_code',
    filters: [{ column: 'school_id', value: school.id }, { column: 'status', value: 'active' }],
    limit: 1000,
  }).catch(() => []);
  const matched = rows.find((row) => {
    const phone = normalizePhoneIdentifier(row.phone || '');
    const staff = sanitize(row.staff_code || '', 80).toUpperCase();
    const authEmail = sanitize(row.auth_email || '', 160).toLowerCase();
    return (normalizedPhone ? phone === normalizedPhone : false) || staff === normalizedIdentifier || authEmail === normalizedEmail;
  });
  if (!matched || !matched.auth_email) return null;
  return { authEmail: matched.auth_email, teacherId: matched.id, schoolId: school.id };
}

export async function findTeacherAuthIdentities(input: {
  identifier: string;
  schoolCode?: string;
}): Promise<Array<{ authEmail: string; teacherId: string; schoolId: string }>> {
  if (!isSupabaseServiceConfigured()) return [];
  const identifier = sanitize(input.identifier, 80);
  const normalizedIdentifier = identifier.toUpperCase();
  const normalizedEmail = identifier.toLowerCase();
  const normalizedPhone = normalizePhoneIdentifier(identifier);
  if (!identifier) return [];
  const school = input.schoolCode ? await getSchoolByCode(input.schoolCode) : null;
  if (input.schoolCode && (!school || school.status !== 'active')) return [];
  const filters: Array<{ column: string; value: string }> = [{ column: 'status', value: 'active' }];
  if (school?.id) filters.push({ column: 'school_id', value: school.id });
  const rows = await supabaseSelect<Array<{
    id: string;
    school_id: string | null;
    auth_email: string | null;
    phone: string;
    staff_code: string | null;
  }>[number]>(TABLES.teacherProfiles, {
    select: 'id,school_id,auth_email,phone,staff_code',
    filters,
    limit: 3000,
  }).catch(() => []);
  return rows
    .filter((row) => {
      const phone = normalizePhoneIdentifier(row.phone || '');
      const staff = sanitize(row.staff_code || '', 80).toUpperCase();
      const authEmail = sanitize(row.auth_email || '', 160).toLowerCase();
      return ((normalizedPhone ? phone === normalizedPhone : false) || staff === normalizedIdentifier || authEmail === normalizedEmail) && !!row.auth_email && !!row.school_id;
    })
    .map((row) => ({
      authEmail: String(row.auth_email),
      teacherId: row.id,
      schoolId: String(row.school_id),
    }));
}

export async function findStudentAuthIdentity(input: {
  schoolCode: string;
  classLevel: 10 | 12;
  section?: string;
  batch?: string;
  rollNo: string;
}): Promise<{ authEmail: string; studentId: string; schoolId: string } | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const school = await getSchoolByCode(input.schoolCode);
  if (!school || school.status !== 'active') return null;
  const rollNo = sanitize(input.rollNo, 50).toUpperCase();
  if (!rollNo) return null;
  const filters: Array<{ column: string; value: string | number }> = [
    { column: 'school_id', value: school.id },
    { column: 'class_level', value: input.classLevel },
    { column: 'status', value: 'active' },
    { column: 'roll_no', value: rollNo },
  ];
  if (input.section) filters.push({ column: 'section', value: sanitize(input.section, 20) });
  if (input.batch) filters.push({ column: 'batch', value: sanitize(input.batch, 30) });
  const rows = await supabaseSelect<Array<{
    id: string;
    school_id: string | null;
    auth_email: string | null;
  }>[number]>(TABLES.studentProfiles, {
    select: 'id,school_id,auth_email',
    filters,
    limit: 1,
  }).catch(() => []);
  const row = rows[0];
  if (!row || !row.auth_email) return null;
  return { authEmail: row.auth_email, studentId: row.id, schoolId: school.id };
}

export async function findStudentAuthIdentitiesByRollNo(input: {
  rollNo: string;
  schoolCode?: string;
  classLevel?: 10 | 12;
  section?: string;
  batch?: string;
}): Promise<Array<{ authEmail: string; studentId: string; schoolId: string }>> {
  if (!isSupabaseServiceConfigured()) return [];
  const rollNo = sanitize(input.rollNo, 50).toUpperCase();
  if (!rollNo) return [];
  const school = input.schoolCode ? await getSchoolByCode(input.schoolCode) : null;
  if (input.schoolCode && (!school || school.status !== 'active')) return [];
  const filters: Array<{ column: string; value: string | number }> = [{ column: 'status', value: 'active' }];
  if (school?.id) filters.push({ column: 'school_id', value: school.id });
  if (input.classLevel === 10 || input.classLevel === 12) filters.push({ column: 'class_level', value: input.classLevel });
  if (input.section) filters.push({ column: 'section', value: sanitize(input.section, 20) });
  if (input.batch) filters.push({ column: 'batch', value: sanitize(input.batch, 30) });
  filters.push({ column: 'roll_no', value: rollNo });
  const rows = await supabaseSelect<Array<{
    id: string;
    school_id: string | null;
    auth_email: string | null;
  }>[number]>(TABLES.studentProfiles, {
    select: 'id,school_id,auth_email',
    filters,
    limit: 200,
  }).catch(() => []);
  return rows
    .filter((row) => !!row.auth_email && !!row.school_id)
    .map((row) => ({
      authEmail: String(row.auth_email),
      studentId: row.id,
      schoolId: String(row.school_id),
    }));
}

export async function findAdminAuthIdentity(input: {
  schoolCode: string;
  identifier: string;
}): Promise<{ authEmail: string; adminId: string; schoolId: string } | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const school = await getSchoolByCode(input.schoolCode);
  if (!school || school.status !== 'active') return null;
  const identifier = sanitize(input.identifier, 90);
  const normalizedIdentifier = identifier.toUpperCase();
  const normalizedEmail = identifier.toLowerCase();
  const normalizedPhone = normalizePhoneIdentifier(identifier);
  if (!identifier) return null;
  const rows = await supabaseSelect<Array<{
    id: string;
    school_id: string;
    status: string;
    auth_email: string | null;
    admin_identifier: string;
    phone: string | null;
  }>[number]>(TABLES.schoolAdmins, {
    select: 'id,school_id,status,auth_email,admin_identifier,phone',
    filters: [{ column: 'school_id', value: school.id }, { column: 'status', value: 'active' }],
    limit: 100,
  }).catch(() => []);
  const matched = rows.find((row) => {
    const adminIdentifier = sanitize(row.admin_identifier || '', 90).toUpperCase();
    const phone = normalizePhoneIdentifier(row.phone || '');
    const authEmail = sanitize(row.auth_email || '', 160).toLowerCase();
    return adminIdentifier === normalizedIdentifier || (normalizedPhone ? phone === normalizedPhone : false) || authEmail === normalizedEmail;
  });
  if (!matched || !matched.auth_email) return null;
  return { authEmail: matched.auth_email, adminId: matched.id, schoolId: school.id };
}

export async function recordTokenUsageEvent(input: TokenUsageEventInput): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const endpoint = sanitize(input.endpoint, 120);
  if (!endpoint) return;
  const promptTokens = Math.max(0, Number(input.promptTokens) || 0);
  const completionTokens = Math.max(0, Number(input.completionTokens) || 0);
  const totalTokens = Math.max(0, Number(input.totalTokens) || promptTokens + completionTokens);
  await supabaseInsert<TokenUsageRow>(TABLES.tokenUsageEvents, {
    school_id: input.schoolId ?? null,
    auth_user_id: input.authUserId ?? null,
    role: input.role ?? null,
    endpoint,
    provider: input.provider ? sanitize(input.provider, 50) : null,
    model: input.model ? sanitize(input.model, 100) : null,
    request_id: input.requestId ? sanitize(input.requestId, 120) : null,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated: input.estimated ?? false,
  }).catch(() => undefined);
}

function aggregateByKey<T extends string>(values: T[]): Array<{ key: T; count: number }> {
  const map = new Map<T, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

export async function getDeveloperOverview(input?: { schoolId?: string }) {
  if (!isSupabaseServiceConfigured()) {
    return {
      schools: [] as SchoolProfile[],
      schoolDirectory: [] as Array<{
        schoolId: string;
        schoolName: string;
        schoolCode: string;
        status: SchoolProfile['status'];
        teachers: number;
        students: number;
        studentsClass10: number;
        studentsClass12: number;
        admins: number;
        totalTokens: number;
        adminContacts: Array<{ id: string; name: string; phone?: string; email?: string; adminIdentifier: string }>;
      }>,
      counts: {
        schools: 0,
        teachers: 0,
        students: 0,
        admins: 0,
      },
      classCounts: [] as Array<{ classLevel: 10 | 12; count: number }>,
      subjectCounts: [] as Array<{ subject: SupportedSubject; count: number }>,
      tokenUsage: {
        totalTokens: 0,
        events: 0,
        byEndpoint: [] as Array<{ endpoint: string; totalTokens: number; events: number }>,
      },
    };
  }
  const schoolFilter = input?.schoolId ? [{ column: 'school_id', value: input.schoolId }] : undefined;
  const [schools, teachers, students, admins, scopes, tokenUsage] = await Promise.all([
    listSchools(),
    supabaseSelect<Array<{ id: string; school_id: string | null }>[number]>(TABLES.teacherProfiles, {
      select: 'id,school_id',
      filters: schoolFilter,
      limit: 10000,
    }).catch(() => []),
    supabaseSelect<Array<{ id: string; school_id: string | null; class_level: number }>[number]>(TABLES.studentProfiles, {
      select: 'id,school_id,class_level',
      filters: schoolFilter,
      limit: 20000,
    }).catch(() => []),
    supabaseSelect<Array<{
      id: string;
      school_id: string;
      name: string;
      status: string;
      auth_user_id: string | null;
      phone: string | null;
      auth_email: string | null;
      admin_identifier: string;
    }>[number]>(TABLES.schoolAdmins, {
      select: 'id,school_id,name,status,auth_user_id,phone,auth_email,admin_identifier',
      filters: schoolFilter,
      limit: 4000,
    }).catch(() => []),
    supabaseSelect<Array<{ subject: SupportedSubject; school_id: string | null }>[number]>('teacher_scopes', {
      select: 'subject,school_id',
      filters: schoolFilter,
      limit: 20000,
    }).catch(() => []),
    supabaseSelect<TokenUsageRow>(TABLES.tokenUsageEvents, {
      select: '*',
      filters: schoolFilter,
      orderBy: 'created_at',
      ascending: false,
      limit: 50000,
    }).catch(() => []),
  ]);

  const byEndpoint = new Map<string, { totalTokens: number; events: number }>();
  for (const event of tokenUsage) {
    const endpoint = sanitize(event.endpoint, 120) || 'unknown';
    const current = byEndpoint.get(endpoint) ?? { totalTokens: 0, events: 0 };
    current.totalTokens += Math.max(0, Number(event.total_tokens) || 0);
    current.events += 1;
    byEndpoint.set(endpoint, current);
  }

  const classMap = new Map<10 | 12, number>();
  for (const student of students) {
    if (student.class_level === 10 || student.class_level === 12) {
      const classLevel = student.class_level as 10 | 12;
      classMap.set(classLevel, (classMap.get(classLevel) ?? 0) + 1);
    }
  }

  const teacherCountBySchool = new Map<string, number>();
  for (const teacher of teachers) {
    const schoolId = teacher.school_id ?? '';
    if (!schoolId) continue;
    teacherCountBySchool.set(schoolId, (teacherCountBySchool.get(schoolId) ?? 0) + 1);
  }
  const studentCountBySchool = new Map<string, { total: number; c10: number; c12: number }>();
  for (const student of students) {
    const schoolId = student.school_id ?? '';
    if (!schoolId) continue;
    const current = studentCountBySchool.get(schoolId) ?? { total: 0, c10: 0, c12: 0 };
    current.total += 1;
    if (student.class_level === 10) current.c10 += 1;
    if (student.class_level === 12) current.c12 += 1;
    studentCountBySchool.set(schoolId, current);
  }
  const adminsBySchool = new Map<string, SchoolAdminMinimalRow[]>();
  for (const admin of admins) {
    const schoolId = admin.school_id ?? '';
    if (!schoolId) continue;
    const bucket = adminsBySchool.get(schoolId) ?? [];
    bucket.push({
      id: admin.id,
      name: admin.name,
      status: admin.status,
      school_id: admin.school_id,
      auth_user_id: admin.auth_user_id,
      phone: admin.phone,
      auth_email: admin.auth_email,
      admin_identifier: admin.admin_identifier,
    });
    adminsBySchool.set(schoolId, bucket);
  }
  const tokensBySchool = new Map<string, number>();
  for (const event of tokenUsage) {
    const schoolId = event.school_id ?? '';
    if (!schoolId) continue;
    tokensBySchool.set(schoolId, (tokensBySchool.get(schoolId) ?? 0) + Math.max(0, Number(event.total_tokens) || 0));
  }

  const schoolDirectory = schools.map((school) => {
    const studentCounts = studentCountBySchool.get(school.id) ?? { total: 0, c10: 0, c12: 0 };
    const schoolAdmins = adminsBySchool.get(school.id) ?? [];
    return {
      schoolId: school.id,
      schoolName: school.schoolName,
      schoolCode: school.schoolCode,
      status: school.status,
      teachers: teacherCountBySchool.get(school.id) ?? 0,
      students: studentCounts.total,
      studentsClass10: studentCounts.c10,
      studentsClass12: studentCounts.c12,
      admins: schoolAdmins.length,
      totalTokens: tokensBySchool.get(school.id) ?? 0,
      adminContacts: schoolAdmins.map((admin) => ({
        id: admin.id,
        name: admin.name,
        phone: admin.phone ?? undefined,
        email: admin.auth_email ?? undefined,
        adminIdentifier: admin.admin_identifier || admin.id,
      })),
    };
  });

  return {
    schools,
    schoolDirectory,
    counts: {
      schools: schools.length,
      teachers: teachers.length,
      students: students.length,
      admins: admins.length,
    },
    classCounts: [10, 12].map((level) => ({
      classLevel: level as 10 | 12,
      count: classMap.get(level as 10 | 12) ?? 0,
    })),
    subjectCounts: aggregateByKey(scopes.map((scope) => scope.subject))
      .map((entry) => ({ subject: entry.key, count: entry.count })),
    tokenUsage: {
      totalTokens: tokenUsage.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens) || 0), 0),
      events: tokenUsage.length,
      byEndpoint: [...byEndpoint.entries()]
        .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
        .map(([endpoint, stats]) => ({ endpoint, totalTokens: stats.totalTokens, events: stats.events })),
    },
  };
}

export async function getDeveloperSchoolOverview(schoolId: string) {
  const school = await getSchoolById(schoolId);
  if (!school) return null;
  const overview = await getDeveloperOverview({ schoolId });
  return {
    school,
    ...overview,
  };
}

export async function getTokenUsageRollup(input?: {
  schoolId?: string;
  endpoint?: string;
  limit?: number;
}) {
  if (!isSupabaseServiceConfigured()) {
    return {
      events: 0,
      totalTokens: 0,
      records: [] as Array<{
        id: string;
        createdAt: string;
        schoolId?: string;
        authUserId?: string;
        role?: string;
        endpoint: string;
        provider?: string;
        model?: string;
        totalTokens: number;
        estimated: boolean;
      }>,
    };
  }
  const filters: Array<{ column: string; value: string }> = [];
  if (input?.schoolId) filters.push({ column: 'school_id', value: sanitize(input.schoolId, 90) });
  if (input?.endpoint) filters.push({ column: 'endpoint', value: sanitize(input.endpoint, 120) });

  const rows = await supabaseSelect<TokenUsageRow>(TABLES.tokenUsageEvents, {
    select: '*',
    filters,
    orderBy: 'created_at',
    ascending: false,
    limit: Math.max(1, Math.min(2000, Number(input?.limit) || 500)),
  }).catch(() => []);

  return {
    events: rows.length,
    totalTokens: rows.reduce((sum, row) => sum + Math.max(0, Number(row.total_tokens) || 0), 0),
    records: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      schoolId: row.school_id ?? undefined,
      authUserId: row.auth_user_id ?? undefined,
      role: row.role ?? undefined,
      endpoint: row.endpoint,
      provider: row.provider ?? undefined,
      model: row.model ?? undefined,
      totalTokens: Math.max(0, Number(row.total_tokens) || 0),
      estimated: !!row.estimated,
    })),
  };
}

export async function getDeveloperAuditFeed(limit = 300) {
  if (!isSupabaseServiceConfigured()) return [];
  const safeLimit = Math.max(20, Math.min(2000, Number(limit) || 300));
  const [teacherActivity, tokenRows] = await Promise.all([
    supabaseSelect<Array<{
      id: number;
      teacher_id: string | null;
      actor_type: string;
      action: string;
      chapter_id: string | null;
      pack_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>[number]>('teacher_activity', {
      select: '*',
      orderBy: 'created_at',
      ascending: false,
      limit: safeLimit,
    }).catch(() => []),
    supabaseSelect<TokenUsageRow>(TABLES.tokenUsageEvents, {
      select: '*',
      orderBy: 'created_at',
      ascending: false,
      limit: safeLimit,
    }).catch(() => []),
  ]);

  const events = [
    ...teacherActivity.map((row) => ({
      id: `activity-${row.id}`,
      type: 'teacher-activity' as const,
      createdAt: row.created_at,
      actor: row.actor_type,
      action: row.action,
      teacherId: row.teacher_id ?? undefined,
      packId: row.pack_id ?? undefined,
      chapterId: row.chapter_id ?? undefined,
      metadata: row.metadata ?? {},
    })),
    ...tokenRows.map((row) => ({
      id: `token-${row.id}`,
      type: 'token-usage' as const,
      createdAt: row.created_at,
      actor: row.role ?? 'unknown',
      action: row.endpoint,
      teacherId: undefined,
      packId: undefined,
      chapterId: undefined,
      metadata: {
        schoolId: row.school_id ?? undefined,
        authUserId: row.auth_user_id ?? undefined,
        provider: row.provider ?? undefined,
        model: row.model ?? undefined,
        totalTokens: row.total_tokens,
        estimated: row.estimated,
      },
    })),
  ];

  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, safeLimit);
}
