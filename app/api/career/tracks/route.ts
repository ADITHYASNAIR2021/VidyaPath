import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';
import { listCareerTracks, type CareerStream } from '@/lib/career-catalog';

export const dynamic = 'force-dynamic';

function toStream(value: string | null): CareerStream | undefined {
  if (value === 'pcm' || value === 'pcb' || value === 'commerce') return value;
  return undefined;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const url = new URL(req.url);
    const stream = toStream(url.searchParams.get('stream'));
    const tracks = listCareerTracks(stream);
    return dataJson({ requestId, data: { tracks } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load career tracks.';
    return errorJson({
      requestId,
      errorCode: 'career-tracks-read-failed',
      message,
      status: 500,
    });
  }
}
