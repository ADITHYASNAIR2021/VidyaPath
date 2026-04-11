import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { isSupportedSubject } from '@/lib/academic-taxonomy';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { assignTeacherToClassSection } from '@/lib/school-management-db';
import { getTeacherById } from '@/lib/teacher-admin-db';
import { recordAuditEvent } from '@/lib/security/audit';

export const dynamic = 'force-dynamic';

function readString(value: unknown, max = 120): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  const schoolId = adminSession.schoolId;
  if (!schoolId) {
    return errorJson({
      requestId,
      errorCode: 'missing-school-scope',
      message: 'School scope missing for admin session.',
      status: 400,
    });
  }

  const teacherId = params.id?.trim();
  if (!teacherId) {
    return errorJson({
      requestId,
      errorCode: 'missing-teacher-id',
      message: 'Teacher id is required.',
      status: 400,
    });
  }
  const teacher = await getTeacherById(teacherId, schoolId);
  if (!teacher) {
    return errorJson({
      requestId,
      errorCode: 'teacher-not-found',
      message: 'Teacher not found.',
      status: 404,
    });
  }

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 48 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }
  const body = bodyResult.value;
  const classSectionId = readString(body.classSectionId, 90);
  const role = body.role === 'subject_teacher' ? 'subject_teacher' : 'class_teacher';
  const subjectValue = readString(body.subject, 60);
  const subject = isSupportedSubject(subjectValue) ? subjectValue : undefined;
  if (!classSectionId) {
    return errorJson({
      requestId,
      errorCode: 'missing-class-section-id',
      message: 'classSectionId is required.',
      status: 400,
    });
  }
  if (role === 'subject_teacher' && !subject) {
    return errorJson({
      requestId,
      errorCode: 'subject-required',
      message: 'subject is required for subject_teacher role.',
      status: 400,
    });
  }

  try {
    const assignment = await assignTeacherToClassSection({
      schoolId,
      classSectionId,
      teacherId,
      role,
      subject,
    });
    const committedAt = new Date().toISOString();
    await recordAuditEvent({
      requestId,
      endpoint: '/api/admin/teachers/[id]/class-teacher-tag',
      action: 'admin-tag-teacher-class-role',
      statusCode: 200,
      actorRole: adminSession.role,
      actorAuthUserId: adminSession.authUserId,
      schoolId,
      metadata: {
        teacherId,
        classSectionId,
        role,
        subject,
        committedAt,
      },
    });
    return dataJson({
      requestId,
      data: { assignment },
      meta: { committedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to tag teacher.';
    const status = /required|valid|subject/i.test(message) ? 400 : 500;
    return errorJson({
      requestId,
      errorCode: 'admin-tag-teacher-class-role-failed',
      message,
      status,
    });
  }
}
