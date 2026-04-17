alter table if exists public.student_profiles
  add column if not exists academic_stream text;

update public.student_profiles
set academic_stream = 'pcm'
where lower(coalesce(academic_stream, '')) in ('science');

update public.student_profiles
set academic_stream = 'commerce'
where lower(coalesce(academic_stream, '')) in ('commerce');

update public.student_profiles
set academic_stream = 'interdisciplinary'
where lower(coalesce(academic_stream, '')) in ('humanities', 'arts');

update public.student_profiles
set academic_stream = 'foundation'
where class_level = 10 and coalesce(academic_stream, '') = '';

update public.student_profiles
set academic_stream = 'interdisciplinary'
where class_level = 12 and coalesce(academic_stream, '') = '';

alter table if exists public.student_profiles
  drop constraint if exists student_profiles_academic_stream_check;

alter table if exists public.student_profiles
  add constraint student_profiles_academic_stream_check
  check (
    (class_level = 10 and academic_stream = 'foundation')
    or
    (class_level = 12 and academic_stream in ('pcm', 'pcb', 'commerce', 'interdisciplinary'))
  );

alter table if exists public.student_profiles
  alter column academic_stream set not null;

create index if not exists student_profiles_stream_idx
  on public.student_profiles (school_id, class_level, academic_stream, status);
