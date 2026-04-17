-- Harden student read policy for teacher_submissions.
-- Students must only see released results.

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
        and (
          teacher_submissions.released_at is not null
          or teacher_submissions.status = 'released'
        )
    )
  );

