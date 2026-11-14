-- Optional backend. Apply only when choosing Supabase/pgvector; local BM25 needs no DB.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.rag_corpora (
  id text primary key check (id ~ '^[A-Za-z0-9._-]{1,80}$'),
  embedding_model text not null,
  embedding_kind text not null check (embedding_kind in ('onnx-minilm', 'nvidia-e5')),
  dimensions integer not null check (dimensions in (384, 2048)),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  ready boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.rag_document_chunks (
  corpus_id text not null references public.rag_corpora(id) on delete cascade,
  chunk_id text not null,
  content text not null check (length(content) between 180 and 12000),
  source_path text not null check (length(source_path) between 1 and 1024),
  source_type text not null check (source_type in ('paper', 'textbook', 'image-ocr')),
  class_level integer not null check (class_level in (10, 12)),
  subject text not null check (length(subject) between 1 and 80),
  chapter_id text,
  page integer,
  year integer,
  dimensions integer not null check (dimensions in (384, 2048)),
  embedding extensions.vector not null,
  primary key (corpus_id, chunk_id),
  check (extensions.vector_dims(embedding) = dimensions)
);
alter table public.rag_corpora enable row level security;
alter table public.rag_document_chunks enable row level security;
revoke all on public.rag_corpora, public.rag_document_chunks from public, anon, authenticated;
grant select, insert, update, delete on public.rag_corpora, public.rag_document_chunks to service_role;
create index rag_scope_idx on public.rag_document_chunks(corpus_id, class_level, subject, chapter_id);
create index rag_embedding_384_idx on public.rag_document_chunks using hnsw ((embedding::extensions.vector(384)) extensions.vector_cosine_ops) where dimensions = 384;
-- pgvector's float32 HNSW limit is 2000 dimensions; Nemotron uses 2048.
create index rag_embedding_2048_idx on public.rag_document_chunks using hnsw ((embedding::extensions.halfvec(2048)) extensions.halfvec_cosine_ops) where dimensions = 2048;

create function public.search_rag_chunks(p_corpus_id text, p_embedding extensions.vector, p_class integer, p_subject text, p_chapter_id text default null, p_count integer default 24)
returns table(chunk_id text, content text, source_path text, source_type text, class_level integer, subject text, chapter_id text, page integer, year integer, similarity double precision)
language plpgsql stable security invoker set search_path = public, extensions, pg_catalog as $$
declare corpus_dimensions integer;
begin
  select c.dimensions into corpus_dimensions from public.rag_corpora c where c.id = p_corpus_id and c.ready;
  if corpus_dimensions is null or vector_dims(p_embedding) <> corpus_dimensions then return; end if;
  if corpus_dimensions = 384 then
    return query select d.chunk_id, d.content, d.source_path, d.source_type, d.class_level, d.subject, d.chapter_id, d.page, d.year,
      1 - (d.embedding::vector(384) <=> p_embedding::vector(384))
      from public.rag_document_chunks d where d.corpus_id = p_corpus_id and d.dimensions = 384 and d.class_level = p_class
      and (case when d.class_level = 10 and d.subject in ('Science','Physics','Chemistry','Biology') then 'Science' else d.subject end) = p_subject
      and (p_chapter_id is null or d.chapter_id = p_chapter_id)
      order by d.embedding::vector(384) <=> p_embedding::vector(384) limit least(greatest(p_count, 1), 48);
  elsif corpus_dimensions = 2048 then
    return query select d.chunk_id, d.content, d.source_path, d.source_type, d.class_level, d.subject, d.chapter_id, d.page, d.year,
      1 - (d.embedding::halfvec(2048) <=> p_embedding::halfvec(2048))
      from public.rag_document_chunks d where d.corpus_id = p_corpus_id and d.dimensions = 2048 and d.class_level = p_class
      and (case when d.class_level = 10 and d.subject in ('Science','Physics','Chemistry','Biology') then 'Science' else d.subject end) = p_subject
      and (p_chapter_id is null or d.chapter_id = p_chapter_id)
      order by d.embedding::halfvec(2048) <=> p_embedding::halfvec(2048) limit least(greatest(p_count, 1), 48);
  end if;
end $$;
revoke execute on function public.search_rag_chunks(text, extensions.vector, integer, text, text, integer) from public, anon, authenticated;
grant execute on function public.search_rag_chunks(text, extensions.vector, integer, text, text, integer) to service_role;
