/**
 * Next.js Instrumentation Hook
 * Runs once at server startup (Node.js runtime only, not Edge).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this to:
 *  1. Validate required environment variables — fail fast if misconfigured.
 *  2. Log the startup banner so deployment logs are self-documenting.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertRequiredEnv } = await import('@/lib/config/env-validation');
    assertRequiredEnv();

    const version = process.env.npm_package_version ?? '0.1.0';
    const env = process.env.NODE_ENV ?? 'unknown';
    const region = process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local';
    console.info(`[VidyaPath] v${version} starting — env=${env} region=${region}`);

    // ── RAG / pgvector readiness probe (non-blocking) ─────────────────────
    const nvidiaKey = (process.env.NVIDIA_API_KEY ?? '').trim();
    const nvidiaOk = nvidiaKey.startsWith('nvapi-') &&
      !['placeholder', 'replace', 'changeme', 'your_nvidia'].some((t) => nvidiaKey.toLowerCase().includes(t));

    if (!nvidiaOk) {
      console.warn('[VidyaPath] NVIDIA_API_KEY not configured — pgvector RAG disabled, using local FNV-1a fallback.');
    }

    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

    if (nvidiaOk && supabaseUrl && serviceKey) {
      // Fire-and-forget: probe document_embeddings row count
      Promise.resolve().then(async () => {
        try {
          const res = await fetch(`${supabaseUrl}/rest/v1/document_embeddings?select=id&limit=1`, {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              Prefer: 'count=exact',
              'Range-Unit': 'items',
              Range: '0-0',
            },
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            if (body.includes('does not exist') || body.includes('42P01')) {
              console.warn('[VidyaPath] pgvector: document_embeddings table missing — apply migration 20260418000600 then run `node scripts/ingest_embeddings.mjs`.');
            } else {
              console.warn(`[VidyaPath] pgvector: table probe failed (HTTP ${res.status}) — pgvector RAG may be unavailable.`);
            }
            return;
          }
          const rangeHeader = res.headers.get('content-range') ?? '';
          const total = rangeHeader.split('/')[1] ?? '0';
          if (total === '0' || total === '*') {
            console.warn('[VidyaPath] pgvector: document_embeddings is empty — run `node scripts/ingest_embeddings.mjs` to seed embeddings.');
          } else {
            console.info(`[VidyaPath] pgvector: ready — ${total} embeddings indexed.`);
          }
        } catch {
          // Network error during probe — not fatal
        }
      }).catch(() => undefined);
    }
  }
}
