export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  // Lightweight RAG check — reads a tiny counter file instead of
  // parsing the full 137MB chunks.jsonl (saves ~200ms per health check).
  let ragChunks = 0;
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const countPath = join(process.cwd(), 'lib', 'context', '.rag_count.json');
    if (existsSync(countPath)) {
      const raw = readFileSync(countPath, 'utf-8');
      const parsed = JSON.parse(raw) as { chunks?: number };
      ragChunks = typeof parsed.chunks === 'number' ? parsed.chunks : 0;
    } else {
      // Fallback: count chunks.jsonl directly (slow, cached after first read)
      const chunksPath = join(process.cwd(), 'lib', 'context', 'chunks.jsonl');
      if (existsSync(chunksPath)) {
        const content = readFileSync(chunksPath, 'utf-8');
        ragChunks = content.split('\n').filter(Boolean).length;
      }
    }
  } catch {
    // RAG check is best-effort
  }

  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    checks: {
      supabase: !!supabaseUrl,
      redis: !!(process.env.UPSTASH_REDIS_REST_URL),
      rag: { chunks: ragChunks, degraded: ragChunks === 0 },
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  });
}
