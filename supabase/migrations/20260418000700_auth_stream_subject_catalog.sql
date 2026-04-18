alter table if exists public.teacher_profiles
  add column if not exists must_change_password boolean not null default true;

alter table if exists public.student_profiles
  add column if not exists academic_stream text;

-- Relax legacy stream constraints first so null migration for Class 10 can succeed.
alter table if exists public.student_profiles
  drop constraint if exists student_profiles_academic_stream_check;

alter table if exists public.student_profiles
  alter column academic_stream drop not null;

-- Class 10 has no stream in the new model.
update public.student_profiles
set academic_stream = null
where class_level = 10;

-- Normalize class 12 streams and keep only pcm|pcb|commerce (or null).
update public.student_profiles
set academic_stream = lower(btrim(academic_stream))
where class_level = 12
  and academic_stream is not null;

update public.student_profiles
set academic_stream = null
where class_level = 12
  and lower(coalesce(academic_stream, '')) in ('foundation', 'interdisciplinary', 'humanities', 'arts', '');

update public.student_profiles
set academic_stream = null
where class_level = 12
  and academic_stream is not null
  and academic_stream not in ('pcm', 'pcb', 'commerce');

alter table if exists public.student_profiles
  add constraint student_profiles_academic_stream_check
  check (
    class_level in (10, 12)
    and (
      (class_level = 10 and academic_stream is null)
      or (class_level = 12 and (academic_stream is null or academic_stream in ('pcm', 'pcb', 'commerce')))
    )
  );

create table if not exists public.school_subject_catalog (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_level smallint not null check (class_level in (10, 12)),
  subject text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_subject_catalog_unique
  on public.school_subject_catalog (school_id, class_level, lower(subject));

create index if not exists school_subject_catalog_lookup_idx
  on public.school_subject_catalog (school_id, class_level, is_active, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'school_subject_catalog_touch_updated_at'
  ) then
    create trigger school_subject_catalog_touch_updated_at
      before update on public.school_subject_catalog
      for each row execute function public.touch_updated_at();
  end if;
end $$;
