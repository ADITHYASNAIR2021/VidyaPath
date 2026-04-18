import { randomUUID } from 'node:crypto';
import { getChapterById } from '@/lib/data';
import { hashPin, isValidPin, verifyPin } from '@/lib/auth/pin';
import { createSupabaseAuthUser, updateSupabaseAuthUser } from '@/lib/auth/supabase-auth';
import { issueFriendlyIdentifier } from '@/lib/auth/friendly-ids';
import {
  assertPasswordPolicy,
  generateLegacyPin,
  generateStrongPassword,
} from '@/lib/auth/password-policy';
import type {
  TeacherProfile,
  TeacherScope,
  TeacherSectionCode,
  TeacherSession,
} from '@/lib/teacher-types';
import {
  isSupabaseServiceConfigured,
  supabaseInsert,
  supabaseSelect,
  supabaseUpdate,
} from '@/lib/supabase-rest';
import { logServerEvent } from '@/lib/observability';
import {
  TABLES,
  type TeacherProfileRow,
  type TeacherScopeRow,
  type TeacherActivityRow,
  sanitizeText,
  normalizePhone,
  normalizeRollCode,
  buildSyntheticPhoneFromSeed,
  ensurePlatformRole,
  toScope,
  toTeacherProfile,
  isSubjectAllowedForClass,
  getTeacherScopes,
  getTeacherProfileRow,
  getTeacherSchoolId,
} from './_shared';

export { getTeacherSchoolId };

export async function logTeacherActivity(input: {
  actorType: 'teacher' | 'admin' | 'system';
  action: string;
  teacherId?: string;
  chapterId?: string;
  packId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  await supabaseInsert<TeacherActivityRow>(TABLES.activity, {
    teacher_id: input.teacherId ?? null,
    actor_type: input.actorType,
    action: sanitizeText(input.action, 90),
    chapter_id: input.chapterId ? sanitizeText(input.chapterId, 80) : null,
    pack_id: input.packId ? sanitizeText(input.packId, 80) : null,
    metadata: input.metadata ?? {},
  }).catch(() => undefined);
}

export async function listTeachers(schoolId?: string): Promise<TeacherProfile[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters,
    orderBy: 'updated_at',
    ascending: false,
    limit: 500,
  });
  const scopes = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: schoolId ? [{ column: 'school_id', value: sanitizeText(schoolId, 80) }] : undefined,
    limit: 2000,
  }).catch(() => []);
  const scopeMap = new Map<string, TeacherScope[]>();
  for (const row of scopes) {
    const scope = toScope(row);
    if (!scope) continue;
    const bucket = scopeMap.get(scope.teacherId) ?? [];
    bucket.push(scope);
    scopeMap.set(scope.teacherId, bucket);
  }
  return rows.map((row) => toTeacherProfile(row, scopeMap.get(row.id) ?? []));
}

export async function getTeacherById(teacherId: string, schoolId?: string): Promise<TeacherProfile | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const row = await getTeacherProfileRow(teacherId);
  if (!row) return null;
  if (schoolId && row.school_id && row.school_id !== sanitizeText(schoolId, 80)) return null;
  const scopes = await getTeacherScopes(row.id);
  return toTeacherProfile(row, scopes);
}

export async function getTeacherSessionById(teacherId: string, schoolId?: string): Promise<TeacherSession | null> {
  const teacher = await getTeacherById(teacherId, schoolId);
  if (!teacher || teacher.status !== 'active') return null;
  return {
    teacher,
    effectiveScopes: teacher.scopes.filter((scope) => scope.isActive),
  };
}

export async function authenticateTeacher(phone: string, pin: string, schoolId?: string): Promise<TeacherSession | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const cleanPhone = normalizePhone(phone);
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'phone', value: cleanPhone },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  const rows = await supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
    select: '*',
    filters,
    limit: 1,
  }).catch((err: unknown) => {
    logServerEvent({ level: 'error', event: 'auth:teacher:query-failed', details: { fn: 'authenticateTeacher', error: err instanceof Error ? err.message : String(err) } });
    return [] as TeacherProfileRow[];
  });
  const row = rows[0];
  if (!row) {
    logServerEvent({ level: 'warn', event: 'auth:teacher:not-found', details: { phone: cleanPhone } });
    return null;
  }
  if (row.status !== 'active') {
    logServerEvent({ level: 'warn', event: 'auth:teacher:inactive', details: { status: row.status, teacherId: row.id } });
    return null;
  }
  if (!verifyPin(pin, row.pin_hash)) {
    logServerEvent({ level: 'warn', event: 'auth:teacher:pin-mismatch', details: { teacherId: row.id } });
    return null;
  }
  return getTeacherSessionById(row.id, schoolId);
}

