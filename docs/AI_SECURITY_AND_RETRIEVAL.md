# AI data, safety and retrieval operations

Reviewed 14 November 2026. This describes the implemented code, the corpus shipped with this change and the remaining work. Changes are local; no deployment, database migration or corpus upload has been performed.

## Current result and unresolved work

- 54,260 unique chunks: 46,686 paper chunks and 7,574 textbook chunks; 64,499 BM25 documents. This includes seven recovered chunks from four pages omitted in the initial full extraction. The manifest reports zero malformed/duplicate chunks, missing BM25 chunk references, invalid vectors or missing vectors in the local vector file.
- 115 canonical chapters are listed individually in `/developer`, including book/PYQ/OCR counts, indexed/vector counts, source count, topic proxy, missing topics, reasons and suggested commands. **43 chapters require coverage review.** See [the generated chapter plan](./INDEXING_PLAN.md). Topic word overlap is a diagnostic proxy, not a content or correctness certificate.
- 23,569 chunks have a direct chapter mapping; 30,691 do not. Unmapped subject material remains available to subject search. A chapter match alone does not establish that an excerpt answers the question.
- Those are raw artifact counts. Runtime eligibility is lower after minimum-length/language/font-corruption/exam-instruction checks, safety quarantine and near-duplicate filtering. The dashboard reports the currently loaded eligible chunk count separately; it should not be interpreted as the raw corpus total.
- The current local-only benchmark passes **24/25** cases, with 100% chapter hit rate, 88% top-three term recall and 95% overall term recall. The remaining failing chapter case is `c12-eng-1` (The Last Lesson). One economics seed previously queried a demand curve against National Income Accounting; that seed was corrected. The final figures therefore are not an identical-seed before/after comparison.
- OCR-specific emitted chunks: **zero**. A diagram tag does not establish successful image understanding. Scanned pages and diagram-heavy questions need extraction/OCR review and a dedicated evaluation set.
- Local vectors cover all 54,260 chunk IDs using **Xenova/multilingual-e5-small, 384 dimensions**. The full local E5 build is complete. The reported local-only benchmark evaluates BM25/hybrid lexical retrieval, not semantic-query accuracy. A separate matching E5 query/index service is now supplied; cloud deployment and target-host load testing remain outstanding.

`lib/context/retrieval_manifest.json` is the machine-readable report. It pins deployed artifact hashes and records corpus, benchmark-question and retrieval-code fingerprints. The dashboard identifies stale benchmark results when any of those change.

## What each tool sends and returns

All routes use bounded JSON parsing, schema validation, canonical curriculum metadata, input safety checks, quota checks and successful-result scans. Text generators share the provider boundary in `lib/ai/generator.ts`; image solving uses a separate guarded vision boundary. API keys, environment variables and database credentials are never included in model prompts. Hosted providers receive the listed data when the configured model chain reaches them; fallback attempts may send that data to another configured provider.

