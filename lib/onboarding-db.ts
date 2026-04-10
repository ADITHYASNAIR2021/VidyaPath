import { randomUUID } from 'node:crypto';
import { createSupabaseAuthUser } from '@/lib/auth/supabase-auth';
import { createSchool, getSchoolByCode, type SchoolProfile } from '@/lib/platform-rbac-db';
import { isSupabaseServiceConfigured, supabaseInsert, supabaseSelect, supabaseUpdate } from '@/lib/supabase-rest';

type AffiliateRequestStatus = 'pending' | 'approved' | 'rejected';

interface AffiliateRequestRow {
  id: string;
  school_name: string;
  school_code_hint: string | null;
  board: string | null;
  state: string | null;
  city: string | null;
  affiliate_no: string | null;
  website_url: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  notes: string | null;
  status: AffiliateRequestStatus;
  review_notes: string | null;
  reviewed_by_auth_user_id: string | null;
  reviewed_at: string | null;
  linked_school_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SchoolAdminProfileRow {
  id: string;
  school_id: string;
  auth_user_id: string | null;
  auth_email: string | null;
  admin_identifier: string;
  phone: string | null;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface PlatformRoleRow {
  id: string;
  auth_user_id: string;
  role: 'student' | 'teacher' | 'admin' | 'developer';
  school_id: string | null;
  profile_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SchoolMinimalRow {
  id: string;
  school_code: string;
  school_name: string;
  board: string;
  city: string | null;
  state: string | null;
  status?: 'active' | 'inactive' | 'archived';
  created_at?: string;
  updated_at?: string;
}

const TABLES = {
  schools: 'schools',
  schoolAdmins: 'school_admin_profiles',
  platformRoles: 'platform_user_roles',
  affiliateRequests: 'school_affiliate_requests',
};

export interface AffiliateSchoolRequest {
  id: string;
  schoolName: string;
  schoolCodeHint?: string;
  board?: string;
  state?: string;
  city?: string;
  affiliateNo?: string;
  websiteUrl?: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
  status: AffiliateRequestStatus;
  reviewNotes?: string;
  reviewedByAuthUserId?: string;
  reviewedAt?: string;
  linkedSchoolId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisionedSchoolAdmin {
  id: string;
  schoolId: string;
  schoolCode?: string;
  schoolName?: string;
  name: string;
  adminIdentifier: string;
  phone?: string;
  authEmail?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

function sanitize(value: string, max = 140): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeSchoolCode(value: string): string {
  return sanitize(value, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function normalizePhone(value: string): string {
  return sanitize(value, 24).replace(/[^\d+]/g, '');
}

function normalizeIdentifier(value: string, fallbackPrefix = 'ADM'): string {
  const normalized = sanitize(value, 50).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (normalized) return normalized;
  return `${fallbackPrefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

function buildDefaultPassword(seed: string): string {
  const clean = sanitize(seed, 80).replace(/[^a-zA-Z0-9]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4);
  return `Vp${clean.slice(-4) || 'Adm'}${suffix}!`;
}

function toAffiliateRequest(row: AffiliateRequestRow): AffiliateSchoolRequest {
  return {
    id: row.id,
    schoolName: row.school_name,
    schoolCodeHint: row.school_code_hint ?? undefined,
    board: row.board ?? undefined,
    state: row.state ?? undefined,
    city: row.city ?? undefined,
    affiliateNo: row.affiliate_no ?? undefined,
    websiteUrl: row.website_url ?? undefined,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    reviewNotes: row.review_notes ?? undefined,
    reviewedByAuthUserId: row.reviewed_by_auth_user_id ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    linkedSchoolId: row.linked_school_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getSchoolById(schoolId: string): Promise<SchoolMinimalRow | null> {
  const rows = await supabaseSelect<SchoolMinimalRow>(TABLES.schools, {
    select: 'id,school_code,school_name,board,city,state,status,created_at,updated_at',
    filters: [{ column: 'id', value: schoolId }],
    limit: 1,
  }).catch(() => []);
  return rows[0] ?? null;
}

function toSchoolProfile(row: SchoolMinimalRow): SchoolProfile {
  return {
    id: row.id,
    schoolName: row.school_name,
    schoolCode: row.school_code,
    board: row.board,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    status: row.status || 'active',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

async function ensurePlatformRole(input: {
  authUserId: string;
  schoolId: string;
  profileId: string;
}): Promise<void> {
  const authUserId = sanitize(input.authUserId, 80);
  const schoolId = sanitize(input.schoolId, 80);
  const profileId = sanitize(input.profileId, 80);
  if (!authUserId || !schoolId || !profileId) return;
  const existing = await supabaseSelect<PlatformRoleRow>(TABLES.platformRoles, {
    select: '*',
    filters: [
      { column: 'auth_user_id', value: authUserId },
      { column: 'role', value: 'admin' },
      { column: 'school_id', value: schoolId },
      { column: 'profile_id', value: profileId },
    ],
    limit: 1,
  }).catch(() => []);
  if (existing[0]) return;
  await supabaseInsert<PlatformRoleRow>(TABLES.platformRoles, {
    id: randomUUID(),
    auth_user_id: authUserId,
    role: 'admin',
    school_id: schoolId,
    profile_id: profileId,
    is_active: true,
  });
}

export async function createAffiliateRequest(input: {
  schoolName: string;
  schoolCodeHint?: string;
  board?: string;
  state?: string;
  city?: string;
  affiliateNo?: string;
  websiteUrl?: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes?: string;
}): Promise<AffiliateSchoolRequest> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolName = sanitize(input.schoolName, 140);
  const contactName = sanitize(input.contactName, 120);
  const contactPhone = normalizePhone(input.contactPhone);
  if (!schoolName || !contactName || !contactPhone) {
    throw new Error('schoolName, contactName, and contactPhone are required.');
  }
  const [created] = await supabaseInsert<AffiliateRequestRow>(TABLES.affiliateRequests, {
    school_name: schoolName,
    school_code_hint: input.schoolCodeHint ? normalizeSchoolCode(input.schoolCodeHint) : null,
    board: input.board ? sanitize(input.board, 60) : null,
    state: input.state ? sanitize(input.state, 80) : null,
    city: input.city ? sanitize(input.city, 80) : null,
    affiliate_no: input.affiliateNo ? sanitize(input.affiliateNo, 100) : null,
    website_url: input.websiteUrl ? sanitize(input.websiteUrl, 300) : null,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: input.contactEmail ? sanitize(input.contactEmail, 140).toLowerCase() : null,
    notes: input.notes ? sanitize(input.notes, 1200) : null,
    status: 'pending',
  });
  if (!created) throw new Error('Failed to create affiliate request.');
  return toAffiliateRequest(created);
}

export async function listAffiliateRequests(input?: {
  status?: AffiliateRequestStatus;
  limit?: number;
}): Promise<AffiliateSchoolRequest[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const filters = input?.status ? [{ column: 'status', value: input.status }] : undefined;
  const rows = await supabaseSelect<AffiliateRequestRow>(TABLES.affiliateRequests, {
    select: '*',
    filters,
    orderBy: 'created_at',
    ascending: false,
    limit: Math.max(1, Math.min(1000, Number(input?.limit) || 300)),
  }).catch(() => []);
  return rows.map(toAffiliateRequest);
}

async function createApprovedSchoolForRequest(input: {
  request: AffiliateRequestRow;
  schoolCode?: string;
  board?: string;
  city?: string;
  state?: string;
}): Promise<SchoolProfile> {
  const explicitSchoolCode = normalizeSchoolCode(input.schoolCode || input.request.school_code_hint || '');
  const preferredBoard = sanitize(input.board || input.request.board || 'CBSE', 40) || 'CBSE';
  const city = sanitize(input.city || input.request.city || '', 80);
  const state = sanitize(input.state || input.request.state || '', 80);
  if (explicitSchoolCode) {
    const existing = await getSchoolByCode(explicitSchoolCode);
    if (existing) return existing;
  }
  const fallbackBase = normalizeSchoolCode(
    input.request.school_name
      .split(/\s+/)
      .map((part) => part[0] || '')
      .join('')
      .slice(0, 6)
  );
  const attemptBase = explicitSchoolCode || fallbackBase || 'VPSCH';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? '' : `${Math.floor(100 + Math.random() * 900)}`;
    const schoolCode = normalizeSchoolCode(`${attemptBase}${suffix}`).slice(0, 16);
    const existing = await getSchoolByCode(schoolCode);
    if (existing) continue;
    return createSchool({
      schoolName: input.request.school_name,
      schoolCode,
      board: preferredBoard,
      city: city || undefined,
      state: state || undefined,
      contactPhone: input.request.contact_phone || undefined,
      contactEmail: input.request.contact_email || undefined,
    });
  }
  throw new Error('Unable to generate a unique school code for approval.');
}

export async function reviewAffiliateRequest(input: {
  requestId: string;
  decision: 'approve' | 'reject';
  reviewerAuthUserId?: string;
  reviewNotes?: string;
  schoolCode?: string;
  board?: string;
  city?: string;
  state?: string;
}): Promise<{ request: AffiliateSchoolRequest; linkedSchool?: SchoolProfile }> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const requestId = sanitize(input.requestId, 80);
  if (!requestId) throw new Error('requestId is required.');
  const rows = await supabaseSelect<AffiliateRequestRow>(TABLES.affiliateRequests, {
    select: '*',
    filters: [{ column: 'id', value: requestId }],
    limit: 1,
  }).catch(() => []);
  const existing = rows[0];
  if (!existing) throw new Error('Affiliate request not found.');

  if (input.decision === 'reject') {
    const [updated] = await supabaseUpdate<AffiliateRequestRow>(
      TABLES.affiliateRequests,
      {
        status: 'rejected',
        review_notes: input.reviewNotes ? sanitize(input.reviewNotes, 1200) : null,
        reviewed_by_auth_user_id: input.reviewerAuthUserId ? sanitize(input.reviewerAuthUserId, 80) : null,
        reviewed_at: new Date().toISOString(),
      },
      [{ column: 'id', value: requestId }]
    );
    if (!updated) throw new Error('Failed to reject affiliate request.');
    return { request: toAffiliateRequest(updated) };
  }

  const linkedSchool = existing.linked_school_id
    ? await getSchoolById(existing.linked_school_id).then((school) => (school ? toSchoolProfile(school) : null))
    : null;
  const school = linkedSchool ?? await createApprovedSchoolForRequest({
    request: existing,
    schoolCode: input.schoolCode,
    board: input.board,
    city: input.city,
    state: input.state,
  });

  const [updated] = await supabaseUpdate<AffiliateRequestRow>(
    TABLES.affiliateRequests,
    {
      status: 'approved',
      review_notes: input.reviewNotes ? sanitize(input.reviewNotes, 1200) : null,
      reviewed_by_auth_user_id: input.reviewerAuthUserId ? sanitize(input.reviewerAuthUserId, 80) : null,
      reviewed_at: new Date().toISOString(),
      linked_school_id: school.id,
    },
    [{ column: 'id', value: requestId }]
  );
  if (!updated) throw new Error('Failed to approve affiliate request.');
  return {
    request: toAffiliateRequest(updated),
    linkedSchool: school,
  };
}

export async function listSchoolAdminsForDeveloper(schoolId: string): Promise<ProvisionedSchoolAdmin[]> {
  if (!isSupabaseServiceConfigured()) return [];
  const scopedSchoolId = sanitize(schoolId, 80);
  if (!scopedSchoolId) return [];
  const school = await getSchoolById(scopedSchoolId);
  const rows = await supabaseSelect<SchoolAdminProfileRow>(TABLES.schoolAdmins, {
    select: '*',
    filters: [{ column: 'school_id', value: scopedSchoolId }],
    orderBy: 'updated_at',
    ascending: false,
    limit: 200,
  }).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    schoolId: row.school_id,
    schoolCode: school?.school_code,
    schoolName: school?.school_name,
    name: row.name,
    adminIdentifier: row.admin_identifier,
    phone: row.phone ?? undefined,
    authEmail: row.auth_email ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function provisionSchoolAdminByDeveloper(input: {
  schoolId: string;
  name: string;
  adminIdentifier?: string;
  phone?: string;
  authEmail?: string;
  password?: string;
}): Promise<{
  admin: ProvisionedSchoolAdmin;
  issuedCredentials: {
    schoolId: string;
    schoolCode?: string;
    schoolName?: string;
    loginIdentifier: string;
    password: string;
    authEmail: string;
  };
}> {
  if (!isSupabaseServiceConfigured()) throw new Error('Supabase is not configured.');
  const schoolId = sanitize(input.schoolId, 80);
  const school = await getSchoolById(schoolId);
  if (!school) throw new Error('School not found.');
  const name = sanitize(input.name, 120);
  if (!name) throw new Error('Admin name is required.');
  const adminIdentifier = normalizeIdentifier(input.adminIdentifier || '', 'ADM');
  const phone = input.phone ? normalizePhone(input.phone) : '';
  const password = sanitize(input.password || '', 160) || buildDefaultPassword(adminIdentifier || phone || name);
  const emailFallback = `${adminIdentifier.toLowerCase()}.${school.school_code.toLowerCase()}@vidyapath.local`;
  const authEmail = sanitize(input.authEmail || emailFallback, 160).toLowerCase();

  const authUser = await createSupabaseAuthUser({
    email: authEmail,
    password,
    emailConfirm: true,
    userMetadata: {
      role: 'admin',
      school_id: school.id,
      admin_identifier: adminIdentifier,
      name,
      phone: phone || undefined,
    },
  });
  const [created] = await supabaseInsert<SchoolAdminProfileRow>(TABLES.schoolAdmins, {
    id: randomUUID(),
    school_id: school.id,
    auth_user_id: authUser.id,
    auth_email: authUser.email ?? authEmail,
    admin_identifier: adminIdentifier,
    phone: phone || null,
    name,
    status: 'active',
  });
  if (!created) throw new Error('Failed to provision school admin profile.');

  await ensurePlatformRole({
    authUserId: authUser.id,
    schoolId: school.id,
    profileId: created.id,
  });

  return {
    admin: {
      id: created.id,
      schoolId: created.school_id,
      schoolCode: school.school_code,
      schoolName: school.school_name,
      name: created.name,
      adminIdentifier: created.admin_identifier,
      phone: created.phone ?? undefined,
      authEmail: created.auth_email ?? undefined,
      status: created.status,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    },
    issuedCredentials: {
      schoolId: school.id,
      schoolCode: school.school_code,
      schoolName: school.school_name,
      loginIdentifier: created.admin_identifier,
      password,
      authEmail: created.auth_email ?? authEmail,
    },
  };
}
