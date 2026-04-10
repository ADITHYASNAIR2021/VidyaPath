import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listCareerExams, type CareerStream } from '@/lib/career-catalog';

export const dynamic = 'force-dynamic';

function toStream(value: string | null): CareerStream | undefined {
  if (value === 'pcm' || value === 'pcb' || value === 'commerce') return value;
  return undefined;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const url = new URL(req.url);
    const track = toStream(url.searchParams.get('track'));
    const exams = listCareerExams(track);
    return dataJson({ requestId, data: { exams } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load career exams.';
    return errorJson({
      requestId,
      errorCode: 'career-exams-read-failed',
      message,
      status: 500,
    });
  }
}
