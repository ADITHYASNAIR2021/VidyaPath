import { Rating } from 'ts-fsrs';
import { getStudentSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { parseJsonBodyWithLimit } from '@/lib/http/request-body';
import { listDueSrsCards, reviewSrsCard } from '@/lib/study-enhancements-db';

export const dynamic = 'force-dynamic';

function toRating(value: unknown): Rating | null {
  if (typeof value === 'number') {
    if ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].includes(value)) return value as Rating;
    return null;
  }
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (key === 'again') return Rating.Again;
    if (key === 'hard') return Rating.Hard;
    if (key === 'good') return Rating.Good;
    if (key === 'easy') return Rating.Easy;
  }
  return null;
}

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

  const bodyResult = await parseJsonBodyWithLimit<Record<string, unknown>>(req, 64 * 1024);
  if (!bodyResult.ok) {
    return errorJson({
      requestId,
      errorCode: bodyResult.reason,
      message: bodyResult.message,
      status: bodyResult.reason === 'payload-too-large' ? 413 : 400,
    });
  }

  const cardId = typeof bodyResult.value.cardId === 'string' ? bodyResult.value.cardId.trim() : '';
  const rating = toRating(bodyResult.value.rating);
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

