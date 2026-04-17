-- Enable pgvector extension (must be done in the Supabase dashboard under Extensions
-- if this migration runs without superuser privileges, comment out the line below and
-- enable the extension manually via the Supabase UI first).
create extension if not exists vector;

-- document_embeddings: stores pre-computed semantic embeddings for all context chunks.
-- Dimension 1024 matches NVIDIA nv-embedqa-e5-v5 / nv-embed-v1.
-- To use OpenAI text-embedding-3-small (1536-dim) run this migration with vector(1536).
create table if not exists public.document_embeddings (
  id          text         primary key,
  text        text         not null,
  source_path text         not null,
  class_level smallint     not null,
  subject     text         not null,
  source_type text         not null default 'paper',
  chapter_id  text,
  year        smallint,
  paper_type  text,
  medium      text,
  language    text,
  embedding   vector(1024),
  created_at  timestamptz  not null default now()
);

-- HNSW index for approximate nearest-neighbour cosine search.
-- Tuning: m=16 (graph degree), ef_construction=64 (build-time beam).
-- Increase ef_construction to 128 for higher recall at larger dataset sizes.
create index if not exists document_embeddings_hnsw_idx
  on public.document_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Composite filter index so WHERE clauses on class_level+subject are cheap.
create index if not exists document_embeddings_class_subject_idx
  on public.document_embeddings (class_level, subject);

create index if not exists document_embeddings_chapter_idx
  on public.document_embeddings (chapter_id)
  where chapter_id is not null;

-- RLS: only service_role can read/write embeddings (no student/teacher exposure).
alter table public.document_embeddings enable row level security;

create policy "service_role_all_document_embeddings"
  on public.document_embeddings
  for all
  to service_role
  using (true)
  with check (true);

-- match_document_embeddings: semantic nearest-neighbour search with optional filters.
-- Called from context-retriever.ts via supabaseRpc.
create or replace function public.match_document_embeddings(
  query_embedding  vector(1024),
  match_count      int     default 20,
  filter_class     smallint default null,
  filter_subject   text     default null,
  filter_chapter   text     default null
)
returns table (
  id          text,
  text        text,
  source_path text,
  class_level smallint,
  subject     text,
  source_type text,
  chapter_id  text,
  year        smallint,
  paper_type  text,
  similarity  float8
)
language sql stable security definer
set search_path = public
as $$
  select
    id,
    text,
    source_path,
    class_level,
    subject,
    source_type,
    chapter_id,
    year,
    paper_type,
    1 - (embedding <=> query_embedding) as similarity
  from public.document_embeddings
  where embedding is not null
    and (filter_class   is null or class_level = filter_class)
    and (filter_subject is null or subject     ilike filter_subject)
    and (filter_chapter is null or chapter_id  = filter_chapter)
  order by embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_document_embeddings to service_role;