export async function authenticateTeacherByIdentifier(
  identifier: string,
  pin: string,
  schoolId?: string
): Promise<{ session: TeacherSession | null; ambiguous?: boolean }> {
  if (!isSupabaseServiceConfigured()) return { session: null };
  const cleanIdentifier = sanitizeText(identifier, 80);
  if (!cleanIdentifier || !pin) return { session: null };
  const normalizedPhone = normalizePhone(cleanIdentifier);
  // Also try matching after stripping a leading country code (e.g. +91 or 0091 prefix)
  const strippedPhone = normalizedPhone.replace(/^\+91|^0091/, '');
  const normalizedStaff = normalizeRollCode(cleanIdentifier);
  const schoolFilter = schoolId ? [{ column: 'school_id', value: sanitizeText(schoolId, 80) }] : [];

  // Run targeted queries in parallel instead of full table scan
  const phoneVariants = [...new Set([normalizedPhone, strippedPhone].filter(Boolean))];
  const [byPhoneFull, byPhoneStripped, byStaff] = await Promise.all([
    supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
      select: '*',
      filters: [{ column: 'status', value: 'active' }, { column: 'phone', value: phoneVariants[0] ?? '' }, ...schoolFilter],
      limit: 10,
    }).catch(() => [] as TeacherProfileRow[]),
    phoneVariants[1] ? supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
      select: '*',
      filters: [{ column: 'status', value: 'active' }, { column: 'phone', value: phoneVariants[1] }, ...schoolFilter],
      limit: 10,
    }).catch(() => [] as TeacherProfileRow[]) : Promise.resolve([] as TeacherProfileRow[]),
    normalizedStaff ? supabaseSelect<TeacherProfileRow>(TABLES.profiles, {
      select: '*',
      filters: [{ column: 'status', value: 'active' }, { column: 'staff_code', value: normalizedStaff }, ...schoolFilter],
      limit: 10,
    }).catch((err: unknown) => {
      logServerEvent({ level: 'error', event: 'auth:teacher:query-failed', details: { fn: 'authenticateTeacherByIdentifier', error: err instanceof Error ? err.message : String(err) } });
      return [] as TeacherProfileRow[];
    }) : Promise.resolve([] as TeacherProfileRow[]),
  ]);

  // Deduplicate by id
  const seen = new Set<string>();
  const candidates: TeacherProfileRow[] = [];
  for (const row of [...byPhoneFull, ...byPhoneStripped, ...byStaff]) {
    if (!seen.has(row.id)) { seen.add(row.id); candidates.push(row); }
  }

  if (candidates.length === 0) {
    logServerEvent({ level: 'warn', event: 'auth:teacher:no-db-results', details: { identifier: cleanIdentifier } });
    return { session: null };
  }

  // Verify country-code variants in memory (narrow set, not 5000 rows)
  const matched_candidates = candidates.filter((row) => {
    const storedPhone = normalizePhone(row.phone || '');
    const phoneMatch =
      storedPhone === normalizedPhone ||
      storedPhone === strippedPhone ||
      storedPhone.replace(/^\+91|^0091/, '') === normalizedPhone ||
      storedPhone.replace(/^\+91|^0091/, '') === strippedPhone;
    const staffMatch = normalizeRollCode(row.staff_code || '') === normalizedStaff;
    return phoneMatch || (!!normalizedStaff && staffMatch);
  });
  if (matched_candidates.length === 0) {
    logServerEvent({ level: 'warn', event: 'auth:teacher:no-candidate', details: { identifier: cleanIdentifier } });
    return { session: null };
  }
  const pinMatched = matched_candidates.filter((row) => {
    try {
      return verifyPin(pin, row.pin_hash);
    } catch (err: unknown) {
      logServerEvent({ level: 'error', event: 'auth:teacher:verify-pin-threw', details: { teacherId: row.id, error: err instanceof Error ? err.message : String(err) } });
      return false;
    }
  });
  if (pinMatched.length === 0) {
    logServerEvent({ level: 'warn', event: 'auth:teacher:pin-mismatch', details: { candidates: matched_candidates.length } });
    return { session: null };
  }
  if (pinMatched.length > 1) return { session: null, ambiguous: true };
  const matched = pinMatched[0];
  return {
    session: await getTeacherSessionById(matched.id, matched.school_id ?? schoolId),
  };
}

