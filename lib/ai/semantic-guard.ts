import { createHash } from 'node:crypto';
import { sharedState } from '@/lib/runtime/shared-state';
import { recordBoundaryBlock, type BoundaryOrigin } from '@/lib/ai/boundary-policy';

const status = sharedState('semantic-guard-status', () => ({ checkedAt: null as string | null, available: false }));
const cache = new Map<string, { safe: boolean; expires: number }>();
export function getSemanticGuardStatus() { return { configured: !!process.env.AI_INJECTION_GUARD_URL, failClosed: true, model: 'protectai/deberta-v3-base-prompt-injection-v2 (optional local service)', ...status }; }

/** Optional second layer. A configured classifier outage blocks generation, never silently bypasses it. */
export async function inspectSemanticPayload(value: unknown, origin: BoundaryOrigin): Promise<boolean> {
  const endpoint = process.env.AI_INJECTION_GUARD_URL;
  if (!endpoint) return true;
  const target = new URL(endpoint);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))) throw new Error('Invalid safety classifier endpoint');
  const parts: string[] = [];
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') parts.push(entry);
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === 'object') Object.entries(entry).forEach(([key, item]) => { if (key !== 'imageBase64') visit(item); });
  };
  visit(value);
  const text = parts.join('\n');
  if (!text) return true;
  if (text.length > 64000) throw new Error('Safety classifier input exceeds limit');
  const digest = createHash('sha256').update(text).digest('hex');
  const hit = cache.get(digest);
  if (hit && hit.expires > Date.now()) return hit.safe;
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.AI_INJECTION_GUARD_TOKEN ? { Authorization: `Bearer ${process.env.AI_INJECTION_GUARD_TOKEN}` } : {}) }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) throw new Error('Safety classifier unavailable');
    const result = await response.json() as { safe?: boolean };
    if (typeof result.safe !== 'boolean') throw new Error('Invalid safety classifier response');
    Object.assign(status, { checkedAt: new Date().toISOString(), available: true });
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(digest, { safe: result.safe, expires: Date.now() + 10 * 60 * 1000 });
    if (!result.safe) recordBoundaryBlock(origin, 'instruction-override');
    return result.safe;
  } catch {
    Object.assign(status, { checkedAt: new Date().toISOString(), available: false });
    throw new Error('Safety classifier unavailable');
  }
}