| Tool / endpoint | Accepted student data | Data available to the model | Returned result and checks |
| --- | --- | --- | --- |
| Tutor `/api/ai-tutor` | Bounded chat history, canonical chapter ID | Up to the last 12 messages, server chapter metadata, retrieved excerpts | Tutor JSON, safety, actual source IDs, lexical grounding gate; no academic generation without safe evidence |
| Quiz `/api/generate-quiz` | Chapter, count, difficulty, optional notes | Server chapter/topics, bounded notes, excerpts | Valid questions with four distinct options and integer answer index; grounding and safety checks; no generic filler to reach a count |
| Flashcards `/api/generate-flashcards` | Chapter, count, optional notes | Server chapter/topics, notes, excerpts | Nonempty front/back cards; grounding and safety checks |
| Adaptive test `/api/adaptive-test` | Same-class/subject chapter IDs, count, difficulty | Canonical selection, excerpts across selected chapters, learning aggregates | Validated test; missing selected-chapter evidence blocks generation; practice readiness is not an exam prediction |
| Chapter pack `/api/chapter-pack` | Chapter ID | Canonical chapter, excerpts, PYQ metadata | Pack schema, grounding and safety checks |
| Chapter drill `/api/chapter-drill` | Chapter, count, difficulty, type | Chapter, excerpts, practice aggregates | Valid questions; grounded failure is reported; invented generic MCQs removed |
| Diagnosis `/api/chapter-diagnose` | Chapter, scores/study flags, recent mistakes | Chapter, excerpts, bounded learning aggregates | Valid diagnosis; safety and grounding checks; educational advice only |
| Remediation `/api/chapter-remediate` | Chapter, weak tags, available time | Chapter, excerpts, bounded tags | Valid plan; safety and grounding checks; no guaranteed score increase |
| Revision planner `/api/revision-plan` | Class, subject, exam date, hours, weak chapter IDs | Canonical chapter IDs, availability, excerpts if available | Planning JSON, known chapter IDs and safety checks; scheduling can work without source excerpts |
| Practice feedback `/api/paper-evaluate` | Known paper ID and bounded answers | Server paper metadata, submitted answers, subject excerpts | Qualitative feedback; `scoreEstimate: null`, `assessmentStatus: ungraded-no-marking-scheme`, no invented section marks. Without the verified question and marking scheme, answer length cannot establish correctness |
| Image solver `/api/image-solve` | Canonical chapter, image, optional question | Decoded/resized JPEG with metadata stripped, question, required chapter excerpts | Strict solution JSON, source validation, output scans, uncertainty status; no guessed answer fallback |
| Retrieval preview `/api/context-pack` | Canonical chapter, question, task | Optional hosted query/embedding/rerank helpers receive their required query/excerpt data | Source excerpts, metadata and retrieval diagnostics; no answer generation |
| Question feedback `/api/ai/question-feedback` | Chapter, outcomes, bounded issue note | No immediate model call; learning aggregates may inform later generation | Acknowledgment; validated input |
| Quality feedback `/api/ai/quality-feedback` | Chapter, issue category, bounded note | No model call | Acknowledgment; validated input |

The same inventory is implemented in `lib/ai/tool-registry.ts` and shown to authenticated developers. Client-supplied titles/topics cannot override canonical chapter data. Multi-chapter requests must match class/subject; unknown paper/chapter IDs are rejected. Broad requests without adequate evidence receive an unavailable response rather than fabricated source material.

For every tool that retrieves context, enabling the private E5 backend sends a bounded search query and curriculum scope to the operator's retrieval host. That service receives neither the whole conversation nor images, provider keys or source passage text. The query itself can contain student-entered text; it is private request data, not a public artifact. The service does not log queries, and returns IDs/similarity only. Hosted generation and optional hosted retrieval helpers have the separate boundaries listed above.

Indexing and retrieval helpers also have data boundaries: local E5/MiniLM encoders see academic passage text and search questions on the host; optional hosted embeddings receive passage/query text, and optional NVIDIA reranking receives the question and candidate excerpts. Opt-in HyDE/query expansion receives the question and chapter topics, but its output is search expansion, never authoritative evidence. The optional question verifier receives generated questions and bounded excerpts. Offline indexing defaults send nothing to hosted models. Explicit image-OCR extraction options in the Python builders can send public PDF-page crops to NVIDIA and produce untrusted OCR text; they are not enabled by the offline repair command and must not be used on student/private documents. OCR results need inspection before publication and pass runtime safety/quality gates before use.

## Prompt injection and output controls

