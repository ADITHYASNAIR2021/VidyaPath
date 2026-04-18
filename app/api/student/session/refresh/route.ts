import {
  attachActiveRoleCookie,
  attachStudentSessionCookie,
  createStudentSessionToken,
} from '@/lib/auth/session';
import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await getStudentSessionFromRequestCookies();
  if (!session) return unauthorizedJson('Student session required.', requestId);
  if (!session.schoolId) {
    return errorJson({
      requestId,
      errorCode: 'student-school-missing',
      message: 'Student school scope is required to refresh session.',
      status: 403,
    });
  }

  const response = dataJson({
    requestId,
    data: {
      ...session,
      sessionExpiry: session.expiresAt,
      availableRoles: ['student'],
    },
  });
  attachActiveRoleCookie(response, 'student');
  attachStudentSessionCookie(
    response,
    createStudentSessionToken({
      studentId: session.studentId,
      studentName: session.studentName,
      rollCode: session.rollCode,
      classLevel: session.classLevel,
      stream: session.stream,
      section: session.section,
      schoolId: session.schoolId,
      schoolCode: session.schoolCode,
      batch: session.batch,
      mustChangePassword: session.mustChangePassword === true,
      enrolledSubjects: session.enrolledSubjects,
    })
  );
  return response;
}

