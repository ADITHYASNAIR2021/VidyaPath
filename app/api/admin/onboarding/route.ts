import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getSchoolById } from '@/lib/platform-rbac-db';
import { listClassSectionsForSchool } from '@/lib/school-management-db';
import { listSchoolAnnouncements } from '@/lib/school-ops-db';
import { listTeachers } from '@/lib/teacher/auth.db';
import { listStudents } from '@/lib/teacher-admin-db';
import { resolveRequestSupabaseClient } from '@/lib/supabase/request-client';
import { getOnboardingState, upsertOnboardingStep } from '@/lib/admin/onboarding';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

interface PatchBody {
  stepId?: unknown;
  completed?: unknown;
  note?: unknown;
}

function sanitizeText(value: unknown, max = 400): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

async function getParentLinkCount(req: Request, schoolId: string): Promise<number> {
  const resolved = resolveRequestSupabaseClient(req, 'service-first');
  if (!resolved) return 0;
  const { count, error } = await resolved.client
    .from('parent_links')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('status', 'active');
  if (error) return 0;
  return typeof count === 'number' ? count : 0;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'missing-school-scope', message: 'School scope missing.', status: 403 });
  }

  try {
    const schoolId = session.schoolId;
    const [school, teachers, students, sections, announcements, parentLinks, manualState] = await Promise.all([
      getSchoolById(schoolId),
      listTeachers(schoolId),
      listStudents({ schoolId }),
      listClassSectionsForSchool(schoolId),
      listSchoolAnnouncements({ schoolId, limit: 10 }),
      getParentLinkCount(req, schoolId),
      getOnboardingState(schoolId),
    ]);

    const schoolProfileDone = Boolean(school?.schoolName && school?.board && school?.city && school?.state);
    const steps = [
      {
        id: 'school-profile',
        title: 'Complete school profile',
        description: 'Set school identity, board, location, and contact details.',
        done: schoolProfileDone,
        metric: schoolProfileDone ? 'Profile complete' : 'Missing key school fields',
        href: '/admin/settings',
      },
      {
        id: 'class-sections',
        title: 'Configure class and section structure',
        description: 'Create Class 10/12 sections and map batches.',
        done: sections.length > 0,
        metric: `${sections.length} sections configured`,
        href: '/admin/class-sections',
      },
      {
        id: 'teachers',
        title: 'Provision teachers',
        description: 'Create teacher accounts and assign subject scopes.',
        done: teachers.length > 0,
        metric: `${teachers.length} teachers onboarded`,
        href: '/admin/teachers',
      },
      {
        id: 'students',
        title: 'Import students',
        description: 'Create student records and validate section mapping.',
        done: students.length > 0,
        metric: `${students.length} students onboarded`,
        href: '/admin/students',
      },
      {
        id: 'parents',
        title: 'Link parents',
        description: 'Connect parent contacts and parent login credentials.',
        done: parentLinks > 0,
        metric: `${parentLinks} active parent links`,
        href: '/admin/students',
      },
      {
        id: 'communications',
        title: 'Launch communication channels',
        description: 'Publish first school announcements and alerts.',
        done: announcements.length > 0,
        metric: `${announcements.length} announcements published`,
        href: '/admin/announcements',
      },
    ];

    const manualById = new Map(manualState.steps.map((step) => [step.id, step]));
    const mergedSteps = steps.map((step) => {
      const manual = manualById.get(step.id);
      return {
        ...step,
        manualCompleted: manual?.completed ?? false,
        manualNote: manual?.note,
        manualCompletedAt: manual?.completedAt,
      };
    });

    const autoCompleted = mergedSteps.filter((step) => step.done).length;
    const manualCompleted = mergedSteps.filter((step) => step.manualCompleted).length;

    return dataJson({
      requestId,
      data: {
        generatedAt: new Date().toISOString(),
        schoolId,
        progress: {
          totalSteps: mergedSteps.length,
          autoCompleted,
          manualCompleted,
          completionPercent: Math.round((autoCompleted / Math.max(1, mergedSteps.length)) * 100),
        },
        steps: mergedSteps,
      },
    });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-onboarding-read-failed',
      message: error instanceof Error ? error.message : 'Failed to load onboarding status.',
      status: 500,
    });
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);
  const session = await getAdminSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Admin session required.', requestId);
  if (!session.schoolId) {
    return errorJson({ requestId, errorCode: 'missing-school-scope', message: 'School scope missing.', status: 403 });
  }

  let body: PatchBody | null = null;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return errorJson({ requestId, errorCode: 'invalid-body', message: 'Invalid JSON body.', status: 400 });
  }

  const stepId = sanitizeText(body?.stepId, 80);
  if (!stepId) {
    return errorJson({ requestId, errorCode: 'missing-step-id', message: 'stepId is required.', status: 400 });
  }

  const completed = typeof body?.completed === 'boolean' ? body.completed : undefined;
  const note = sanitizeText(body?.note, 500) || undefined;

  try {
    const state = await upsertOnboardingStep(session.schoolId, stepId, { completed, note });

    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/onboarding',
      action: 'admin-onboarding-step-updated',
      statusCode: 200,
      actorRole: session.role,
      actorAuthUserId: session.authUserId,
      schoolId: session.schoolId,
      metadata: {
        stepId,
        completed,
      },
    });

    return dataJson({ requestId, data: { state } });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'admin-onboarding-update-failed',
      message: error instanceof Error ? error.message : 'Failed to update onboarding step.',
      status: 500,
    });
  }
}
