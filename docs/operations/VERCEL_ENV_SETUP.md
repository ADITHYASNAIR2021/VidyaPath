# Deployment environment — 20 November 2026

Static chapters/papers require no database or AI provider. Publish those first with `AI_PUBLIC_ENABLED=0`. Use Node **22.x** (pinned in package.json), `npm ci`, `npm run build`, and Next.js's default output directory. Configure `NEXT_PUBLIC_APP_URL` and a working `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` before public launch. Missing operator email is displayed honestly rather than inventing a contact inbox.

## Required for production AI

- `AI_PUBLIC_ENABLED=1` is an explicit launch switch, not proof of child suitability or provider permission. Leave it `0` until the review below is complete. It also provides an emergency pause.
- `AI_PUBLIC_PROVIDERS`: comma-separated provider IDs (`groq`, `mistral`, `nvidia`, `cerebras`) explicitly reviewed for the students' ages, regions, data handling and account terms. Empty means no providers approved. Only configure keys for approved providers. No provider is certified as child-appropriate by this code. Routing overrides and automatic fallbacks cannot escape this allowlist. Query helpers, hosted NVIDIA embeddings/reranking and Groq self-verification obey it too.
- **Gemini API is blocked for production student requests**, even if allowlisted/key-configured: its [current terms](https://aistudio.google.com/docs/terms#age-requirements) prohibit apps directed towards or likely accessed by under-18s (checked 20 November 2026). The Gemini-only image solver therefore stays unavailable in production. Changing to a paid Gemini API key does not remove that age restriction. Adult local evaluation remains separate from student deployment.
- At least one usable key for an eligible, reviewed provider. Cerebras remains explicit opt-in because its registered model requires billing. Free quota is not a child-data permission.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Shared limiter/budget outages block calls rather than resetting limits or failing open.
- `NEXT_PUBLIC_APP_URL`, set to the canonical site origin.
- For operator access: a random `DEVELOPER_DASHBOARD_KEY` of at least 24 characters. Never use a `NEXT_PUBLIC_` name for any secret.

## Corpus serving

The build includes paper chunks as `chunks.jsonl.gz`, `textbook_chunks.jsonl.gz`, compressed chapter maps, compressed BM25 index and `retrieval_manifest.json`. Prebuild verifies hashes. After Next.js finishes, the trace finalizer explicitly adds these six existing files to all 15 retrieval functions; dynamic filesystem reads can otherwise be omitted by tracing on Vercel. It removes offline/private references, then the independent verifier checks every page/API trace for privacy/size and all 15 retrieval functions for actual corpus files. Missing files/functions still fail the build. See [the deployment runbook](../DEPLOYMENT_RUNBOOK.md) for the optional private E5 service, exact upload destinations and rollback.

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
5. First confirm AI requests return `503 public-ai-paused` without contacting providers, while chapters/papers/privacy remain accessible. Provider activation is a separate rollout: confirm permitted ages/data terms, privacy contact and arrangements for children; teacher-review covered-chapter answers, adversarial and multilingual prompts; test shared-limit outages and budgets on the actual deployment/account. Automated safety checks and lexical grounding do not certify every model answer. Images remain unavailable until an eligible vision integration is implemented and evaluated.

Full procedures and private retrieval setup: [AI security and retrieval](../AI_SECURITY_AND_RETRIEVAL.md).
