# Deployment environment — 14 November 2026

Static chapters/papers require no database. Production AI requires shared rate limits and at least one usable model key. Missing Redis protection pauses AI; it does not pause static study material.

## Required for production AI

- At least one of `GEMINI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, `MISTRAL_API_KEY`. The image solver specifically needs Gemini. Cerebras is explicit opt-in because the registered model requires billing.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Shared limiter/budget outages block calls rather than resetting limits or failing open.
- `NEXT_PUBLIC_APP_URL`, set to the canonical site origin.
- For operator access: a random `DEVELOPER_DASHBOARD_KEY` of at least 24 characters. Never use a `NEXT_PUBLIC_` name for any secret.

## Corpus serving

The build includes paper chunks as `chunks.jsonl.gz`, `textbook_chunks.jsonl.gz`, compressed chapter maps, compressed BM25 index and `retrieval_manifest.json`. `npm run build` verifies hashes, removes offline/private trace references and checks every page/API trace. See [the deployment runbook](../DEPLOYMENT_RUNBOOK.md) for the optional private E5 service, exact upload destinations and rollback.

`CONTEXT_CDN_URL` is optional and accepts an operator-managed HTTPS academic-corpus release matching the committed manifest. Bundled files are the default; no storage service is required.

## Quotas

- `AI_PUBLIC_DAILY_REQUESTS_PER_IP`: default 120.
- `AI_DAILY_TOKEN_BUDGET_GLOBAL`: default 1,000,000 reserved tokens/day, reset at 00:00 UTC.
- `AI_MAX_TOKENS_PER_REQUEST`: default 16,000 including system instructions, source evidence, history and maximum output. Provider attempts and JSON repairs reserve separately; reservation is conservative and differs from actual billed usage.
- Provider quotas and billing remain provider-side controls. A model with a free tier can charge on a paid account.

Vercel's platform-controlled forwarding header is used for IP limits. On another host, restrict direct origin access, have the reverse proxy overwrite a single client-IP header, and set `TRUSTED_PROXY_HEADER` (plus `TRUSTED_PROXY_HOPS` if needed). Unconfigured production origins use one shared unknown-IP bucket rather than trusting spoofed headers.

## Optional retrieval and safety

- `AI_ENABLE_NVIDIA_RERANK=0` disables the optional hosted reranker; local BM25 continues to work.
- `AI_ENABLE_RETRIEVAL_LLM=1` opts into budgeted query expansion. Source compression always preserves original sentences.
- `AI_ENABLE_LOCAL_EMBEDDINGS=1` enables the exact local model named by vector metadata on a long-running Node/Docker host. It is disabled on Vercel.
- `AI_INJECTION_GUARD_URL` enables a separately hosted/local text-injection classifier. Configured outages fail closed. See the full guide for setup and limits.
- `AI_VECTOR_BACKEND=remote`, `RETRIEVAL_SERVICE_URL` and `RETRIEVAL_SERVICE_KEY` connect the private E5 service. No external database is used.

## Deployment verification

1. `npm ci`, `npm run check:ci`, `npm run eval:rag:report`, `npm run build`, `npm run check:function-sizes`.
2. Commit the new corpus gzip, manifest and updated source metadata with the code.
3. Deploy, then check `/developer`: provider catalogs, every chapter's coverage, stale benchmark status, actual loaded chunk count, vector encoder/corpus, safety counters and a real question using the retrieval test.
4. Confirm unauthenticated developer APIs return 401 and cross-site mutations return 403.
5. Test representative benign prompts and image questions using the target deployment/account. Automated safety checks and lexical grounding do not certify every model answer.

Full procedures and private retrieval setup: [AI security and retrieval](../AI_SECURITY_AND_RETRIEVAL.md).
