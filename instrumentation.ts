/**
 * Next.js Instrumentation Hook
 * Runs once at server startup (Node.js runtime only, not Edge).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use this to:
 *  1. Validate required environment variables - fail fast if misconfigured.
 *  2. Log the startup banner so deployment logs are self-documenting.
 */
function isLikelyRealNvidiaKey(value: string): boolean {
  if (!value.startsWith('nvapi-')) return false;
  return !['placeholder', 'replace', 'changeme', 'your_nvidia'].some((token) =>
    value.toLowerCase().includes(token),
  );
}

function shouldProbePgvector(): boolean {
  return process.env.AI_ENABLE_PGVECTOR_RAG === '1';
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertRequiredEnv } = await import('@/lib/config/env-validation');
  assertRequiredEnv();

  const version = process.env.npm_package_version ?? '0.1.0';
  const env = process.env.NODE_ENV ?? 'unknown';
  const region = process.env.VERCEL_REGION ?? process.env.FLY_REGION ?? 'local';
  console.info(`[VidyaPath] v${version} starting - env=${env} region=${region}`);

  if (!shouldProbePgvector()) {
    console.info('[VidyaPath] pgvector: startup probe disabled (set AI_ENABLE_PGVECTOR_RAG=1 to enable).');
    return;
  }

  const nvidiaKey = (process.env.NVIDIA_API_KEY ?? '').trim();
  const nvidiaOk = isLikelyRealNvidiaKey(nvidiaKey);
  if (!nvidiaOk) {
    console.warn('[VidyaPath] pgvector: NVIDIA_API_KEY missing/invalid, vector retrieval is disabled.');
    return;
  }

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.warn('[VidyaPath] pgvector: Supabase service credentials missing, vector readiness probe skipped.');
    return;
  }

  // Fire-and-forget readiness probe.
  Promise.resolve()
    .then(async () => {
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
          const missingTable = res.status === 404 || /does not exist|42P01|PGRST/i.test(body);
          if (missingTable) {
            console.warn(
              '[VidyaPath] pgvector: document_embeddings missing. Apply migration 20260418000600_pgvector_document_embeddings.sql, then run `node scripts/ingest_embeddings.mjs --skip-existing`.',
            );
          } else {
            console.warn(`[VidyaPath] pgvector: readiness probe failed (HTTP ${res.status}).`);
          }
          return;
        }

        const rangeHeader = res.headers.get('content-range') ?? '';
        const total = rangeHeader.split('/')[1] ?? '0';
        if (total === '0' || total === '*') {
          console.warn(
            '[VidyaPath] pgvector: document_embeddings is empty. Run `node scripts/ingest_embeddings.mjs --skip-existing`.',
          );
          return;
        }

        console.info(`[VidyaPath] pgvector: ready (${total} embeddings indexed).`);
      } catch {
        // Non-fatal network/startup race.
      }
    })
    .catch(() => undefined);
}