async function findExistingAuthIdentityByEmail(email: string): Promise<{ authUserId: string; authEmail?: string } | null> {
  const normalized = sanitizeText(email, 180).toLowerCase();
  if (!normalized) return null;
  const [teacherRows, adminRows, studentRows] = await Promise.all([
    supabaseSelect<Array<{ auth_user_id: string | null; auth_email: string | null }>[number]>(TABLES.profiles, {
      select: 'auth_user_id,auth_email',
      filters: [{ column: 'auth_email', value: normalized }],
      limit: 1,
    }).catch(() => []),
    supabaseSelect<Array<{ auth_user_id: string | null; auth_email: string | null }>[number]>('school_admin_profiles', {
      select: 'auth_user_id,auth_email',
      filters: [{ column: 'auth_email', value: normalized }],
      limit: 1,
    }).catch(() => []),
    supabaseSelect<Array<{ auth_user_id: string | null; auth_email: string | null }>[number]>('student_profiles', {
      select: 'auth_user_id,auth_email',
      filters: [{ column: 'auth_email', value: normalized }],
      limit: 1,
    }).catch(() => []),
  ]);
  const match = [...teacherRows, ...adminRows, ...studentRows].find((row) => !!row.auth_user_id);
  if (!match || !match.auth_user_id) return null;
  return {
    authUserId: String(match.auth_user_id),
    authEmail: typeof match.auth_email === 'string' ? match.auth_email : normalized,
  };
}

export async function createTeacher(input: {
  schoolId?: string;
  email: string;
  phone?: string;
  name: string;
  pin?: string;
  staffCode?: string;
  password?: string;
  scopes?: Array<{ classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }>;
  forcePasswordChangeOnFirstLogin?: boolean;
  rotatePasswordIfExisting?: boolean;
}): Promise<TeacherProfile> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const schoolId = input.schoolId ? sanitizeText(input.schoolId, 80) : '';
  const email = sanitizeText(input.email || '', 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid teacher email is required.');
  const name = sanitizeText(input.name, 120);
  if (!schoolId) throw new Error('schoolId is required to create teacher.');
  if (!name) throw new Error('Valid teacher name is required.');
  const identity = await issueFriendlyIdentifier({
    schoolId,
    roleCode: 'TC',
  });
  const staffCode = normalizeRollCode(input.staffCode || identity.identifier);
  if (!staffCode) throw new Error('Valid staffCode is required.');
  let phone = normalizePhone(input.phone || '');
  if (!phone) phone = buildSyntheticPhoneFromSeed(`${schoolId}:${staffCode}:${email}`);
  const duplicateTeacher = await supabaseSelect<Pick<TeacherProfileRow, 'id'>>(TABLES.profiles, {
    select: 'id',
    filters: [
      { column: 'school_id', value: schoolId },
      { column: 'staff_code', value: staffCode },
    ],
    limit: 1,
  }).catch(() => []);
  if (duplicateTeacher[0]) {
    throw new Error('Teacher identifier already exists for this school. Please retry.');
  }
  const teacherId = randomUUID();
  const providedPassword = typeof input.password === 'string' ? input.password.trim() : '';
  const teacherPassword = providedPassword || generateStrongPassword(12);
  assertPasswordPolicy(teacherPassword);
  const providedPin = typeof input.pin === 'string' ? input.pin.trim() : '';
  const teacherPin = providedPin && isValidPin(providedPin) ? providedPin : generateLegacyPin(identity.sequenceToken, 6);
  const existingAuth = await findExistingAuthIdentityByEmail(email);
  const authUser = existingAuth
    ? {
        id: existingAuth.authUserId,
        email: existingAuth.authEmail ?? email,
      }
    : await createSupabaseAuthUser({
        email,
        password: teacherPassword,
        emailConfirm: true,
        userMetadata: {
          role: 'teacher',
          school_id: schoolId,
          profile_id: teacherId,
          phone,
          staff_code: staffCode ?? undefined,
          name,
        },
      });
  if (existingAuth && input.rotatePasswordIfExisting === true) {
    await updateSupabaseAuthUser({
      id: existingAuth.authUserId,
      password: teacherPassword,
      userMetadata: {
        role: 'teacher',
        school_id: schoolId,
        profile_id: teacherId,
        phone,
        staff_code: staffCode ?? undefined,
        name,
      },
    });
  }
  const [row] = await supabaseInsert<TeacherProfileRow>(TABLES.profiles, {
    id: teacherId,
    school_id: schoolId,
    auth_user_id: authUser.id,
    auth_email: authUser.email ?? email,
    phone,
    staff_code: staffCode,
    name,
    pin_hash: hashPin(teacherPin),
    must_change_password: input.forcePasswordChangeOnFirstLogin !== false,
    status: 'active',
  });
  if (!row) throw new Error('Failed to create teacher.');
  await ensurePlatformRole({
    authUserId: authUser.id,
    role: 'teacher',
    schoolId,
    profileId: row.id,
  });
  for (const scope of input.scopes ?? []) {
    if (!isSubjectAllowedForClass(scope.classLevel, scope.subject)) {
      throw new Error(`Subject ${scope.subject} is not allowed for Class ${scope.classLevel}.`);
    }
    await addTeacherScope(row.id, scope);
  }
  await logTeacherActivity({
    actorType: 'admin',
    action: 'create-teacher',
    teacherId: row.id,
    metadata: { phone, name, email },
  });
  const teacher = await getTeacherById(row.id);
  if (!teacher) throw new Error('Teacher created but unavailable.');
  return teacher;
}