1. Streamed request byte limits apply even when `Content-Length` is absent or false. Field, message, chapter and question counts are bounded before retrieval or provider calls.
2. `boundary-policy.ts` normalizes Unicode/zero-width/control characters and selected encodings, and detects known role/override, exfiltration, secret/PII and harmful-instruction patterns. This is a pattern layer with false positives and false negatives; it is not a general proof of safety. Normal curriculum biology is allowed.
3. Every generation receives a common system trust policy. Student notes, chat history including claimed assistant messages, images, OCR, source text and filenames are **untrusted data**. Providers are not given application tools, code execution, browsing, account access or permission to act on instructions found in that data.
4. Retrieved text is quarantined when it matches the injection policy. Sources are bounded, assigned server `S1…Sn` IDs and framed as JSON data. Evidence compression is extractive; generated paraphrases are not promoted into source facts. Missing extraction returns no evidence, never filenames/topic lists masquerading as evidence.
5. Output must pass task schemas, safety scans, real source ID/path validation and known chapter ID checks. Academic text generation also applies a lexical grounding gate; citation-required tasks need a valid citation. A source citation proves only that a source ID was supplied, not that the answer is entailed by it. The overlap gate cannot independently check calculations or factual reasoning.
6. A second, optional local injection classifier can inspect request text, retrieved text and returned JSON. Once configured, failure or invalid classifier responses block generation. Image pixels are not covered by this text classifier.
7. Every successful route result, including static fallbacks, is scanned before release. Rejected results are not exposed as successful AI answers. Provider exception bodies and invalid-response previews are not returned to students.

[OWASP recommends layered controls and describes the limits of prompt-injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html). No pattern list, classifier or system prompt makes every possible model response harmless or accurate. These controls reduce exposure and fail closed for recognized failures; adversarial and subject-expert evaluations remain necessary.

## Privacy, cost and abuse protection

