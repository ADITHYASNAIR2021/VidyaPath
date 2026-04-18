# VidyaPath

VidyaPath is a CBSE learning platform for Class 10 and 12 with student, teacher, admin, and developer workflows.

## Official Links
- GitHub: [https://github.com/ADITHYASNAIR2021/VidyaPath.git](https://github.com/ADITHYASNAIR2021/VidyaPath.git)
- Hugging Face (NCERT textbooks): [https://huggingface.co/datasets/AdithyaSNair/ncert-textbooks-10-12](https://huggingface.co/datasets/AdithyaSNair/ncert-textbooks-10-12)
- Hugging Face (CBSE papers): [https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025](https://huggingface.co/datasets/AdithyaSNair/cbse-papers-2009-2025)

## 1) Fork and Clone
```bash
git clone https://github.com/ADITHYASNAIR2021/VidyaPath.git
cd VidyaPath
```

If you are contributing from your own fork:
```bash
git remote add upstream https://github.com/ADITHYASNAIR2021/VidyaPath.git
```

## 2) Prerequisites
- Node.js 18+
- npm
- Python 3.10+
- Git
- Hugging Face CLI (`hf`) for dataset download

Install Python dependencies:
```bash
pip install pypdf requests huggingface_hub
```

## 3) Environment Setup
Create `.env.local` in project root (or copy from `.env.example`) and set at least:

```env
SESSION_SIGNING_SECRET=replace_with_long_random_secret_min_32_chars
TEACHER_PORTAL_KEY=replace_with_teacher_secret

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

NVIDIA_API_KEY=your_nvidia_api_key_here
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional for pgvector retrieval in runtime:
```env
AI_ENABLE_PGVECTOR_RAG=1
```

Optional OpenAI embedding fallback:
```env
OPENAI_API_KEY=your_openai_key
```

## 4) Install Node Dependencies
```bash
npm install
```

## 5) Download Datasets
Expected local directories:
- `dataset/cbse_papers`
- `dataset/ncert_textbooks`

Login once:
```bash
hf auth login
```

Download CBSE papers:
```bash
hf download AdithyaSNair/cbse-papers-2009-2025 --type dataset --local-dir dataset/cbse_papers
```

Download NCERT textbooks:
```bash
hf download AdithyaSNair/ncert-textbooks-10-12 --type dataset --local-dir dataset/ncert_textbooks
```

## 6) Build Chunks and Context Artifacts
```bash
npm run build:context
npm run build:textbooks
npm run clean:chunks
npm run build:vectors
npm run verify:context
```

Generated files in `lib/context/`:
- `chunks.jsonl`
- `chapter_index.json`
- `textbook_chunks.jsonl`
- `textbook_chapter_index.json`
- `chunk_vectors.jsonl`

## 7) Supabase Migration and Reset
Link local project:
```bash
npx supabase login
npx supabase link --project-ref <your_project_ref>
```

Push migrations:
```bash
npm run db:push
```

Fresh start (clear all app data, no reseed):
```bash
npm run db:clear
```

Optional demo seed (mock data + auth users):
```bash
npm run db:reset-full
```

## 8) Ingest Embeddings into Supabase
After chunks and DB migration are ready:
```bash
node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32
```

This upserts into `public.document_embeddings`.

## 9) Run the App
Development:
```bash
npm run dev
```

Production check:
```bash
npm run build
npm run start
```

## 10) Useful Commands
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm run test`
- Clear DB only: `npm run db:clear`
- Full reset with mock seed: `npm run db:reset-full`

## Quick Troubleshooting
- `document_embeddings is empty`:
  - Run `node scripts/ingest_embeddings.mjs --skip-existing --batch-size 32`
- `Cannot find project ref` during `db:push`:
  - Run `npx supabase login` then `npx supabase link --project-ref <your_project_ref>`
- pgvector warning at startup:
  - Ensure migrations are pushed and `document_embeddings` has rows
  - Or set `AI_ENABLE_PGVECTOR_RAG=0` to disable runtime retrieval

## Additional Internal Docs
- `docs/FUNCTION_USAGE_GUIDE.md`
- `docs/FUNCTION_TO_FUNCTION_MAPPING.md`
- `docs/AI_MODEL_ROUTING.md`
- `docs/OPERATOR_RUNBOOK.md`
