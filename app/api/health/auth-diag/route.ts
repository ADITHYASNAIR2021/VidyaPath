/**
 * GET /api/health/auth-diag
 *
 * Diagnostic endpoint for debugging teacher/student login issues.
 * Shows Supabase connectivity, table access, data presence, and PIN hash format.
 * Requires the admin bootstrap key as ?key=<ADMIN_PORTAL_KEY> to prevent public exposure.
 *
 * Usage: http://localhost:3000/api/health/auth-diag?key=8136859455
 */

import { isSupabaseServiceConfigured, supabaseSelect } from '@/lib/supabase-rest';

export const dynamic = 'force-dynamic';

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url);
  const provided = url.searchParams.get('key')?.trim() ?? '';
  const configured =
    process.env.ADMIN_PORTAL_KEY?.trim() ||
    process.env.TEACHER_PORTAL_KEY?.trim() ||
    process.env.SESSION_SIGNING_SECRET?.trim();
  return !!configured && provided === configured;
}

interface TeacherRow {
  id: string;
  phone: string;
  staff_code: string | null;
  name: string;
  status: string;
  pin_hash: string;
  auth_email: string | null;
}

interface StudentRow {
  id: string;
  roll_code: string;
  roll_no: string | null;
  name: string;
  status: string;
  class_level: number;
  pin_hash: string | null;
  auth_email: string | null;
}

function describePinHash(hash: string | null | undefined): string {
  if (!hash) return 'NULL / empty — PIN check skipped (any PIN accepted for students; teachers would fail)';
  if (hash.startsWith('scrypt:')) {
    const parts = hash.split(':');
    if (parts.length === 3 && parts[1].length === 32 && parts[2].length === 64) {
      return 'OK — valid scrypt:salt:hash format';
    }
    return `MALFORMED scrypt — got ${parts.length} parts, salt len=${parts[1]?.length}, hash len=${parts[2]?.length}`;
  }
  return `PLAIN TEXT or unknown format ("${hash.slice(0, 16)}...") — verifyPin will always return false`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Provide ?key=<ADMIN_PORTAL_KEY> to access this endpoint.' }, { status: 401 });
  }

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    supabaseConfigured: isSupabaseServiceConfigured(),
  };

  if (!isSupabaseServiceConfigured()) {
    result.error = 'Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local';
    return Response.json(result, { status: 200 });
  }

  // --- Teachers ---
  try {
    const teachers = await supabaseSelect<TeacherRow>('teacher_profiles', {
      select: 'id,phone,staff_code,name,status,pin_hash,auth_email',
      filters: [{ column: 'status', value: 'active' }],
      limit: 20,
    });
    result.teacherTableAccessible = true;
    result.activeTeacherCount = teachers.length;
    result.teachers = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
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

  // --- Students ---
  try {
    const students = await supabaseSelect<StudentRow>('student_profiles', {
      select: 'id,roll_code,roll_no,name,status,class_level,pin_hash,auth_email',
      filters: [{ column: 'status', value: 'active' }],
      limit: 20,
    });
    result.studentTableAccessible = true;
    result.activeStudentCount = students.length;
    result.students = students.map((s) => ({
      id: s.id,
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

  // --- Schools ---
  try {
    const schools = await supabaseSelect<{ id: string; school_name: string; school_code: string; status: string }>(
      'schools',
      { select: 'id,school_name,school_code,status', limit: 20 }
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
    teacher: 'POST /api/teacher/session/login with { "identifier": "<phone or staff_code>", "password": "<pin>" }',
    student: 'POST /api/student/session/login with { "roll": "<roll_code or roll_no>", "password": "<pin>" }',
    note: 'If pinHashStatus shows PLAIN TEXT, run: npm run fix:pin-hashes (or reset PINs through admin portal)',
  };

  return Response.json(result, { status: 200 });
}
