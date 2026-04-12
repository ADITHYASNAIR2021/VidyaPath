# AI Model Routing

## Goal
Use a single model registry + task mapping so every AI endpoint can switch models without route-level code changes.

## Core Files
- `lib/ai/model-routing.ts`
  - Central alias registry (`G4`, `GLM5`, `M27`, etc.)
  - Task-to-model mapping for generation tasks (`chat`, `mcq`, `revision-plan`, ...)
  - Env-based overrides
- `lib/ai/nvidia-client.ts`
  - Reusable NVIDIA API helpers:
    - chat completions
    - embeddings
    - reranking
    - OCR
    - image generation
- `lib/ai/generator.ts`
  - Uses model routing candidates and provider-specific invocations
  - Keeps caching + JSON validation/retry logic centralized

## Alias Examples
- `G4` -> `google/gemma-3n-e4b-it`
- `M27` -> `minimaxai/minimax-m2.7`
- `GLM5` -> `z-ai/glm5`
- `K2` -> `moonshotai/kimi-k2.5`
- `CODE` -> `google/gemma-4-31b-it`
- `RERANK_V2` -> `nvidia/llama-nemotron-rerank-1b-v2`
- `EMBED_V2` -> `nvidia/llama-nemotron-embed-1b-v2`

## Env Overrides
Set in `.env.local`:

```env
# Provider keys
NVIDIA_API_KEY=...
GEMINI_API_KEY=...
GROQ_API_KEY=...

# Per-task direct override (CSV aliases)
AI_TASK_MODEL_CHAT=G4,GLM5,GEMINI_FLASH
AI_TASK_MODEL_MCQ=G4,GLM5

# Optional JSON map override
AI_TASK_MODEL_MAP={"paper-evaluate":["GLM5","M27","G4"]}

# Optional: enable NVIDIA reranking in context retrieval
AI_ENABLE_NVIDIA_RERANK=1
AI_RERANK_MODEL=nvidia/llama-nemotron-rerank-1b-v2
```

Override precedence:
1. `AI_TASK_MODEL_<TASK>`
2. `AI_TASK_MODEL_MAP`
3. defaults from `DEFAULT_TASK_MODEL_ALIASES`

## Notes
- If a provider key is missing/invalid, router skips that provider and falls back to next configured alias.
- No API keys should be hardcoded in repository files.
