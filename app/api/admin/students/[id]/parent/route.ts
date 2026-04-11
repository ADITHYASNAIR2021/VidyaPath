import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { getStudentById } from '@/lib/teacher-admin-db';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { createOrUpdateParentLink } from '@/lib/parent-portal-db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, context: { params: { id: string } }) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);
  if (adminSession.role !== 'admin' || !adminSession.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'forbidden',
      message: 'Only school admins can create parent links.',
      status: 403,
    });
  }

  const studentId = context.params?.id?.trim();
  if (!studentId) {
    return errorJson({ requestId, errorCode: 'missing-student-id', message: 'Student id is required.', status: 400 });
  }

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const phone = typeof bodyResult.value.phone === 'string' ? bodyResult.value.phone.trim() : '';
  const pin = typeof bodyResult.value.pin === 'string' ? bodyResult.value.pin.trim() : '';
  const name = typeof bodyResult.value.name === 'string' ? bodyResult.value.name.trim() : undefined;

  if (!phone || !pin) {
    return errorJson({
      requestId,
      errorCode: 'missing-parent-fields',
      message: 'phone and pin are required.',
      status: 400,
    });
  }

  try {
    const student = await getStudentById(studentId, adminSession.schoolId);
    if (!student || !student.schoolId) {
      return errorJson({
        requestId,
        errorCode: 'student-not-found',
        message: 'Student not found in your school scope.',
        status: 404,
      });
    }

    const parent = await createOrUpdateParentLink({
      schoolId: student.schoolId,
      studentId: student.id,
      phone,
      pin,
      name,
    });

    return dataJson({
      requestId,
      data: {
        studentId: student.id,
        studentName: student.name,
        parent,
      },
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create parent link.';
    return errorJson({ requestId, errorCode: 'parent-link-create-failed', message, status: 500 });
  }
}

