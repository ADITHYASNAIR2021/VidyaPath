-- Admin helper: returns embedding counts grouped by class_level + subject.
-- Used by /api/admin/embeddings GET endpoint.

create or replace function public.get_embedding_coverage_stats()
returns table (
  class_level   smallint,
  subject       text,
  total_chunks  bigint,
  with_embedding bigint
)
language sql stable security definer
set search_path = public
as $$
  select
    class_level,
    subject,
    count(*)                                           as total_chunks,
    count(*) filter (where embedding is not null)     as with_embedding
  from public.document_embeddings
  group by class_level, subject
  order by class_level, subject;
$$;

grant execute on function public.get_embedding_coverage_stats() to service_role;
