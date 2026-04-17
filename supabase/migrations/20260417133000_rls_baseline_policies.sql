-- Baseline RLS rollout.
-- Enables RLS on all public tables and adds explicit policies for core
-- identity/engagement tables used by interactive user traffic.

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_user_roles pur
    where pur.auth_user_id = auth.uid()
      and pur.is_active = true
      and pur.role = 'developer'
  );
$$;

create or replace function public.has_school_role(p_school_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_user_roles pur
    where pur.auth_user_id = auth.uid()
      and pur.is_active = true
      and (
        pur.role = 'developer'
        or (
          p_school_id is not null
          and pur.school_id = p_school_id
          and pur.role = any(p_roles)
        )
      )
  );
$$;

revoke all on function public.is_developer() from public;
grant execute on function public.is_developer() to authenticated;
grant execute on function public.is_developer() to service_role;

revoke all on function public.has_school_role(uuid, text[]) from public;
grant execute on function public.has_school_role(uuid, text[]) to authenticated;
grant execute on function public.has_school_role(uuid, text[]) to service_role;

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Identity & role tables
-- ---------------------------------------------------------------------------

drop policy if exists platform_user_roles_self_select on public.platform_user_roles;
create policy platform_user_roles_self_select
  on public.platform_user_roles
  for select
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.is_developer()
  );

drop policy if exists schools_membership_select on public.schools;
create policy schools_membership_select
  on public.schools
  for select
  to authenticated
  using (public.has_school_role(id, array['admin', 'teacher', 'student']));

drop policy if exists school_admin_profiles_select on public.school_admin_profiles;
create policy school_admin_profiles_select
  on public.school_admin_profiles
  for select
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.has_school_role(school_id, array['admin'])
  );

drop policy if exists teacher_profiles_select on public.teacher_profiles;
create policy teacher_profiles_select
  on public.teacher_profiles
  for select
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.has_school_role(school_id, array['admin', 'teacher'])
  );

drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select
  on public.student_profiles
  for select
  to authenticated
  using (
    auth.uid() = auth_user_id
    or public.has_school_role(school_id, array['admin', 'teacher'])
  );

-- ---------------------------------------------------------------------------
-- Engagement/user-facing tables
-- ---------------------------------------------------------------------------

drop policy if exists school_announcements_select on public.school_announcements;
create policy school_announcements_select
  on public.school_announcements
  for select
  to authenticated
  using (public.has_school_role(school_id, array['admin', 'teacher', 'student']));

drop policy if exists school_announcements_write on public.school_announcements;
create policy school_announcements_write
  on public.school_announcements
  for all
  to authenticated
  using (public.has_school_role(school_id, array['admin', 'teacher']))
  with check (public.has_school_role(school_id, array['admin', 'teacher']));

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select
  on public.push_subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()::text
    or public.has_school_role(school_id, array['admin'])
  );

drop policy if exists push_subscriptions_write on public.push_subscriptions;
create policy push_subscriptions_write
  on public.push_subscriptions
  for all
  to authenticated
  using (
    user_id = auth.uid()::text
    or public.has_school_role(school_id, array['admin'])
  )
  with check (
    user_id = auth.uid()::text
    or public.has_school_role(school_id, array['admin'])
  );

drop policy if exists announcement_reads_select on public.announcement_reads;
create policy announcement_reads_select
  on public.announcement_reads
  for select
  to authenticated
  using (
    public.has_school_role(school_id, array['admin', 'teacher'])
    or exists (
      select 1
      from public.student_profiles sp
      where sp.id::text = announcement_reads.student_id
        and sp.auth_user_id = auth.uid()
    )
  );

drop policy if exists announcement_reads_write on public.announcement_reads;
create policy announcement_reads_write
  on public.announcement_reads
  for all
  to authenticated
  using (
    public.has_school_role(school_id, array['admin', 'teacher'])
    or exists (
      select 1
      from public.student_profiles sp
      where sp.id::text = announcement_reads.student_id
        and sp.auth_user_id = auth.uid()
    )
  )
  with check (
    public.has_school_role(school_id, array['admin', 'teacher'])
    or exists (
      select 1
      from public.student_profiles sp
      where sp.id::text = announcement_reads.student_id
        and sp.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Operational/security tables (service-role only)
-- ---------------------------------------------------------------------------

drop policy if exists request_throttle_service_role_all on public.request_throttle;
create policy request_throttle_service_role_all
  on public.request_throttle
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists audit_events_service_role_all on public.audit_events;
create policy audit_events_service_role_all
  on public.audit_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists api_idempotency_service_role_all on public.api_idempotency;
create policy api_idempotency_service_role_all
  on public.api_idempotency
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists token_usage_events_service_role_all on public.token_usage_events;
create policy token_usage_events_service_role_all
  on public.token_usage_events
  for all
  to service_role
  using (true)
  with check (true);

