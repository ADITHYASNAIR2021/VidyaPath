import { spawn } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getAdminSessionFromRequestCookies, unauthorizedJson } from '@/lib/auth/guards';
import { dataJson, errorJson, getRequestId } from '@/lib/http/api-response';

export const dynamic = 'force-dynamic';

interface CoverageRow {
  class_level: number;
  subject: string;
  total_chunks: number;
  with_embedding: number;
}

async function countJsonlLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function getCoverageStats(): Promise<CoverageRow[]> {
  try {
    const { isSupabaseServiceConfigured, supabaseRpc } = await import('@/lib/supabase-rest');
    if (!isSupabaseServiceConfigured()) return [];
    return await supabaseRpc<CoverageRow[]>('get_embedding_coverage_stats', {});
  } catch {
    return [];
  }
}

// GET /api/admin/embeddings — embedding coverage report
export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);

  try {
    const contextDir = path.join(process.cwd(), 'lib', 'context');
    const [papersCount, textbookCount, dbStats] = await Promise.all([
      countJsonlLines(path.join(contextDir, 'chunks.jsonl')),
      countJsonlLines(path.join(contextDir, 'textbook_chunks.jsonl')),
      getCoverageStats(),
    ]);

    const totalInDb = dbStats.reduce((sum, row) => sum + row.total_chunks, 0);
    const totalJsonl = papersCount + textbookCount;

    return dataJson({
      requestId,
      data: {
        summary: {
          jsonlChunks: { papers: papersCount, textbooks: textbookCount, total: totalJsonl },
          embeddedInDb: totalInDb,
          coveragePct: totalJsonl > 0 ? Math.round((totalInDb / totalJsonl) * 100) : 0,
        },
        byClassSubject: dbStats,
        ingestionCommand: 'node scripts/ingest_embeddings.mjs --skip-existing',
      },
    });
  } catch (error) {
    return errorJson({
      requestId,
      errorCode: 'embeddings-stats-failed',
      message: error instanceof Error ? error.message : 'Failed to load embedding stats.',
      status: 500,
    });
  }
}

// POST /api/admin/embeddings — trigger ingestion (Node.js runtime only; not available on Edge/Vercel serverless)
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const adminSession = await getAdminSessionFromRequestCookies();
  if (!adminSession) return unauthorizedJson('Admin session required.', requestId);

  if (process.env.VERCEL || process.env.NEXT_RUNTIME === 'edge') {
    return errorJson({
      requestId,
      errorCode: 'not-supported-on-edge',
      message: 'Ingestion trigger is only available in the local Node.js runtime. Run `node scripts/ingest_embeddings.mjs` manually.',
      status: 501,
    });
  }

  const body = await req.json().catch(() => ({}));
  const skipExisting = body?.skipExisting !== false;

  const scriptPath = path.join(process.cwd(), 'scripts', 'ingest_embeddings.mjs');
  const args = ['--batch-size', '32'];
  if (skipExisting) args.push('--skip-existing');

  const env = {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY ?? '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  };

  const child = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
    env,
  });
  child.unref();

  return dataJson({
    requestId,
    data: {
      started: true,
      pid: child.pid,
      message: 'Ingestion started in background. Check server logs for progress.',
      skipExisting,
    },
  });
}
