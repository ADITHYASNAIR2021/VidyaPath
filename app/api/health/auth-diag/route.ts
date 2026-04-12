/**
 * GET /api/health/auth-diag
 *
 * Restricted diagnostics for authentication troubleshooting.
 * - Production access: authenticated admin/developer session only.
 * - Non-production fallback: x-admin-diag-key header can be used.
 * - Admins are automatically scoped to their school.
 */

import { getAdminSessionFromRequestCookies } from '@/lib/auth/guards';
import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

function getConfiguredDiagKey(): string {
  return (
    process.env.ADMIN_PORTAL_KEY?.trim() ||
    process.env.TEACHER_PORTAL_KEY?.trim() ||
    process.env.SESSION_SIGNING_SECRET?.trim() ||
    ''
  );
}

function isAuthorizedByHeader(req: Request): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const configured = getConfiguredDiagKey();
  const provided = req.headers.get('x-admin-diag-key')?.trim() || '';
  return !!configured && provided === configured;
}

interface TeacherRow {
  id: string;
  school_id: string | null;
  phone: string;
  staff_code: string | null;
  name: string;
  status: string;
  pin_hash: string;
  auth_email: string | null;
}

interface StudentRow {
  id: string;
  school_id: string | null;
  roll_code: string;
  roll_no: string | null;
  name: string;
  status: string;
  class_level: number;
  pin_hash: string | null;
  auth_email: string | null;
}

function describePinHash(hash: string | null | undefined): string {
  if (!hash) return 'NULL/empty';
  if (hash.startsWith('scrypt:')) {
    const parts = hash.split(':');
    if (parts.length === 3 && parts[1].length === 32 && parts[2].length === 64) {
      return 'OK';
    }
    return `MALFORMED scrypt (${parts.length} parts)`;
  }
  return 'PLAIN-TEXT/UNKNOWN';
}

function maskPhone(value: string): string {
  const raw = value.replace(/[^\d]/g, '');
  if (raw.length <= 4) return `***${raw}`;
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

export async function GET(req: Request) {
  const adminSession = await getAdminSessionFromRequestCookies();
  const headerAuthorized = isAuthorizedByHeader(req);
  if (!adminSession && !headerAuthorized) {
    return Response.json(
      {
        ok: false,
        errorCode: 'unauthorized',
        message: 'Admin/developer login required. In non-production, you may use x-admin-diag-key header.',
      },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const querySchoolId = url.searchParams.get('schoolId')?.trim() || '';
  const schoolId =
    adminSession?.role === 'admin'
      ? (adminSession.schoolId || '')
      : (querySchoolId || adminSession?.schoolId || '');

  if (adminSession?.role === 'admin' && !schoolId) {
    return Response.json(
      {
        ok: false,
        errorCode: 'missing-school-scope',
        message: 'School scope is required for admin diagnostics.',
      },
      { status: 400 }
    );
  }

  const result: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    authMode: adminSession ? 'session' : 'non-prod-header',
    role: adminSession?.role || 'diagnostic',
    schoolScope: schoolId || null,
    supabaseConfigured: isSupabaseServiceConfigured(),
  };

  if (!isSupabaseServiceConfigured()) {
    result.error = 'Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
    return Response.json(result, { status: 200 });
  }

  const schoolFilter = schoolId ? [{ column: 'school_id', value: schoolId }] : [];

  try {
    const teachers = await supabaseSelect<TeacherRow>('teacher_profiles', {
      select: 'id,school_id,phone,staff_code,name,status,pin_hash,auth_email',
      filters: [{ column: 'status', value: 'active' }, ...schoolFilter],
      limit: 50,
    });
    result.teacherTableAccessible = true;
    result.activeTeacherCount = teachers.length;
    result.teachers = teachers.map((t) => ({
      id: t.id,
      schoolId: t.school_id,
      name: t.name,
      phoneMasked: maskPhone(t.phone),
      staffCode: t.staff_code,
      status: t.status,
      hasAuthEmail: !!t.auth_email,
      authMode: t.auth_email ? 'supabase-auth' : 'legacy-pin',
      pinHashStatus: describePinHash(t.pin_hash),
    }));
  } catch (err: unknown) {
    result.teacherTableAccessible = false;
    result.teacherTableError = err instanceof Error ? err.message : String(err);
  }

  try {
    const students = await supabaseSelect<StudentRow>('student_profiles', {
      select: 'id,school_id,roll_code,roll_no,name,status,class_level,pin_hash,auth_email',
      filters: [{ column: 'status', value: 'active' }, ...schoolFilter],
      limit: 50,
    });
    result.studentTableAccessible = true;
    result.activeStudentCount = students.length;
    result.students = students.map((s) => ({
      id: s.id,
      schoolId: s.school_id,
      name: s.name,
      rollCode: s.roll_code,
      rollNo: s.roll_no,
      classLevel: s.class_level,
      status: s.status,
      hasAuthEmail: !!s.auth_email,
      authMode: s.auth_email ? 'supabase-auth' : 'legacy-pin',
      pinHashStatus: describePinHash(s.pin_hash),
    }));
  } catch (err: unknown) {
    result.studentTableAccessible = false;
    result.studentTableError = err instanceof Error ? err.message : String(err);
  }

  try {
    const schools = await supabaseSelect<{ id: string; school_name: string; school_code: string; status: string }>(
      'schools',
      {
        select: 'id,school_name,school_code,status',
        filters: schoolId ? [{ column: 'id', value: schoolId }] : undefined,
        limit: 20,
      }
    );
    result.schoolTableAccessible = true;
    result.schools = schools.map((s) => ({
      id: s.id,
      name: s.school_name,
      code: s.school_code,
      status: s.status,
    }));
  } catch (err: unknown) {
    result.schoolTableAccessible = false;
    result.schoolTableError = err instanceof Error ? err.message : String(err);
  }

  result.loginInstructions = {
    teacher: 'POST /api/teacher/session/login with { schoolCode, identifier, password }',
    student: 'POST /api/student/session/login with { schoolCode, classLevel, rollNo, password }',
    parent: 'POST /api/parent/session/login with { phone, pin, schoolId? }',
  };

  return Response.json(result, { status: 200 });
}