- Production AI requires Upstash Redis for shared daily/per-route limits and the global token pool. Missing configuration or a configured limiter/budget outage blocks AI calls. Static chapters/papers remain available. Development uses memory only when Redis is not configured.
- Default per-attempt reservation: actual system/evidence/history text estimate plus maximum output, capped at 16,000 tokens; daily shared default 1,000,000 tokens. JSON retries, fallback providers, optional retrieval helpers and vision calls also reserve budget. Estimates are conservative allowances, not tokenization/billing guarantees. Provider-side hard quotas are still required.
- Existing environment overrides take precedence over defaults. In particular, a 9,000-token cap cannot admit vision's conservative 8,192-image + 1,800-output allowance plus text. The local nonsecret cap was corrected to 16,000; configure the deployment separately. Provider account/billing limits were not changed.
- Production IP attribution trusts Vercel's controlled header. Another reverse proxy requires an explicit `TRUSTED_PROXY_HEADER` and hop count; the edge must overwrite client input. With no trusted source all unknown addresses share a bucket, preventing arbitrary header spoofing from obtaining fresh quotas. See [Vercel's header behavior](https://vercel.com/docs/headers/request-headers).
- Logs/metrics retain counts, model names, latency and decisions, not prompt or image bodies. Sentry strips request payloads, auth headers/cookies, user data, extras, breadcrumbs and URL queries; session replay is disabled. Chat/paper evaluation responses are not cached. Other short-lived response caching is server-side and keyed with SHA-256; changing its scope warrants privacy review.
- Image handling verifies decoded format, limits decoded pixels/bytes, rejects animation, resizes and re-encodes to remove EXIF/location metadata. Text inside a photographed question can still contain private data. The UI tells students to crop names/faces; no face detector or full image PII scrubber is claimed.
- Hosted provider retention/training policies and free-tier terms are external to this app. Do not submit private school records, names, credentials or identifiable images. Pattern checks cannot recognize all private data. Provider keys must remain server-side; never use `NEXT_PUBLIC_` names for secrets.
- Developer endpoints require an authenticated operator session, use no-store responses and expose configuration presence rather than secret values. Corpus export and packaging are CLI-only and are not exposed to student prompts.

## Rebuild and quality workflow

Run from `D:\VidyaPath`. These scripts use local public academic PDFs/chunks; student chat/answers are not an indexing source.

```powershell
# Read-only plan and fresh coverage report
npm run rag:repair
npm run report:retrieval

# Fix labels from actual PDF chapter headings, then rebuild BM25/gzip/manifest
node scripts/reindex.mjs --apply --repair-metadata

# Parse all local paper/textbook PDFs as well (no dataset download)
node scripts/reindex.mjs --apply --repair-metadata --reextract

# Optional: also rebuild the entire semantic corpus with free local E5
node scripts/reindex.mjs --apply --repair-metadata --reextract --vectors

# Always evaluate the resulting corpus and refresh benchmark fingerprints
npm run eval:rag:report
npm run check:context-deploy
npm run check:ci
npm run build
npm run check:function-sizes
```

`reindex.mjs` backs up existing artifacts under `.cache/rag-backup-*`, restores saved files on failure, and never publishes. It clears hosted OCR/embedding keys for offline rebuilds. `--vectors` downloads local model weights if not cached and consumes CPU/RAM; it does not consume an inference API quota. Install the project's Python PDF dependencies when using `--repair-metadata`/`--reextract`; scanned pages are not automatically solved by offline OCR. The extraction command caps each paper at 100 pages: increase/review extraction separately for longer source books.

The expanded run produced chunks from 444 textbook source files. Post-extraction repair corrected 348 chapter assignments (including deliberately unmapping unsupported or ambiguous sources); 347 sources remain without a canonical chapter. Many are subjects/editions outside the current 115-chapter catalog. The rebuild sequence now repairs metadata AFTER extraction and uses PDF heading layout before cleaned body text. Both chapter-source and chapter-chunk maps are synchronized. The repair preserves IDs and text, so vectors stay compatible; an ID prefix is opaque and may reflect an old label. Text changes or new IDs require matching embeddings. See [the full rebuild follow-up](./reindex-2026-11-14.md).

For a chapter flagged in the plan: inspect the matching PDF and extracted passage, establish edition/title, obtain missing local source PDFs if needed, run the full appropriate builder, regenerate the retrieval report and test representative questions. A builder cannot create a missing book or establish an OCR transcription's correctness. Keep unresolved source IDs unmapped until there is evidence.

## How indexes and chunks are served

**Default, implemented now:** ship the pinned corpus with the app. The API loads `chunks.jsonl.gz`, `textbook_chunks.jsonl.gz`, compressed chapter maps and compressed BM25 once per warm process. Retrieval uses class/subject/chapter filters, exact-question BM25, topic signals, scale-independent rank fusion, actual-passage term matching, deduplication and extractive excerpts. Raw BM25/heuristic/cosine scores are not added across incompatible scales. No vector database, hosted embedding service or model download is required for this path. Cold starts still pay decompression/parsing/RAM cost; measure real deployment latency and memory.

The prebuild gate checks real deployed files, reference integrity and SHA-256 hashes. Explicit Next tracing includes them in page/API functions; postbuild normalizes/prunes offline-only paths across platforms, then verifies all resulting page/API traces against the configured 240 MiB guardrail and rejects private artifacts. The compressed core totals about 41.5 MiB before the manifest. Commit both chunk gzip files, compressed index/maps and manifest together. Raw chunks, datasets, local caches and large vectors are excluded from Vercel functions.

`config/context-deployment.cjs` defines the 15 server entries that actually read chapter/retrieval data. Next's tracing includes and the postbuild gate share that contract. Every listed function must have a trace and all six corpus artifacts; unrelated pages/APIs and framework fallbacks do not require the corpus. Size/privacy checks apply to every page/API trace. Retrieval metadata identifies private-service use as `usedRemoteIndex`; no external database backend or service-role credential is used.

**Optional semantic service, implemented now:** `services/retrieval` contains a bounded, bearer-authenticated E5 query encoder and compact exact vector search. Export the existing vectors using `scripts/export_semantic_release.mjs --apply`, then package them using `scripts/package_retrieval_service.mjs`. The resulting directory goes to a separate VM. The service returns IDs/scores only; the web app verifies corpus/vector digests, resolves IDs against its own source text and rechecks curriculum scope. Errors fall back to BM25. Configure `AI_VECTOR_BACKEND=remote`, `RETRIEVAL_SERVICE_URL` and `RETRIEVAL_SERVICE_KEY` only on the web server. Do not enable local ONNX inference on Vercel. See [the exact upload and deployment runbook](./DEPLOYMENT_RUNBOOK.md).

**Optional CDN:** immutable public academic releases are supported. Local artifacts are preferred; fallback CDN content must match the manifest pinned in the application. Remote fetches have deadlines and decompression limits. A matching hash provides integrity relative to the committed manifest; it does not establish that the underlying corpus is factually correct.

An existing HTTPS academic CDN can optionally host an immutable copy of the five compressed core artifacts and matching manifest. Set `CONTEXT_CDN_URL` only after verifying the files match the committed hashes. Bundled files remain the default; no storage account or upload tool is required.

## Free models and semantic serving

There is no substantiated universal "best free" model. The no-inference-fee baseline is BM25 plus local embedding inference. The recommended new local vector build uses `Xenova/multilingual-e5-small` q8 (384 dimensions), with E5 `passage:` and `query:` prefixes. The current full corpus uses E5; any separate MiniLM corpus must use its original encoder. See the [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small). Enable `AI_ENABLE_LOCAL_EMBEDDINGS=1` only on a long-running Node/Docker host with the exact model available; local ONNX query inference is disabled on Vercel.

Gemini/Groq/Mistral/NVIDIA generation fallbacks remain configurable. Live catalogs listed the configured default chat IDs during review, but this does not verify each account's quota or answer quality. Automatic Cerebras fallback was removed because its registered model requires billing. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) and [Groq's model catalog](https://console.groq.com/docs/models) can change. NVIDIA embedding/reranking require a valid key and trial/paid quota; they are optional, not guaranteed unlimited free services.

The private E5 service serves the complete existing vector index without a database. Use the export/package commands and VM instructions in the deployment runbook. No SQL migration, database service-role credential or database ingestion job is part of the app.

## Optional local injection classifier

This layer is implemented but **not enabled or model-tested in this environment**. It uses [Protect AI's DeBERTa text injection classifier](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2). Install in an isolated environment; review/pin the Python dependency versions under your deployment policy before production use.

```powershell
python -m venv .cache/guard-venv
.\.cache\guard-venv\Scripts\python.exe -m pip install torch transformers
$env:AI_INJECTION_GUARD_TOKEN = '<random-server-only-token>'
.\.cache\guard-venv\Scripts\python.exe scripts/serve_injection_guard.py
```

In the app process, set `AI_INJECTION_GUARD_URL=http://127.0.0.1:8899/classify` and the same token. The service listens only on loopback, limits concurrent work, classifies overlapping token windows, refuses oversized requests and does not log text. A remote deployment needs authenticated HTTPS and suitable network isolation. The Node client has an eight-second deadline, hashes cache keys and blocks generation on classifier failure. Vercel cannot reach your laptop's loopback; deploy the service beside the application or on an authenticated network endpoint.

This model detects some instruction attacks; it is neither a factual checker nor a visual safety model. English-focused classifier performance does not establish coverage for all Hindi/other-language attacks. Run multilingual benign/adversarial evaluations and monitor false rejections before enabling it for students.

## Release verification and limits

The source tests exercise malicious input on all 14 routes before retrieval/provider calls, actual shared-provider payload framing, poisoned evidence, missing evidence, fabricated citations, invalid questions, request streaming, privacy, proxy attribution, budget failure and optional backend contracts. They do not exercise every route against every real provider. The retrieval benchmark is small and curated; expand it with answer-bearing passages and teacher-reviewed answers, calculations, Hindi questions, OCR and diagram cases.

Before production activation: run the documented checks, deploy matching artifacts, verify authenticated developer retrieval on the target host, test shared Redis throttling/outages, provider quotas and image generation, and measure cold-start memory/latency. The full local E5 embedding build is complete. The optional classifier and Docker container, and target-host semantic-query load testing remain unverified integrations. An empty npm vulnerability report covers known JavaScript advisories at check time; it does not certify the application or optional Python environment.

The latest local deployment/service verification and remaining upload steps are recorded in [the deployment runbook](./DEPLOYMENT_RUNBOOK.md). Chapter statistics now use the pinned gzip corpus and do not fill missing paper-year history from editorial defaults; marks and focus-topic summaries remain explicitly heuristic guidance.
