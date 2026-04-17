-- Critical beta performance indexes for high-traffic dashboard/read paths.
-- Added with IF NOT EXISTS for idempotent deploys across environments.

-- Ensure school_id exists on assignment packs for school-scoped admin analytics queries.
alter table if exists public.teacher_assignment_packs
  add column if not exists school_id uuid references public.schools(id) on delete set null;

create index if not exists teacher_submissions_student_pack_idx
  on public.teacher_submissions (student_id, pack_id, created_at desc);

create index if not exists teacher_submissions_status_idx
  on public.teacher_submissions (status, created_at desc);

create index if not exists teacher_assignment_packs_school_status_idx
  on public.teacher_assignment_packs (school_id nulls last, status, created_at desc);

create index if not exists exam_sessions_violations_idx
  on public.exam_sessions (total_violations desc)
  where total_violations > 0;

