-- Ensure assignment packs are school-scoped for isolation-safe gradebook queries.
alter table if exists public.teacher_assignment_packs
  add column if not exists school_id uuid references public.schools(id) on delete set null;

update public.teacher_assignment_packs as p
set school_id = t.school_id
from public.teacher_profiles as t
where p.teacher_id = t.id
  and p.school_id is null
  and t.school_id is not null;

create index if not exists teacher_assignment_packs_school_idx
  on public.teacher_assignment_packs (school_id, updated_at desc);
