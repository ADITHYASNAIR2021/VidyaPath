import { timingSafeEqual } from 'node:crypto';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isVercelCronRequest(req: Request): boolean {
  const marker = req.headers.get('x-vercel-cron');
  return typeof marker === 'string' && marker.trim().length > 0;
}

export function hasValidCronAuthorization(req: Request): boolean {
  const expectedSecret = (process.env.CRON_SECRET || '').trim();
  if (!expectedSecret) return process.env.NODE_ENV !== 'production';

  const auth = (req.headers.get('authorization') || '').trim();
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;
  return safeEqual(token, expectedSecret);
}
