# VidyaPath RAG Indexing Playbook

This is the end-to-end pipeline for indexing CBSE papers + NCERT textbooks and preparing vectors for retrieval.

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

The runtime retriever auto-loads this file and uses precomputed vectors when available.

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

- Current default: `chunks.jsonl + chunk_vectors.jsonl` in repo (no paid vector DB).
- Supabase Postgres + `pgvector` (good free tier path, close to existing infra).
- Upstash Vector / Redis vector (low-ops external option, free tier available).

