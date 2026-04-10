import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { getChapterCareerMap } from '@/lib/career-catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const url = new URL(req.url);
  const chapterId = url.searchParams.get('chapterId')?.trim();
  if (!chapterId) {
    return errorJson({
      requestId,
      errorCode: 'missing-chapter-id',
      message: 'chapterId query parameter is required.',
      status: 400,
    });
  }
  const mapping = getChapterCareerMap(chapterId);
  if (!mapping) {
    return dataJson({ requestId, data: { chapterId, mapping: null } });
  }
  return dataJson({ requestId, data: { chapterId, mapping } });
}
