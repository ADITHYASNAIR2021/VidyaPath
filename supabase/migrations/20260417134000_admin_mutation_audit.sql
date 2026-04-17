-- Row-level mutation audit trail for admin-managed tables.

create table if not exists public.admin_mutation_audit (
  id bigserial primary key,
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_pk text,
  actor_auth_user_id uuid,
  actor_role text,
  old_row jsonb,
  new_row jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists admin_mutation_audit_changed_idx
  on public.admin_mutation_audit (changed_at desc);
create index if not exists admin_mutation_audit_table_idx
  on public.admin_mutation_audit (table_name, changed_at desc);
create index if not exists admin_mutation_audit_actor_idx
  on public.admin_mutation_audit (actor_auth_user_id, changed_at desc);

create or replace function public.capture_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_auth text;
  v_actor_role text;
  v_old jsonb;
  v_new jsonb;
  v_row_pk text;
begin
  v_actor_auth := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_actor_role := nullif(current_setting('request.jwt.claim.role', true), '');

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_old := null;
    v_row_pk := coalesce(v_new ->> 'id', '');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row_pk := coalesce(v_new ->> 'id', v_old ->> 'id', '');
  else
    v_old := to_jsonb(old);
    v_new := null;
    v_row_pk := coalesce(v_old ->> 'id', '');
  end if;

  insert into public.admin_mutation_audit (
    table_name,
    operation,
    row_pk,
    actor_auth_user_id,
    actor_role,
    old_row,
    new_row
  ) values (
    tg_table_name,
    tg_op,
    nullif(v_row_pk, ''),
    nullif(v_actor_auth, '')::uuid,
    v_actor_role,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'schools',
    'school_admin_profiles',
    'teacher_profiles',
    'student_profiles',
    'class_sections',
    'teacher_scopes',
    'teacher_class_assignments',
    'school_events',
    'school_announcements',
    'timetable_slots'
  ]
  loop
    v_trigger := format('%s_admin_mutation_audit_trg', v_table);
    if not exists (
      select 1
      from pg_trigger
      where tgname = v_trigger
    ) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.capture_admin_mutation()',
        v_trigger,
        v_table
      );
    end if;
  end loop;
end $$;

alter table public.admin_mutation_audit enable row level security;

drop policy if exists admin_mutation_audit_service_role_all on public.admin_mutation_audit;
create policy admin_mutation_audit_service_role_all
  on public.admin_mutation_audit
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists admin_mutation_audit_developer_read on public.admin_mutation_audit;
create policy admin_mutation_audit_developer_read
  on public.admin_mutation_audit
  for select
  to authenticated
  using (public.is_developer());

