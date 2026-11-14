# VidyaPath RAG Indexing Playbook

This is the end-to-end pipeline for indexing CBSE papers + NCERT textbooks and preparing vectors for retrieval.

For the current audit, every AI tool's data flow, prompt-injection controls, full chapter coverage and the optional database backend, read [AI security and retrieval operations](./AI_SECURITY_AND_RETRIEVAL.md) and [the generated chapter plan](./INDEXING_PLAN.md). The recommended entry point is `node scripts/reindex.mjs --apply --repair-metadata`; add `--reextract --vectors` when rebuilding extracted text and embeddings. Run `npm run eval:rag:report` afterwards.

## 1) Build/refresh HF paper map (all subjects)

```powershell
pwsh ./scripts/generate_hf_paper_index.ps1
```

This updates `lib/hfPaperIndex.json` with best local PDF path per key:
`paperType|year|class|subject|variant`.

## 2) Build paper context index

Default keeps unmapped chunks so broad subject retrieval works.

```bash
python scripts/build_context_index.py --max-files 0
```

Strict English-only mode (optional):

```bash
python scripts/build_context_index.py --max-files 0 --strict-english
```

Drop unmapped chunks (optional, chapter-only corpus):

```bash
python scripts/build_context_index.py --max-files 0 --drop-unmapped
```

## 3) Build semantic textbook chunks and merge into main RAG index

```bash
python scripts/build_textbook_index.py --merge-main-index
```

This creates:
- `lib/context/textbook_chunks.jsonl`
- `lib/context/textbook_chapter_index.json`

And merges into:
- `lib/context/chunks.jsonl`
- `lib/context/chapter_index.json`

## 4) Build local vector index (free)

```bash
node scripts/build_vector_index.mjs
```

Output:
- `lib/context/chunk_vectors.jsonl`

The long-running Node/Docker runtime can use these vectors when `AI_ENABLE_LOCAL_EMBEDDINGS=1` provides the matching query encoder. Vercel excludes the large vector/ONNX files and uses BM25 unless the optional matching hosted embedding/database path is configured.

## 5) Verify artifacts

```bash
node scripts/verify_context_index.mjs
node scripts/check_dataset_quality.mjs
```

## 6) Upload datasets to Hugging Face

CBSE papers:

```bash
python scripts/upload_to_hf.py \
  --repo-id AdithyaSNair/cbse-papers-2009-2025 \
  --folder dataset/cbse_papers
```

NCERT textbooks:

```bash
python scripts/upload_to_hf.py \
  --repo-id AdithyaSNair/ncert-textbooks-10-12 \
  --folder dataset/ncert_textbooks
```

## Free-first deployment options

- Serverless default: tracked `chunks.jsonl.gz`, textbook chunks and compressed BM25 index. No model download or provider call is needed to retrieve real source text. `npm run build` checks these exact artifacts before compiling; explicit file tracing includes them in each API function.
- `npm run compress:context` refreshes the deployment gzip files after rebuilding. Commit `lib/context/chunks.jsonl.gz` along with updated metadata and `retrieval_index.json.gz`. Large raw/vector files remain ignored.
- `npm run check:context-deploy` rejects missing, stale, corrupt, empty or disconnected deployment artifacts. `npm run check:function-sizes` checks the resulting serverless traces.
- The current completed local corpus uses multilingual E5 Small (384 dimensions). Query it with the same E5 encoder; MiniLM or NVIDIA queries cannot search that vector space. Rebuild before switching models.

## Semantic models and retrieval settings (reviewed 2026-11-14)

There is no universally best free model. Evaluate chapter hit rate, term recall, latency and memory on this corpus before promoting a replacement.

| Setting | Use | Cost and constraints |
| --- | --- | --- |
| BM25 + chapter/topic filtering | Always available, including serverless | No API calls or model downloads |
| `VECTOR_PROVIDER=local` | Build `Xenova/multilingual-e5-small` vectors locally, including Hindi/English | No inference fees; downloads weights, uses local CPU/RAM |
| `LOCAL_EMBED_MODEL=Xenova/all-MiniLM-L6-v2` | English-only alternative; requires a separate full rebuild to switch from E5 | No inference fees; weaker multilingual coverage |
| `AI_ENABLE_LOCAL_EMBEDDINGS=1` | Load the exact model named by vector metadata for query embeddings on Node/Docker | Disabled on Vercel; model cache in `.cache/embeddings` |
| `VECTOR_PROVIDER=nvidia` + `NVIDIA_API_KEY` | Build with `nvidia/nemotron-3-embed-1b`; override using `AI_EMBED_MODEL` | Hosted trial/quota terms apply; not unlimited free production hosting |
| `AI_ENABLE_NVIDIA_RERANK=1` | Rerank the larger candidate pool using `nvidia/llama-nemotron-rerank-1b-v2` | Requires a valid key; falls back to local ranking on failure |
| `AI_ENABLE_RETRIEVAL_LLM=1` | Optional HyDE/query expansion; evidence compression remains extractive | Off by default; shares the global AI budget |

PowerShell, local semantic build:

```powershell
$env:VECTOR_PROVIDER = 'local'
npm run build:vectors
$env:AI_ENABLE_LOCAL_EMBEDDINGS = '1'
npm run dev
```

The builder uses E5 `passage:` prefixes and the runtime uses `query:` prefixes. It preserves the previous vector file on errors and rejects mixed model spaces. A failed semantic build no longer silently replaces the index with lexical vectors. `VECTOR_PROVIDER=lexical` is an explicit baseline only.

The developer console shows per-chapter gaps, benchmark fingerprints, tool contracts and semantic configuration status. The retrieval test accepts a real question, bypasses all provider calls and on-demand extraction, and returns full excerpts and identities. An empty corpus remains empty; a filename/topic list is never presented as extracted source text.

Generation retains Gemini Flash-Lite and Groq GPT-OSS fallbacks. Cerebras, which requires billing in the existing registry, is removed from automatic defaults; explicit model overrides remain available. A free-tier model can still incur charges on a paid account, so provider billing/quota configuration remains an operator responsibility.

Sources: [E5 model card](https://huggingface.co/intfloat/multilingual-e5-small), [NVIDIA embedding API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-embed-1b-infer), [NVIDIA reranker](https://docs.api.nvidia.com/nim/reference/nvidia-llama-nemotron-rerank-1b-v2), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Groq model catalog](https://console.groq.com/docs/models).