export async function updateTeacher(
  teacherId: string,
  updates: Partial<{ phone: string; name: string; status: 'active' | 'inactive' }>,
  schoolId?: string
): Promise<TeacherProfile | null> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  const patch: Record<string, unknown> = {};
  if (typeof updates.phone === 'string') {
    const normalizedPhone = normalizePhone(updates.phone);
    if (!normalizedPhone) throw new Error('Valid phone is required.');
    patch.phone = normalizedPhone;
  }
  if (typeof updates.name === 'string') {
    const normalizedName = sanitizeText(updates.name, 120);
    if (!normalizedName) throw new Error('Valid name is required.');
    patch.name = normalizedName;
  }
  if (updates.status === 'active' || updates.status === 'inactive') patch.status = updates.status;
  if (Object.keys(patch).length === 0) return getTeacherById(teacherId, schoolId);
  const filters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'id', value: teacherId },
  ];
  if (schoolId) filters.push({ column: 'school_id', value: sanitizeText(schoolId, 80) });
  await supabaseUpdate<TeacherProfileRow>(TABLES.profiles, patch, filters);
  await logTeacherActivity({
    actorType: 'admin',
    action: 'update-teacher',
    teacherId,
    metadata: patch,
  });
  return getTeacherById(teacherId, schoolId);
}

