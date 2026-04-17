import { Rating } from 'ts-fsrs';
import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseAndValidateJsonBody, bodyReasonToStatus } from '@/lib/http/request-body';
import { srsReviewSchema } from '@/lib/schemas/student-srs';
import { listDueSrsCards, reviewSrsCard } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  try {
    const cards = await listDueSrsCards({
      studentId: studentSession.studentId,
      classLevel: studentSession.classLevel,
      subjectAllowList: studentSession.enrolledSubjects,
      limit: 20,
    });
    return dataJson({ requestId, data: { cards } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load SRS cards.';
    return errorJson({ requestId, errorCode: 'srs-read-failed', message, status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const studentSession = await getStudentSessionFromRequestCookies();
  if (!studentSession) return unauthorizedJson('Student session required.', requestId);

  const bodyResult = await parseAndValidateJsonBody(req, 64 * 1024, srsReviewSchema);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyReasonToStatus(bodyResult.reason),
      issues: bodyResult.issues,
    });
  }

  const { cardId, rating: ratingRaw } = bodyResult.value;
  // Map enum string to ts-fsrs Rating number
  const ratingMap: Record<string, number> = { Again: Rating.Again, Hard: Rating.Hard, Good: Rating.Good, Easy: Rating.Easy };
  const rating = ratingMap[ratingRaw] ?? null;
  if (!cardId || rating === null) {
    return errorJson({
      requestId,
      errorCode: 'invalid-srs-review-payload',
      message: 'cardId and rating are required.',
      status: 400,
    });
  }

  try {
    const next = await reviewSrsCard({
      studentId: studentSession.studentId,
      cardId,
      rating,
    });
    return dataJson({
      requestId,
      data: { cardId, next },
      meta: { committedAt: new Date().toISOString() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to review SRS card.';
    return errorJson({ requestId, errorCode: 'srs-review-failed', message, status: 500 });
  }
}

