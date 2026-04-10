import { dataJson, getRequestId } from '@/lib/http/api-response';
import { listCareerTracks, type CareerStream } from '@/lib/career-catalog';

export const dynamic = 'force-dynamic';

function toStream(value: string | null): CareerStream | undefined {
  if (value === 'pcm' || value === 'pcb' || value === 'commerce') return value;
  return undefined;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const url = new URL(req.url);
  const stream = toStream(url.searchParams.get('stream'));
  const tracks = listCareerTracks(stream);
  return dataJson({ requestId, data: { tracks } });
}