export async function addTeacherScope(
  teacherId: string,
  scope: { classLevel: 10 | 12; subject: TeacherScope['subject']; section?: string }
): Promise<TeacherScope | null> {
  if (!isSupabaseServiceConfigured()) {
    throw new Error('Supabase is not configured.');
  }
  if (!isSubjectAllowedForClass(scope.classLevel, scope.subject)) {
    throw new Error(`Subject ${scope.subject} is not allowed for Class ${scope.classLevel}.`);
  }
  const teacherRow = await getTeacherProfileRow(teacherId);
  if (!teacherRow) {
    throw new Error('Teacher not found.');
  }
  const section = scope.section ? sanitizeText(scope.section, 40) : null;
  const schoolId = teacherRow.school_id ? sanitizeText(String(teacherRow.school_id), 80) : null;
  const existingFilters: Array<{ column: string; op?: string; value: string | number | boolean | null }> = [
    { column: 'teacher_id', value: teacherId },
    { column: 'class_level', value: scope.classLevel },
    { column: 'subject', value: scope.subject },
    section ? { column: 'section', value: section } : { column: 'section', op: 'is', value: null },
    { column: 'is_active', value: true },
  ];
  if (schoolId) existingFilters.push({ column: 'school_id', value: schoolId });
  const existing = await supabaseSelect<TeacherScopeRow>(TABLES.scopes, {
    select: '*',
    filters: existingFilters,
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return toScope(existing[0]);

  const [row] = await supabaseInsert<TeacherScopeRow>(TABLES.scopes, {
    id: randomUUID(),
    school_id: schoolId,
    teacher_id: teacherId,
    class_level: scope.classLevel,
    subject: scope.subject,
    section,
    is_active: true,
  });
  if (!row) return null;
  await logTeacherActivity({
    actorType: 'admin',
    action: 'add-scope',
    teacherId,
    metadata: { classLevel: scope.classLevel, subject: scope.subject, section: section ?? null },
  });
  return toScope(row);
}

export async function deleteTeacherScope(teacherId: string, scopeId: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseUpdate<TeacherScopeRow>(
    TABLES.scopes,
    { is_active: false },
    [{ column: 'teacher_id', value: teacherId }, { column: 'id', value: scopeId }]
  );
  const ok = rows.length > 0;
  if (ok) {
    await logTeacherActivity({
      actorType: 'admin',
      action: 'remove-scope',
      teacherId,
      metadata: { scopeId },
    });
  }
  return ok;
}

export async function resetTeacherPin(teacherId: string, pin: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const rows = await supabaseUpdate<TeacherProfileRow>(
    TABLES.profiles,
    { pin_hash: hashPin(pin) },
    [{ column: 'id', value: teacherId }]
  );
  const ok = rows.length > 0;
  if (ok) {
    await logTeacherActivity({
      actorType: 'admin',
      action: 'reset-pin',
      teacherId,
    });
  }
  return ok;
}

export async function resetTeacherPassword(teacherId: string, password: string): Promise<boolean> {
  if (!isSupabaseServiceConfigured()) return false;
  const cleanTeacherId = sanitizeText(teacherId, 80);
  const cleanPassword = String(password || '').trim();
  if (!cleanTeacherId || !cleanPassword) return false;
  assertPasswordPolicy(cleanPassword);
  const row = await getTeacherProfileRow(cleanTeacherId);
  if (!row?.auth_user_id) return false;
  await updateSupabaseAuthUser({
    id: row.auth_user_id,
    password: cleanPassword,
  });
  await supabaseUpdate<TeacherProfileRow>(
    TABLES.profiles,
    { must_change_password: true },
    [{ column: 'id', value: cleanTeacherId }]
  ).catch(() => []);
  await logTeacherActivity({
    actorType: 'admin',
    action: 'reset-password',
    teacherId: cleanTeacherId,
  });
  return true;
}

export async function resolveTeacherScopeForChapter(
  teacherId: string,
  chapterId: string,
  section?: TeacherSectionCode
): Promise<TeacherScope | null> {
  const session = await getTeacherSessionById(teacherId);
  if (!session) return null;
  const chapter = getChapterById(chapterId);
  if (!chapter) return null;
  const matches = session.effectiveScopes.filter(
    (scope) =>
      scope.isActive &&
      scope.classLevel === chapter.classLevel &&
      scope.subject === chapter.subject
  );
  if (matches.length === 0) return null;
  if (section) {
    return matches.find((scope) => !scope.section || scope.section === section) ?? null;
  }
  const allSectionScope = matches.find((scope) => !scope.section);
  if (allSectionScope) return allSectionScope;
  if (matches.length === 1) return matches[0];
  return null;
}

export async function markTeacherPasswordChangeCompleted(teacherId: string): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const cleanId = sanitizeText(teacherId, 80);
  if (!cleanId) return;
  await supabaseUpdate<TeacherProfileRow>(
    TABLES.profiles,
    { must_change_password: false },
    [{ column: 'id', value: cleanId }]
  ).catch(() => []);
}
