-- Additional RLS policies for teacher/admin route migrations:
-- - /api/teacher/weekly-plans
-- - /api/teacher/submission*
-- - /api/admin/settings
-- - /api/admin/analytics

create or replace function public.school_id_from_app_state_key(p_state_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(p_state_key, ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(p_state_key, ':', 2)::uuid
    else null
  end;
$$;

revoke all on function public.school_id_from_app_state_key(text) from public;
grant execute on function public.school_id_from_app_state_key(text) to authenticated;
grant execute on function public.school_id_from_app_state_key(text) to service_role;

-- ---------------------------------------------------------------------------
-- app_state (admin settings blob by school key)
-- ---------------------------------------------------------------------------

drop policy if exists app_state_admin_developer_read on public.app_state;
create policy app_state_admin_developer_read
  on public.app_state
  for select
  to authenticated
  using (
    public.is_developer()
    or public.has_school_role(public.school_id_from_app_state_key(state_key), array['admin'])
  );

drop policy if exists app_state_admin_developer_write on public.app_state;
create policy app_state_admin_developer_write
  on public.app_state
  for all
  to authenticated
  using (
    public.is_developer()
    or public.has_school_role(public.school_id_from_app_state_key(state_key), array['admin'])
  )
  with check (
    public.is_developer()
    or public.has_school_role(public.school_id_from_app_state_key(state_key), array['admin'])
  );

-- ---------------------------------------------------------------------------
-- teacher_weekly_plans
-- ---------------------------------------------------------------------------

drop policy if exists teacher_weekly_plans_authenticated_read on public.teacher_weekly_plans;
create policy teacher_weekly_plans_authenticated_read
  on public.teacher_weekly_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_weekly_plans.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  );

drop policy if exists teacher_weekly_plans_authenticated_write on public.teacher_weekly_plans;
create policy teacher_weekly_plans_authenticated_write
  on public.teacher_weekly_plans
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_weekly_plans.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  )
  with check (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_weekly_plans.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  );

-- ---------------------------------------------------------------------------
-- teacher_assignment_packs
-- ---------------------------------------------------------------------------

drop policy if exists teacher_assignment_packs_authenticated_read on public.teacher_assignment_packs;
create policy teacher_assignment_packs_authenticated_read
  on public.teacher_assignment_packs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_assignment_packs.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
    or exists (
      select 1
      from public.student_profiles sp
      join public.teacher_profiles tp on tp.school_id = sp.school_id
      where sp.auth_user_id = auth.uid()
        and tp.id = teacher_assignment_packs.teacher_id
        and teacher_assignment_packs.class_level = sp.class_level
        and (
          teacher_assignment_packs.section is null
          or sp.section is null
          or teacher_assignment_packs.section = sp.section
        )
    )
  );

drop policy if exists teacher_assignment_packs_authenticated_write on public.teacher_assignment_packs;
create policy teacher_assignment_packs_authenticated_write
  on public.teacher_assignment_packs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_assignment_packs.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  )
  with check (
    exists (
      select 1
      from public.teacher_profiles tp
      where tp.id = teacher_assignment_packs.teacher_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  );

-- ---------------------------------------------------------------------------
-- teacher_submissions
-- ---------------------------------------------------------------------------

drop policy if exists teacher_submissions_authenticated_read on public.teacher_submissions;
create policy teacher_submissions_authenticated_read
  on public.teacher_submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_assignment_packs tap
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where tap.id = teacher_submissions.pack_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
    or exists (
      select 1
      from public.student_profiles sp
      join public.teacher_assignment_packs tap on tap.id = teacher_submissions.pack_id
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where sp.auth_user_id = auth.uid()
        and tp.school_id = sp.school_id
        and (
          teacher_submissions.student_id = sp.id
          or teacher_submissions.submission_code = sp.roll_code
        )
        and tap.class_level = sp.class_level
        and (
          tap.section is null
          or sp.section is null
          or tap.section = sp.section
        )
    )
  );

drop policy if exists teacher_submissions_authenticated_insert on public.teacher_submissions;
create policy teacher_submissions_authenticated_insert
  on public.teacher_submissions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.teacher_assignment_packs tap
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where tap.id = teacher_submissions.pack_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
    or exists (
      select 1
      from public.student_profiles sp
      join public.teacher_assignment_packs tap on tap.id = teacher_submissions.pack_id
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where sp.auth_user_id = auth.uid()
        and tp.school_id = sp.school_id
        and (
          teacher_submissions.student_id = sp.id
          or teacher_submissions.submission_code = sp.roll_code
        )
        and tap.class_level = sp.class_level
        and (
          tap.section is null
          or sp.section is null
          or tap.section = sp.section
        )
    )
  );

drop policy if exists teacher_submissions_authenticated_update_delete on public.teacher_submissions;
create policy teacher_submissions_authenticated_update_delete
  on public.teacher_submissions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_assignment_packs tap
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where tap.id = teacher_submissions.pack_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  )
  with check (
    exists (
      select 1
      from public.teacher_assignment_packs tap
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where tap.id = teacher_submissions.pack_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  );

drop policy if exists teacher_submissions_authenticated_delete on public.teacher_submissions;
create policy teacher_submissions_authenticated_delete
  on public.teacher_submissions
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.teacher_assignment_packs tap
      join public.teacher_profiles tp on tp.id = tap.teacher_id
      where tap.id = teacher_submissions.pack_id
        and (
          tp.auth_user_id = auth.uid()
          or public.has_school_role(tp.school_id, array['admin'])
        )
    )
  );
