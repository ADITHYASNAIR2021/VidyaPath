# VidyaPath

VidyaPath is a free, open-source CBSE learning platform for Class 10 and 12. It provides AI-generated quizzes, adaptive tests, chapter drills, flashcards, and revision plans grounded in NCERT textbooks and past board exam papers.

**Who is this guide for?** Anyone — even if you have never set up a Next.js or AI project before. Every step below is explained with a reason.

## Official Links

| Resource | URL |
|----------|-----|
| GitHub | https://github.com/ADITHYASNAIR2021/VidyaPath |
| Hugging Face — NCERT Textbooks | https://huggingface.co/datasets/AdithyaSNair/ncert-textbooks-10-12 |
| Hugging Face — CBSE Papers 2009–2025 | https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025 |

---

## Table of Contents

1. [How It Works (Overview)](#how-it-works)
2. [Prerequisites](#prerequisites)
3. [Fork and Clone](#fork-and-clone)
4. [Environment Setup](#environment-setup)
5. [Install Dependencies](#install-dependencies)
6. [Download Datasets from Hugging Face](#download-datasets)
7. [Build Chunks and Context Artifacts](#build-chunks)
8. [Image OCR (Optional but Recommended)](#image-ocr)
9. [Supabase Setup](#supabase-setup)
10. [Ingest Embeddings into Supabase](#ingest-embeddings)
11. [Run the App](#run-the-app)
12. [AI Pipeline — What Was Built](#ai-pipeline)
13. [Useful Commands](#useful-commands)
14. [Troubleshooting](#troubleshooting)

---

## How It Works

```
PDF papers + NCERT textbooks
        │
        ▼
  Python chunking script
  (semantic splitting by section/question boundary)
        │
        ▼
  lib/context/chunks.jsonl          ← board paper chunks
  lib/context/textbook_chunks.jsonl ← NCERT textbook chunks
        │
        ▼
  HyDE query expansion + MMR retrieval
  (finds the most relevant, non-redundant context)
        │
        ▼
  Multi-provider LLM (NVIDIA → Gemini → Groq → Cerebras → Mistral)
  + Subject-specific prompts + Few-shot PYQ examples
        │
        ▼
  Self-verification pass (Groq checks answers)
        │
        ▼
  CBSE-style MCQs, drills, flashcards, revision plans
```

The app never invents questions from thin air. Every question is grounded in retrieved NCERT content and past board paper patterns.

---

## Prerequisites

Install these before anything else:

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 18+ | Runs the Next.js app |
| npm | 9+ | Installs JavaScript packages |
| Python | 3.10+ | Runs the chunking and OCR scripts |
| Git | any | Clones the repo |

**Install Python packages** (all in one command):

```bash
pip install pypdf requests huggingface_hub pymupdf
```

- `pypdf` — reads PDF text
- `huggingface_hub` — downloads datasets from Hugging Face
- `pymupdf` — extracts images from PDFs for OCR (needed for diagram-heavy chapters)
- `requests` — HTTP calls used by the OCR pipeline

**Install the Hugging Face CLI** (needed to download datasets):

```bash
pip install huggingface_hub[cli]
```

Or if `hf` is not found after that, try:

```bash
pip install -U "huggingface_hub[cli]"
```

---

## Fork and Clone

If you just want to run it locally:

```bash
git clone https://github.com/ADITHYASNAIR2021/VidyaPath.git
cd VidyaPath
```

If you want to contribute back from your own fork on GitHub, add the upstream remote after cloning your fork:

```bash
git remote add upstream https://github.com/ADITHYASNAIR2021/VidyaPath.git
```

---

## Environment Setup

Create a file called `.env.local` in the project root. You can copy the template:

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in your values. Here is what each variable does:

### Required — App Security

```env
SESSION_SIGNING_SECRET=replace_with_long_random_secret_min_32_chars
TEACHER_PORTAL_KEY=replace_with_teacher_secret
```

Generate a random secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Required — Supabase Database

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Get these from your Supabase project → Settings → API.

### AI Providers — At Least One Required

The app tries providers in this order: **NVIDIA → Gemini → Groq → Cerebras → Mistral**.
You only need one. Groq is the easiest (free, no credit card):

| Provider | Sign Up | Free Tier |
|----------|---------|-----------|
| Groq | https://console.groq.com | Yes — very fast |
| Cerebras | https://cloud.cerebras.ai | Yes — key starts with `csk-` |
| Mistral | https://console.mistral.ai | Yes — limited |
| Gemini | https://aistudio.google.com | Yes — generous |
| NVIDIA | https://build.nvidia.com | Yes — needed for pgvector embeddings |

```env
NVIDIA_API_KEY=nvapi-...
GEMINI_API_KEY=...
GROQ_API_KEY=gsk_...
CEREBRAS_API_KEY=csk-...
MISTRAL_API_KEY=...
```

### Optional — Advanced AI Features

```env
# Self-verification: Groq checks each generated answer for correctness
# Requires GROQ_API_KEY. Set to 1 to enable (adds ~1s latency per quiz).
AI_ENABLE_SELF_VERIFY=1

# Timeout for all LLM API calls in milliseconds (default: 30000)
AI_REQUEST_TIMEOUT_MS=30000

# Enable semantic re-ranking of retrieved context chunks using NVIDIA
# Requires NVIDIA_API_KEY and improves retrieval quality significantly
AI_ENABLE_NVIDIA_RERANK=1

# Enable pgvector semantic retrieval from Supabase document_embeddings table
# Requires NVIDIA_API_KEY for query embedding and populated embeddings table
AI_ENABLE_PGVECTOR_RAG=1
```

---

## Install Dependencies

```bash
npm install
```

This installs all JavaScript/TypeScript packages. Takes 1–3 minutes on first run.

---

## Download Datasets

The app needs two datasets to generate grounded questions:

1. **NCERT Textbooks** — Class 10 and 12 Science, Math, Commerce, English PDFs
2. **CBSE Board Papers** — Past exam papers from 2009 to 2025

### Step 1: Log in to Hugging Face

```bash
hf auth login
```

This opens a browser to log in (or paste your token). Your token is at https://huggingface.co/settings/tokens — use a "Read" token.

If the `hf` command is not found, use the Python module directly:

```bash
python -m huggingface_hub.commands.huggingface_cli auth login
```

### Step 2: Download the datasets

```bash
# CBSE board exam papers (2009–2025), ~800 MB
hf download AdithyaSNair/cbse-papers-2009-2025 \
  --repo-type dataset \
  --local-dir dataset/cbse_papers

# NCERT textbooks (Class 10 + 12 all subjects), ~500 MB
hf download AdithyaSNair/ncert-textbooks-10-12 \
  --repo-type dataset \
  --local-dir dataset/ncert_textbooks
```

After download, you should see:

```
dataset/
  cbse_papers/
    2024/Class_12/Physics/...
    2023/Class_12/Chemistry/...
    ...
  ncert_textbooks/
    Class_10/Science/...
    Class_12/Physics/...
    ...
```

**Slow internet?** Download only a specific subject:

```bash
hf download AdithyaSNair/cbse-papers-2009-2025 \
  --repo-type dataset \
  --local-dir dataset/cbse_papers \
  --include "*/Class_12/Physics/*"
```

---

## Build Chunks

This step reads all PDFs and creates the retrieval index that the AI uses when generating questions.

```bash
# 1. Build chunks from CBSE board papers
npm run build:context

# 2. Build chunks from NCERT textbooks
npm run build:textbooks

# 3. Remove duplicate chunks
npm run clean:chunks

# 4. Build local hash-based vectors (for fast offline retrieval)
npm run build:vectors

# 5. Verify the artifacts look correct
npm run verify:context
```

**What does each step produce?**

| File | Contents | Used for |
|------|----------|----------|
| `lib/context/chunks.jsonl` | ~3000–8000 text chunks from board papers | Question grounding |
| `lib/context/chapter_index.json` | Maps chapter IDs to source PDF paths | Fast chapter lookup |
| `lib/context/textbook_chunks.jsonl` | Text chunks from NCERT textbooks | NCERT definitions in prompts |
| `lib/context/textbook_chapter_index.json` | Textbook source map | Textbook lookup |
| `lib/context/chunk_vectors.jsonl` | 192-dim hash embeddings per chunk | Semantic similarity scoring |

**What is semantic chunking?**

The Python script (`scripts/build_context_index.py`) does not just split text every N words. It uses three levels of splitting:

1. **Section boundary** — splits on headings like "SECTION A", "Section B"
2. **Question boundary** — splits before "Q1.", "Question 2", "(a)", "(i)" patterns
3. **Sentence boundary** — splits on sentence endings within paragraphs

Each chunk carries metadata: `sourceType` (paper / textbook / image-ocr), `chapterId`, `year`, `paperType` (board / sample / compartment), `page`.

---

## Image OCR

Many CBSE papers contain diagrams (circuit diagrams, ray optics, biology diagrams) that are images, not text. The OCR pipeline extracts these images and sends them to NVIDIA's OCR API to get their text content.

**This requires:**
- `pymupdf` installed (`pip install pymupdf`)
- A valid `NVIDIA_API_KEY`

**Run with image extraction:**

```bash
python scripts/build_context_index.py \
  --dataset-root dataset/cbse_papers \
  --extract-images \
  --nvidia-api-key YOUR_NVIDIA_API_KEY
```

Or for NCERT textbooks:

```bash
python scripts/build_context_index.py \
  --dataset-root dataset/ncert_textbooks \
  --extract-images \
  --nvidia-api-key YOUR_NVIDIA_API_KEY \
  --output-dir lib/context \
  --output-prefix textbook
```

OCR chunks are stored with `"sourceType": "image-ocr"` and receive a score bonus during retrieval so diagram-based questions are better grounded.

**Skip OCR** if you don't have an NVIDIA key — the text-only pipeline still works well.

---

## Supabase Setup

### Create a Supabase project

1. Go to https://supabase.com and create a free project
2. Wait for it to initialize (~2 minutes)
3. Copy the project URL and keys into `.env.local` (see [Environment Setup](#environment-setup))

### Link and push migrations

```bash
# Install Supabase CLI (once)
npm install -g supabase

# Log in
npx supabase login

# Link to your project (find your ref in Supabase dashboard URL)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push all database migrations
npm run db:push
```

### Seed with demo data (optional)

If you want to test with pre-made students, teachers, and classes:

```bash
npm run db:reset-full
```

**Warning:** This clears all existing data in the database. Only use on a fresh project.

---

## Ingest Embeddings

This step takes the chunks you built and stores high-dimensional NVIDIA embeddings in Supabase for semantic search. It requires:
- `NVIDIA_API_KEY` set
- `AI_ENABLE_PGVECTOR_RAG=1` set
- Database migrations pushed

```bash
node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32
```

- `--skip-existing` skips chunks already in the DB (safe to re-run)
- `--batch-size 32` controls how many chunks are embedded per API call

This upserts rows into `public.document_embeddings` (1024-dim NVIDIA embeddings). Once populated, the app uses pgvector for retrieval instead of local hash embeddings.

**Skip this step** if you don't have an NVIDIA key. The local hash-embedding retrieval in `lib/context/chunk_vectors.jsonl` still works — it's just less semantically precise.

---

## Run the App

Development server (hot reload):

```bash
npm run dev
```

Open http://localhost:3000

Production build (check for errors before deploying):

```bash
npm run build
npm run start
```

---

## AI Pipeline

This section documents what the AI system does and what was built/improved.

### Multi-Provider Fallback Chain

The app tries AI providers in order and falls back automatically if one fails or has no key:

```
NVIDIA (nv-mistral-nemo-minitron-8b)
  → Gemini (gemini-2.0-flash)
  → Groq (llama-3.3-70b-versatile)
  → Cerebras (llama-4-scout-17b)
  → Mistral (mistral-small-latest)
```

All providers share a 30-second timeout (`AI_REQUEST_TIMEOUT_MS`).

### RAG Pipeline (Retrieval-Augmented Generation)

Before generating any question, the system retrieves relevant context from the chunk index:

**1. HyDE (Hypothetical Document Embeddings)**
The retrieval query is expanded with a hypothetical NCERT paragraph generated from chapter topics and PYQ data. This makes the embedding search find more relevant chunks because the expanded query vocabulary is closer to what textbook paragraphs look like.

**2. Source-Diverse Retrieval**
For question-generation tasks, the system guarantees at least 35% of retrieved chunks are from NCERT textbooks (not just past papers). This ensures questions have textbook definitions and not just exam paper phrasing.

**3. MMR (Maximal Marginal Relevance)**
After scoring all candidate chunks, the system applies MMR (λ=0.6) to the paper/OCR pool before selecting the final context. This removes redundant chunks that overlap each other, maximising the variety of topics in the context window.

**4. NVIDIA Re-ranking** (optional, `AI_ENABLE_NVIDIA_RERANK=1`)
After local retrieval, all snippets can be re-ranked using the `nvidia/llama-nemotron-rerank-1b-v2` model for higher-quality ordering.

### Question Generation

**Subject-Specific Prompts** (`lib/ai/subject-prompts.ts`)
Each subject (Chemistry, Physics, Biology, Math, Science, English, Accountancy, Business Studies, Economics) has a set of subject-specific rules appended to the system prompt. For example, Chemistry questions must include balanced equations with state symbols; Physics questions must show formula → substitution → unit.

**Few-Shot PYQ Examples** (`lib/ai/pyq-examples.ts`)
Two board-exam-quality example questions per subject are injected at the end of each generation prompt. This shows the LLM exactly the format, difficulty level, and distractor style expected.

**CBSE Bloom's Taxonomy Distribution**
All question generation enforces:
- 30–35% Recall (definitions, naming, laws)
- 35% Application (numericals, predictions, reactions)
- 15–20% Analysis (assertion-reason, compare/contrast)
- 10–20% Case/Scenario-based

**Self-Verification** (`lib/ai/question-verifier.ts`, `AI_ENABLE_SELF_VERIFY=1`)
After questions are generated, a second lightweight Groq call (llama-3.1-8b-instant) checks whether each marked answer is factually correct against the retrieved context. Wrong answers are removed and replaced from the fallback pool. The filter never removes more than 40% of questions.

### Relevant Source Files

| File | Purpose |
|------|---------|
| `lib/ai/context-retriever.ts` | HyDE expansion, MMR, source-diverse retrieval, pgvector + local fallback |
| `lib/ai/subject-prompts.ts` | Subject-specific system prompt rules |
| `lib/ai/pyq-examples.ts` | Few-shot board-exam example questions per subject |
| `lib/ai/question-verifier.ts` | Self-verification pass via Groq |
| `lib/ai/question-rag.ts` | RAG metadata annotation (PYQ tags, quality scores, source mix) |
| `lib/ai/generator.ts` | Multi-provider LLM fallback chain with timeouts |
| `lib/ai/model-routing.ts` | Provider and model registry |
| `lib/ai/variation.ts` | Diversity keys to avoid repeated question patterns |
| `lib/ai/token-budget.ts` | Per-user AI usage limits |
| `lib/pyq.ts` | PYQ frequency data (years asked, important topics, avg marks) |
| `lib/pyq-grounded.ts` | Grounded PYQ data for improved topic weighting |
| `scripts/build_context_index.py` | PDF → semantic chunks with optional image OCR |

---

## Useful Commands

```bash
# Development
npm run dev             # Start dev server with hot reload
npm run build           # Production build (catches errors)
npm run start           # Serve production build

# Code Quality
npm run lint            # ESLint
npm run typecheck       # TypeScript type check (no emit)
npm run test            # Run test suite

# Database
npm run db:push         # Push Supabase migrations
npm run db:clear        # Clear all app data (keeps schema)
npm run db:reset-full   # Clear + seed with demo data

# Context / RAG Pipeline
npm run build:context   # Build chunks from CBSE papers
npm run build:textbooks # Build chunks from NCERT textbooks
npm run clean:chunks    # Deduplicate chunk files
npm run build:vectors   # Build local hash embeddings
npm run verify:context  # Verify artifact integrity

# Embeddings ingestion
node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32
```

---

## Troubleshooting

**`hf: command not found`**
Run `python -m huggingface_hub.commands.huggingface_cli auth login` instead.
Or: `pip install -U "huggingface_hub[cli]"` then open a new terminal.

**`document_embeddings table is empty` warning at startup**
The app still works using local hash embeddings. To populate pgvector:
```bash
node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32
```

**`Cannot find project ref` during `db:push`**
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

**pgvector warning at startup even after migration**
Set `AI_ENABLE_PGVECTOR_RAG=0` in `.env.local` to disable it and use local retrieval only.

**No questions generated / empty quiz**
- Check that `lib/context/chunks.jsonl` exists and has data: `wc -l lib/context/chunks.jsonl`
- Run `npm run verify:context`
- Ensure at least one AI provider key is set in `.env.local`

**`fitz` / PyMuPDF not found during image extraction**
```bash
pip install pymupdf
```
If that fails on Windows: `pip install pymupdf --pre`

**AI provider returning 429 (rate limit)**
The app automatically falls back to the next provider. If all providers are rate-limited, wait 2 minutes. For sustained load, set up keys for multiple providers.

**Cerebras key not working**
Cerebras API keys must start with `csk-`. Get one at https://cloud.cerebras.ai

---

## Additional Internal Docs

- `docs/FUNCTION_USAGE_GUIDE.md` — API route reference
- `docs/FUNCTION_TO_FUNCTION_MAPPING.md` — internal module dependencies
- `docs/AI_MODEL_ROUTING.md` — provider selection logic in detail
- `docs/OPERATOR_RUNBOOK.md` — production operations guide
