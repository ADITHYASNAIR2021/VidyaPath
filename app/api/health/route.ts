export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  // Lightweight RAG check without importing the heavy context-retriever
  let ragChunks = 0;
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const chunksPath = join(process.cwd(), 'lib', 'context', 'chunks.jsonl');
    if (existsSync(chunksPath)) {
      const content = readFileSync(chunksPath, 'utf-8');
      ragChunks = content.split('\n').filter(Boolean).length;
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
