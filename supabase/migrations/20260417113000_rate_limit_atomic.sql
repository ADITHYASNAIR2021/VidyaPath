-- Atomic rate-limit decision helper to avoid race conditions under concurrency.

create or replace function public.check_rate_limit(
  p_throttle_key text,
  p_bucket_start timestamptz,
  p_window_seconds integer,
  p_limit integer,
  p_block_seconds integer,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer,
  limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_existing public.request_throttle%rowtype;
  v_inserted integer := 0;
  v_next_count integer := 0;
begin
  if p_throttle_key is null or btrim(p_throttle_key) = '' then
    return query
    select true, 0, greatest(0, p_limit - 1), p_limit;
    return;
  end if;

  insert into public.request_throttle (
    throttle_key,
    bucket_start,
    window_seconds,
    request_count,
    blocked_until,
    first_seen_at,
    last_seen_at,
    metadata
  ) values (
    p_throttle_key,
    p_bucket_start,
    p_window_seconds,
    1,
    null,
    v_now,
    v_now,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (throttle_key, bucket_start) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return query
    select true, 0, greatest(0, p_limit - 1), p_limit;
    return;
  end if;

  select *
  into v_existing
  from public.request_throttle
  where throttle_key = p_throttle_key
    and bucket_start = p_bucket_start
  for update;

  if not found then
    return query
    select false, 5, 0, p_limit;
    return;
  end if;

  if v_existing.blocked_until is not null and v_existing.blocked_until > v_now then
    return query
    select
      false,
      greatest(1, ceil(extract(epoch from (v_existing.blocked_until - v_now)))::integer),
      0,
      p_limit;
    return;
  end if;

  v_next_count := coalesce(v_existing.request_count, 0) + 1;
  if v_next_count > p_limit then
    update public.request_throttle
    set
      request_count = v_next_count,
      blocked_until = v_now + make_interval(secs => greatest(1, p_block_seconds)),
      last_seen_at = v_now
    where id = v_existing.id;
    return query
    select false, greatest(1, p_block_seconds), 0, p_limit;
    return;
  end if;

  update public.request_throttle
  set
    request_count = v_next_count,
    blocked_until = null,
    last_seen_at = v_now
  where id = v_existing.id;

  return query
  select true, 0, greatest(0, p_limit - v_next_count), p_limit;
end;
$$;

revoke all
on function public.check_rate_limit(text, timestamptz, integer, integer, integer, jsonb)
from public;

grant execute
on function public.check_rate_limit(text, timestamptz, integer, integer, integer, jsonb)
to service_role;
