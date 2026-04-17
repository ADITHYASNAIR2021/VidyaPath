-- VidyaPath fresh reset + 3-school friendly-id seed
-- Schools:
-- 1) Sreyas Public School and Junior College (SPS)
-- 2) ST. Antonys School (STS)
-- 3) ST. Josephs School (SJS)
--
-- Friendly IDs:
-- - Admin:   <SCHOOLCODE><PHONE10>   (example: SPS8136859455)
-- - Teacher: <SCHOOLCODE><PHONE10>   (example: SPS8136859455)
-- - Student roll_no: <class><section><NNN> (example: 10A001)
-- - Student roll_code: <SCHOOL><class><section><NNN> (example: SPS10A001)
--
-- Passwords (seed defaults):
-- - Admin:   6-char mixed password (letters/digits/special)
-- - Teacher: 6-char mixed password (letters/digits/special)
-- - Student: Stu@1234
--
-- NOTE:
-- - This script does a hard reset of school-linked data.
-- - Run scripts/sql/supabase_init.sql first if core schema is missing.

begin;

create extension if not exists pgcrypto;

create or replace function public._vp_seed_random_pass6()
returns text
language sql
as $$
  select string_agg(
    substr(chars, 1 + floor(random() * length(chars))::int, 1),
    ''
  )
  from generate_series(1, 6),
       (select 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'::text as chars) c;
$$;

create table if not exists public.seed_login_credentials (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  role text not null check (role in ('admin', 'teacher', 'student')),
  display_name text not null,
  identifier text not null,
  alt_identifier text,
  class_level int,
  section text,
  batch text,
  password text not null,
  notes text,
  created_at timestamptz not null default now()
);

do $$
declare
  v_missing text[] := '{}'::text[];
begin
  if to_regclass('public.schools') is null then
    v_missing := array_append(v_missing, 'public.schools');
  end if;
  if to_regclass('public.school_admin_profiles') is null then
    v_missing := array_append(v_missing, 'public.school_admin_profiles');
  end if;
  if to_regclass('public.teacher_profiles') is null then
    v_missing := array_append(v_missing, 'public.teacher_profiles');
  end if;
  if to_regclass('public.teacher_scopes') is null then
    v_missing := array_append(v_missing, 'public.teacher_scopes');
  end if;
  if to_regclass('public.class_sections') is null then
    v_missing := array_append(v_missing, 'public.class_sections');
  end if;
  if to_regclass('public.student_profiles') is null then
    v_missing := array_append(v_missing, 'public.student_profiles');
  end if;
  if to_regclass('public.student_subject_enrollments') is null then
    v_missing := array_append(v_missing, 'public.student_subject_enrollments');
  end if;
  if to_regclass('public.teacher_assignment_packs') is null then
    v_missing := array_append(v_missing, 'public.teacher_assignment_packs');
  end if;
  if to_regclass('public.teacher_submissions') is null then
    v_missing := array_append(v_missing, 'public.teacher_submissions');
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'Missing required tables: %. Run scripts/sql/supabase_init.sql first.',
      array_to_string(v_missing, ', ');
  end if;
end $$;

create or replace function public._vp_seed_upsert_auth_user(
  p_email text,
  p_password text,
  p_name text default ''
) returns uuid
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_user_id uuid;
  v_password_hash text;
  v_identity_id_is_uuid boolean;
begin
  if p_email is null or trim(p_email) = '' then
    raise exception 'Email required';
  end if;

  begin
    v_password_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  exception
    when undefined_function then
      v_password_hash := crypt(p_password, gen_salt('bf'));
  end;

  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      lower(trim(p_email)),
      v_password_hash,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('name', coalesce(p_name, '')),
      now(),
      now()
    );
  else
    update auth.users
    set
      email = lower(trim(p_email)),
      encrypted_password = v_password_hash,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', coalesce(p_name, '')),
      updated_at = now()
    where id = v_user_id;
  end if;

  delete from auth.identities
  where user_id = v_user_id and provider = 'email';

  select (c.data_type = 'uuid')
  into v_identity_id_is_uuid
  from information_schema.columns c
  where c.table_schema = 'auth'
    and c.table_name = 'identities'
    and c.column_name = 'id'
  limit 1;

  if coalesce(v_identity_id_is_uuid, false) then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email))),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  else
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid()::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email))),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  end if;

  return v_user_id;
end;
$$;

-- -------------------------------------------------------------
-- Hard reset (school-scoped tables)
-- -------------------------------------------------------------
do $$
begin
  if to_regclass('public.schools') is not null then
    execute 'truncate table public.schools cascade';
  end if;
  if to_regclass('public.seed_login_credentials') is not null then
    execute 'truncate table public.seed_login_credentials';
  end if;
  if to_regclass('public.app_state') is not null then
    execute 'truncate table public.app_state';
  end if;
  if to_regclass('public.token_usage_events') is not null then
    execute 'truncate table public.token_usage_events';
  end if;
exception
  when others then
    raise notice 'Reset warning: %', sqlerrm;
end $$;

-- Optional cleanup of prior seed auth accounts
do $$
begin
  if to_regclass('auth.identities') is not null then
    delete from auth.identities
    where identity_data->>'email' ilike '%@seed.vidyapath.local';
  end if;
  if to_regclass('auth.users') is not null then
    delete from auth.users
    where email ilike '%@seed.vidyapath.local';
  end if;
exception
  when others then
    raise notice 'Auth cleanup warning (non-fatal): %', sqlerrm;
end $$;

drop table if exists pg_temp.vp_cfg_schools;
create temp table vp_cfg_schools as
select * from (
  values
    (1, 'SPS', 'Sreyas Public School and Junior College', 'Thrissur', 'Kerala', '81368'),
    (2, 'STS', 'ST. Antonys School',                    'Kochi',    'Kerala', '90481'),
    (3, 'SJS', 'ST. Josephs School',                    'Kottayam', 'Kerala', '98470')
) as t(school_seq, school_code, school_name, city, state, phone_prefix);

insert into public.schools (
  school_name, school_code, board, city, state, contact_phone, contact_email, status
)
select
  c.school_name,
  c.school_code,
  'CBSE',
  c.city,
  c.state,
  c.phone_prefix || '00000',
  lower('admin.' || c.school_code || '@seed.vidyapath.local'),
  'active'
from vp_cfg_schools c;

drop table if exists pg_temp.vp_schools;
create temp table vp_schools as
select
  c.school_seq,
  c.school_code,
  c.school_name,
  c.phone_prefix,
  s.id as school_id
from vp_cfg_schools c
join public.schools s on s.school_code = c.school_code;

drop table if exists pg_temp.vp_admin_seed;
create temp table vp_admin_seed as
select * from (
  values
    (1, 'Principal'),
    (2, 'Operations Lead')
) as t(admin_seq, admin_title);

drop table if exists pg_temp.vp_admin_ready;
create temp table vp_admin_ready as
select
  s.school_id,
  s.school_code,
  s.school_name,
  a.admin_seq,
  (case when a.admin_seq = 1 then 'Aarav' else 'Meera' end) || ' ' ||
  (case when s.school_code = 'SPS' then 'Menon' when s.school_code = 'STS' then 'Antony' else 'Joseph' end) as name,
  s.phone_prefix || lpad((900 + a.admin_seq)::text, 5, '0') as phone,
  (s.school_code || regexp_replace(s.phone_prefix || lpad((900 + a.admin_seq)::text, 5, '0'), '\D', '', 'g')) as admin_identifier,
  lower('admin.' || s.school_code || '.' || lpad(a.admin_seq::text, 2, '0') || '@seed.vidyapath.local') as auth_email,
  public._vp_seed_random_pass6() as password
from vp_schools s
cross join vp_admin_seed a;

drop table if exists pg_temp.vp_admin_with_auth;
create temp table vp_admin_with_auth as
select
  ar.*,
  public._vp_seed_upsert_auth_user(ar.auth_email, ar.password, ar.name) as auth_user_id
from vp_admin_ready ar;

drop table if exists pg_temp.vp_admin_profiles;
create temp table vp_admin_profiles as
with ins as (
  insert into public.school_admin_profiles (
    school_id, auth_user_id, auth_email, admin_identifier, phone, name, status
  )
  select
    school_id, auth_user_id, auth_email, admin_identifier, phone, name, 'active'
  from vp_admin_with_auth
  returning id, school_id, auth_user_id, auth_email, admin_identifier, phone, name
)
select * from ins;

insert into public.platform_user_roles (auth_user_id, role, school_id, profile_id, is_active)
select auth_user_id, 'admin', school_id, id, true
from vp_admin_profiles;

drop table if exists pg_temp.vp_teacher_template;
create temp table vp_teacher_template as
select * from (
  values
    (1,  10, 'A', 'Physics',          false),
    (2,  10, 'A', 'Chemistry',        false),
    (3,  10, 'A', 'Biology',          false),
    (4,  10, 'A', 'Math',             false),
    (5,  10, 'A', 'English Core',     true),
    (6,  10, 'B', 'Physics',          false),
    (7,  10, 'B', 'Chemistry',        false),
    (8,  10, 'B', 'Biology',          false),
    (9,  10, 'B', 'Math',             false),
    (10, 10, 'B', 'English Core',     true),
    (11, 12, 'A', 'Physics',          false),
    (12, 12, 'A', 'Chemistry',        false),
    (13, 12, 'A', 'Biology',          false),
    (14, 12, 'A', 'Math',             false),
    (15, 12, 'A', 'English Core',     true),
    (16, 12, 'B', 'Accountancy',      false),
    (17, 12, 'B', 'Business Studies', false),
    (18, 12, 'B', 'Economics',        false),
    (19, 12, 'B', 'English Core',     true),
    (20, 12, 'B', 'Math',             false)
) as t(teacher_seq, class_level, section, subject, is_class_teacher);

drop table if exists pg_temp.vp_teacher_ready;
create temp table vp_teacher_ready as
with name_parts as (
  select
    array['Aarav','Diya','Ishan','Neha','Riya','Karan','Sana','Rahul','Priya','Vikram','Ananya','Rohit','Sneha','Nikhil','Pooja','Devika','Harsh','Lavanya','Manoj','Farah']::text[] as first_names,
    array['Sharma','Iyer','Nair','Reddy','Gupta','Menon','Das','Verma','Kapoor','Rao','Sinha','Bhat','Jain','Pillai','George','Mishra','Khanna','Agarwal','Mathew','Thomas']::text[] as last_names
)
select
  s.school_id,
  s.school_code,
  tt.teacher_seq,
  tt.class_level,
  tt.section,
  tt.subject,
  tt.is_class_teacher,
  s.phone_prefix || lpad((1000 + tt.teacher_seq)::text, 5, '0') as phone,
  (
    s.school_code || regexp_replace(s.phone_prefix || lpad((1000 + tt.teacher_seq)::text, 5, '0'), '\D', '', 'g')
  ) as staff_code,
  (
    (select first_names[tt.teacher_seq] from name_parts) || ' ' ||
    (select last_names[((tt.teacher_seq + s.school_seq - 1) % 20) + 1] from name_parts)
  ) as name,
  lower('teacher.' || s.school_code || '.' || tt.teacher_seq::text || '@seed.vidyapath.local') as auth_email,
  public._vp_seed_random_pass6() as password
from vp_schools s
cross join vp_teacher_template tt;

drop table if exists pg_temp.vp_teacher_with_auth;
create temp table vp_teacher_with_auth as
select
  tr.*,
  public._vp_seed_upsert_auth_user(tr.auth_email, tr.password, tr.name) as auth_user_id
from vp_teacher_ready tr;

drop table if exists pg_temp.vp_teacher_profiles;
create temp table vp_teacher_profiles as
with ins as (
  insert into public.teacher_profiles (
    school_id, auth_user_id, auth_email, phone, staff_code, name, pin_hash, status
  )
  select
    t.school_id,
    t.auth_user_id,
    t.auth_email,
    t.phone,
    t.staff_code,
    t.name,
    'scrypt:00112233445566778899aabbccddeeff:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    'active'
  from vp_teacher_with_auth t
  returning id, school_id, auth_user_id, auth_email, phone, staff_code, name
)
select
  i.*,
  t.school_code,
  t.teacher_seq,
  t.class_level,
  t.section,
  t.subject,
  t.is_class_teacher
from ins i
join vp_teacher_with_auth t
  on t.auth_user_id = i.auth_user_id;

insert into public.platform_user_roles (auth_user_id, role, school_id, profile_id, is_active)
select auth_user_id, 'teacher', school_id, id, true
from vp_teacher_profiles;

insert into public.teacher_scopes (
  school_id, teacher_id, class_level, subject, section, is_active
)
select
  school_id,
  id,
  class_level,
  subject,
  section,
  true
from vp_teacher_profiles;

drop table if exists pg_temp.vp_class_sections;
create temp table vp_class_sections as
with sec as (
  select 10 as class_level, 'A'::text as section
  union all select 10, 'B'
  union all select 12, 'A'
  union all select 12, 'B'
),
class_teachers as (
  select school_id, class_level, section, id as class_teacher_id
  from vp_teacher_profiles
  where is_class_teacher = true
),
ins as (
  insert into public.class_sections (
    school_id, class_level, section, batch, class_teacher_id, notes, status
  )
  select
    s.school_id,
    sec.class_level,
    sec.section,
    null::text as batch,
    ct.class_teacher_id,
    'Fresh seeded section',
    'active'
  from vp_schools s
  join sec on true
  join class_teachers ct
    on ct.school_id = s.school_id
   and ct.class_level = sec.class_level
   and ct.section = sec.section
  returning *
)
select * from ins;

insert into public.teacher_class_assignments (
  school_id, class_section_id, teacher_id, role, subject, is_active
)
select
  cs.school_id,
  cs.id,
  cs.class_teacher_id,
  'class_teacher',
  null,
  true
from vp_class_sections cs;

insert into public.teacher_class_assignments (
  school_id, class_section_id, teacher_id, role, subject, is_active
)
select
  cs.school_id,
  cs.id,
  sc.teacher_id,
  'subject_teacher',
  subj.subject,
  true
from vp_class_sections cs
cross join lateral (
  select unnest(
    case
      when cs.class_level = 12 and cs.section = 'B'
        then array['Accountancy', 'Business Studies', 'Economics', 'English Core', 'Math']::text[]
      else array['Physics', 'Chemistry', 'Biology', 'Math', 'English Core']::text[]
    end
  ) as subject
) subj
join public.teacher_scopes sc
  on sc.school_id = cs.school_id
 and sc.class_level = cs.class_level
 and coalesce(sc.section, '') = cs.section
 and sc.subject = subj.subject
 and sc.is_active = true;

drop table if exists pg_temp.vp_student_seed;
create temp table vp_student_seed as
with groups as (
  select 10 as class_level, 'A'::text as section, 'Science Foundation'::text as stream
  union all select 10, 'B', 'Science Foundation'
  union all select 12, 'A', 'Science'
  union all select 12, 'B', 'Commerce'
),
nums as (
  select generate_series(1, 50) as n
),
first_names as (
  select array[
    'Aarav','Vivaan','Aditya','Arjun','Ishan','Kabir','Reyansh','Vihaan','Atharv','Krish',
    'Anaya','Diya','Ira','Myra','Sara','Kiara','Navya','Riya','Aanya','Meera'
  ]::text[] as arr
),
last_names as (
  select array[
    'Sharma','Iyer','Nair','Reddy','Gupta','Menon','Das','Verma','Kapoor','Patel',
    'Rao','Sinha','Bhat','Jain','Pillai','George','Mishra','Malhotra','Khanna','Agarwal'
  ]::text[] as arr
)
select
  s.school_id,
  s.school_code,
  g.class_level,
  g.section,
  g.stream,
  null::text as batch,
  format('%s%s%s', g.class_level, g.section, lpad(n.n::text, 3, '0')) as roll_no,
  format(
    '%s%s%s%s',
    s.school_code,
    g.class_level,
    g.section,
    lpad(n.n::text, 3, '0')
  ) as roll_code,
  format(
    '%s %s %s%s',
    (select arr[((n.n - 1) % array_length(arr, 1)) + 1] from first_names),
    (select arr[((n.n + s.school_seq - 1) % array_length(arr, 1)) + 1] from last_names),
    g.section,
    lpad(n.n::text, 3, '0')
  ) as name,
  lower('student.' || s.school_code || '.' || g.class_level || g.section || lpad(n.n::text, 3, '0') || '@seed.vidyapath.local') as auth_email,
  'Stu@1234'::text as password
from vp_schools s
cross join groups g
cross join nums n;

drop table if exists pg_temp.vp_student_with_auth;
create temp table vp_student_with_auth as
select
  ss.*,
  public._vp_seed_upsert_auth_user(ss.auth_email, ss.password, ss.name) as auth_user_id
from vp_student_seed ss;

drop table if exists pg_temp.vp_student_profiles;
create temp table vp_student_profiles as
with ins as (
  insert into public.student_profiles (
    school_id, auth_user_id, auth_email, batch, roll_no, name, roll_code, class_level, academic_stream, section, pin_hash, status
  )
  select
    s.school_id,
    s.auth_user_id,
    s.auth_email,
    s.batch,
    s.roll_no,
    s.name,
    s.roll_code,
    s.class_level,
    case
      when s.class_level = 10 then 'foundation'
      when s.class_level = 12 and s.section = 'B' then 'commerce'
      else 'pcm'
    end,
    s.section,
    null,
    'active'
  from vp_student_with_auth s
  returning id, school_id, auth_user_id, auth_email, batch, roll_no, name, roll_code, class_level, academic_stream, section
)
select * from ins;

insert into public.platform_user_roles (auth_user_id, role, school_id, profile_id, is_active)
select auth_user_id, 'student', school_id, id, true
from vp_student_profiles;

insert into public.student_subject_enrollments (
  school_id, student_id, class_section_id, subject, assigned_by_teacher_id, status
)
select
  sp.school_id,
  sp.id,
  cs.id as class_section_id,
  subj.subject,
  sc.teacher_id,
  'active'
from vp_student_profiles sp
join vp_class_sections cs
  on cs.school_id = sp.school_id
 and cs.class_level = sp.class_level
 and cs.section = sp.section
cross join lateral (
  select unnest(
    case
      when sp.class_level = 12 and sp.section = 'B'
        then array['Accountancy', 'Business Studies', 'Economics', 'English Core']::text[]
      else array['Physics', 'Chemistry', 'Biology', 'Math', 'English Core']::text[]
    end
  ) as subject
) subj
left join public.teacher_scopes sc
  on sc.school_id = sp.school_id
 and sc.class_level = sp.class_level
 and coalesce(sc.section, '') = sp.section
 and sc.subject = subj.subject
 and sc.is_active = true;

do $$
begin
  if to_regclass('public.school_announcements') is not null then
    insert into public.school_announcements (
      school_id, title, body, audience, created_by_role, created_by_auth_user_id
    )
    select
      s.school_id,
      'Welcome to new term',
      'Dashboard, chapters, and assignments are now active.',
      'all',
      'admin',
      (select ap.auth_user_id from vp_admin_profiles ap where ap.school_id = s.school_id order by ap.name limit 1)
    from vp_schools s;
  end if;
end $$;

do $$
begin
  if to_regclass('public.school_events') is not null then
    insert into public.school_events (
      school_id, title, description, type, event_date, class_level, section, created_by
    )
    select
      s.school_id,
      e.title,
      e.description,
      e.type,
      e.event_date,
      e.class_level,
      e.section,
      'admin'
    from vp_schools s
    cross join lateral (
      values
        ('Unit Test Window', 'Weekly academic test cycle', 'exam', current_date + 7, 10::smallint, 'A'),
        ('Commerce Benchmark Test', 'Accountancy + Economics readiness test', 'exam', current_date + 8, 12::smallint, 'B'),
        ('Parent Teacher Meeting', 'PTM in auditorium', 'meeting', current_date + 12, null::smallint, null::text)
    ) as e(title, description, type, event_date, class_level, section);
  end if;
end $$;

do $$
begin
  if to_regclass('public.timetable_slots') is not null then
    insert into public.timetable_slots (
      school_id, class_level, section, day_of_week, period_no, subject, teacher_id, start_time, end_time
    )
    select
      sec.school_id,
      sec.class_level,
      sec.section,
      d.day_no,
      p.period_no,
      subj.subject,
      t.teacher_id,
      (time '08:30' + ((p.period_no - 1) * interval '50 minutes'))::time,
      (time '08:30' + ((p.period_no - 1) * interval '50 minutes') + interval '45 minutes')::time
    from (
      select distinct school_id, class_level, section from vp_class_sections
    ) sec
    cross join lateral (select generate_series(1, 5) as day_no) d
    cross join lateral (select generate_series(1, 8) as period_no) p
    cross join lateral (
      select
        case
          when sec.class_level = 12 and sec.section = 'B'
            then (array['Accountancy','Business Studies','Economics','English Core','Math'])[((p.period_no - 1) % 5) + 1]
          else (array['Physics','Chemistry','Biology','Math','English Core'])[((p.period_no - 1) % 5) + 1]
        end as subject
    ) subj
    left join lateral (
      select sc.teacher_id
      from public.teacher_scopes sc
      where sc.school_id = sec.school_id
        and sc.class_level = sec.class_level
        and coalesce(sc.section, '') = sec.section
        and sc.subject = subj.subject
        and sc.is_active = true
      order by sc.created_at
      limit 1
    ) t on true
    on conflict (school_id, class_level, section, day_of_week, period_no) do update
    set
      subject = excluded.subject,
      teacher_id = excluded.teacher_id,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regclass('public.attendance_records') is not null then
    insert into public.attendance_records (
      school_id, teacher_id, student_id, class_level, section, date, status, marked_at
    )
    select
      sp.school_id,
      cs.class_teacher_id,
      sp.id,
      sp.class_level::smallint,
      sp.section,
      d.day_date::date,
      case
        when ((right(sp.roll_no, 3)::int + extract(day from d.day_date)::int) % 20) = 0 then 'absent'
        when ((right(sp.roll_no, 3)::int + extract(day from d.day_date)::int) % 20) = 1 then 'late'
        else 'present'
      end,
      (d.day_date::timestamp + time '08:35')
    from vp_student_profiles sp
    join vp_class_sections cs
      on cs.school_id = sp.school_id
     and cs.class_level = sp.class_level
     and cs.section = sp.section
    cross join lateral (
      select generate_series(current_date - 14, current_date, interval '1 day')::date as day_date
    ) d
    where extract(isodow from d.day_date) between 1 and 6
    on conflict (student_id, date) do update
    set
      status = excluded.status,
      marked_at = excluded.marked_at,
      teacher_id = excluded.teacher_id;
  end if;
end $$;

do $$
begin
  if to_regclass('public.class_resources') is not null then
    insert into public.class_resources (
      school_id, teacher_id, title, description, type, url, subject, class_level, section, chapter_id
    )
    select
      ts.school_id,
      ts.teacher_id,
      ts.subject || ' Quick Notes - Class ' || ts.class_level || ts.section,
      'Teacher uploaded revision material for weekly prep.',
      'link',
      'https://sreyas-vidyapath.vercel.com/chapters/' ||
      format('c%s-%s-1', ts.class_level, ts.subject_slug),
      ts.subject,
      ts.class_level::smallint,
      ts.section,
      format('c%s-%s-1', ts.class_level, ts.subject_slug)
    from (
      select distinct
        p.school_id,
        p.id as teacher_id,
        p.class_level,
        p.section,
        p.subject,
        case p.subject
          when 'Physics' then 'phy'
          when 'Chemistry' then 'chem'
          when 'Biology' then 'bio'
          when 'Math' then 'math'
          when 'English Core' then 'eng'
          when 'Accountancy' then 'acc'
          when 'Business Studies' then 'bst'
          when 'Economics' then 'eco'
          else 'gen'
        end as subject_slug
      from vp_teacher_profiles p
    ) ts;
  end if;
end $$;

drop table if exists pg_temp.vp_pack_rows;
create temp table vp_pack_rows as
with ins as (
  insert into public.teacher_assignment_packs (
    teacher_id,
    scope_id,
    class_level,
    subject,
    section,
    chapter_id,
    status,
    visibility_status,
    valid_from,
    valid_until,
    payload
  )
  select
    t.id as teacher_id,
    sc.id as scope_id,
    t.class_level,
    t.subject,
    t.section,
    format(
      'c%s-%s-1',
      t.class_level,
      case t.subject
        when 'Physics' then 'phy'
        when 'Chemistry' then 'chem'
        when 'Biology' then 'bio'
        when 'Math' then 'math'
        when 'English Core' then 'eng'
        when 'Accountancy' then 'acc'
        when 'Business Studies' then 'bst'
        when 'Economics' then 'eco'
        else 'gen'
      end
    ) as chapter_id,
    'published',
    'open',
    now() - interval '2 days',
    now() + interval '10 days',
    jsonb_build_object(
      'packId', gen_random_uuid()::text,
      'title', t.subject || ' Weekly Practice - ' || t.class_level || t.section,
      'chapterId', format(
        'c%s-%s-1',
        t.class_level,
        case t.subject
          when 'Physics' then 'phy'
          when 'Chemistry' then 'chem'
          when 'Biology' then 'bio'
          when 'Math' then 'math'
          when 'English Core' then 'eng'
          when 'Accountancy' then 'acc'
          when 'Business Studies' then 'bst'
          when 'Economics' then 'eco'
          else 'gen'
        end
      ),
      'classLevel', t.class_level,
      'subject', t.subject,
      'section', t.section,
      'portion', 'Core revision set',
      'questionCount', 10,
      'difficultyMix', 'easy:3,medium:5,hard:2',
      'dueDate', (now() + interval '10 days'),
      'includeShortAnswers', true,
      'includeFormulaDrill', true,
      'mcqs', jsonb_build_array(
        jsonb_build_object('questionNo', 'Q1', 'question', 'Concept check 1', 'options', jsonb_build_array('A', 'B', 'C', 'D')),
        jsonb_build_object('questionNo', 'Q2', 'question', 'Concept check 2', 'options', jsonb_build_array('A', 'B', 'C', 'D'))
      ),
      'shortAnswers', jsonb_build_array('Write brief explanation for key topic.', 'State one practical application.'),
      'longAnswers', jsonb_build_array('Explain the chapter concept with an example.'),
      'formulaDrill', jsonb_build_array(),
      'commonMistakes', jsonb_build_array('Skipped units', 'Sign errors'),
      'answerKey', jsonb_build_array(1, 2),
      'questionMeta', jsonb_build_object(),
      'estimatedTimeMinutes', 35,
      'shareUrl', '/exam/assignment/temp',
      'printUrl', '/print/assignment/temp',
      'createdAt', now(),
      'updatedAt', now(),
      'createdByKeyId', t.id,
      'status', 'published',
      'visibilityStatus', 'open',
      'validFrom', now() - interval '2 days',
      'validUntil', now() + interval '10 days',
      'feedbackHistory', jsonb_build_array()
    )
  from vp_teacher_profiles t
  join public.teacher_scopes sc
    on sc.teacher_id = t.id
   and sc.school_id = t.school_id
   and sc.class_level = t.class_level
   and sc.subject = t.subject
   and coalesce(sc.section, '') = t.section
   and sc.is_active = true
  returning id, teacher_id, class_level, subject, section, chapter_id
)
select
  i.id,
  i.teacher_id,
  i.class_level,
  i.subject,
  i.section,
  i.chapter_id,
  tp.school_id
from ins i
join public.teacher_profiles tp on tp.id = i.teacher_id;

do $$
begin
  if to_regclass('public.teacher_submissions') is not null then
    insert into public.teacher_submissions (
      pack_id,
      student_id,
      student_name,
      submission_code,
      attempt_no,
      status,
      answers,
      result,
      grading,
      released_at,
      created_at
    )
    select
      p.id as pack_id,
      rn.id as student_id,
      rn.name as student_name,
      rn.roll_code || '-' || lpad(rn.rn::text, 2, '0') as submission_code,
      1 as attempt_no,
      case when (rn.rn % 3) = 0 then 'released' when (rn.rn % 3) = 1 then 'graded' else 'pending_review' end as status,
      jsonb_build_array(
        jsonb_build_object('questionNo', 'Q1', 'answerText', 'Sample answer from student'),
        jsonb_build_object('questionNo', 'Q2', 'answerText', 'Second response')
      ) as answers,
      jsonb_build_object(
        'scoreEstimate', 55 + (rn.rn * 5),
        'mistakes', jsonb_build_array('Calculation slip', 'Skipped one step'),
        'weakTopics', jsonb_build_array('Revision needed'),
        'nextActions', jsonb_build_array('Practice one worksheet', 'Revise chapter summary')
      ) as result,
      jsonb_build_object(
        'gradedByTeacherId', p.teacher_id,
        'gradedAt', now() - interval '1 day',
        'totalScore', 11 + rn.rn,
        'maxScore', 20,
        'percentage', least(95, 55 + (rn.rn * 5)),
        'questionGrades', jsonb_build_array(
          jsonb_build_object('questionNo', 'Q1', 'scoreAwarded', 6, 'maxScore', 10, 'feedback', 'Good attempt'),
          jsonb_build_object('questionNo', 'Q2', 'scoreAwarded', 7, 'maxScore', 10, 'feedback', 'Improve structure')
        )
      ) as grading,
      case when (rn.rn % 3) = 0 then now() - interval '6 hours' else null end as released_at,
      now() - (rn.rn || ' hours')::interval as created_at
    from vp_pack_rows p
    join lateral (
      select
        st.*,
        row_number() over (order by st.roll_no) as rn
      from vp_student_profiles st
      where st.school_id = p.school_id
        and st.class_level = p.class_level
        and st.section = p.section
      limit 6
    ) rn on true
    where p.school_id = rn.school_id
      and p.class_level = rn.class_level
      and p.section = rn.section;
  end if;
end $$;

do $$
begin
  if to_regclass('public.exam_sessions') is not null then
    insert into public.exam_sessions (
      pack_id,
      student_name,
      submission_code,
      status,
      violation_counts,
      total_violations,
      started_at,
      last_heartbeat_at,
      submitted_at
    )
    select
      s.pack_id,
      s.student_name,
      s.submission_code,
      case when s.status = 'pending_review' then 'active' else 'submitted' end,
      jsonb_build_object('tab_switch', 1, 'face_missing', 0),
      case when s.status = 'pending_review' then 0 else 1 end,
      s.created_at - interval '40 minutes',
      s.created_at - interval '5 minutes',
      case when s.status = 'pending_review' then null else s.created_at end
    from public.teacher_submissions s
    where s.attempt_no = 1
    limit 120;
  end if;
end $$;

do $$
begin
  if to_regclass('public.exam_violations') is not null then
    insert into public.exam_violations (session_id, event_type, detail, occurred_at)
    select
      es.id,
      'tab_switch',
      'Student switched browser tab during assessment.',
      es.started_at + interval '12 minutes'
    from public.exam_sessions es
    where es.total_violations > 0
    limit 80;
  end if;
end $$;

do $$
begin
  if to_regclass('public.push_subscriptions') is not null then
    insert into public.push_subscriptions (
      user_id, role, school_id, endpoint, p256dh, auth
    )
    select
      sp.id::text,
      'student',
      sp.school_id,
      'https://push.seed.vidyapath.local/sub/' || sp.roll_code,
      md5(sp.roll_code || ':p256dh'),
      md5(sp.roll_code || ':auth')
    from vp_student_profiles sp
    where right(sp.roll_no, 1)::int <= 2
    on conflict (endpoint) do nothing;
  end if;
end $$;

do $$
begin
  if to_regclass('public.announcement_reads') is not null
     and to_regclass('public.school_announcements') is not null then
    insert into public.announcement_reads (
      announcement_id, student_id, school_id, read_at
    )
    select
      sa.id::text,
      sp.id::text,
      sp.school_id,
      now() - interval '2 hours'
    from public.school_announcements sa
    join vp_student_profiles sp
      on sp.school_id = sa.school_id
    where right(sp.roll_no, 1)::int <= 3
    on conflict (announcement_id, student_id) do nothing;
  end if;
end $$;

insert into public.token_usage_events (
  school_id,
  auth_user_id,
  role,
  endpoint,
  provider,
  model,
  request_id,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  estimated
)
select
  p.school_id,
  p.auth_user_id,
  'teacher',
  '/api/teacher/ai-tools',
  'openai',
  'gpt-5.4-mini',
  'seed-teacher-' || p.teacher_seq,
  220 + p.teacher_seq,
  480 + (p.teacher_seq * 2),
  700 + (p.teacher_seq * 3),
  false
from vp_teacher_profiles p
union all
select
  s.school_id,
  s.auth_user_id,
  'student',
  '/api/ai-tutor',
  'openai',
  'gpt-5.4-mini',
  'seed-student-' || right(s.roll_code, 6),
  160,
  320,
  480,
  false
from vp_student_profiles s
where right(s.roll_no, 1)::int <= 2;

insert into public.app_state (state_key, state_json, updated_at)
values
  ('analytics_store_v1', jsonb_build_object('seededAt', now(), 'schools', 3), now()),
  ('teacher_store_v2', jsonb_build_object('seededAt', now(), 'packs', (select count(*) from vp_pack_rows)), now())
on conflict (state_key) do update
set
  state_json = excluded.state_json,
  updated_at = excluded.updated_at;

insert into public.seed_login_credentials (
  school_code,
  role,
  display_name,
  identifier,
  alt_identifier,
  class_level,
  section,
  batch,
  password,
  notes
)
select
  school_code,
  'admin',
  name,
  admin_identifier,
  phone,
  null,
  null,
  null,
  password,
  'Use schoolCode + admin_identifier + password on /admin/login'
from vp_admin_ready
union all
select
  school_code,
  'teacher',
  name,
  staff_code,
  phone,
  class_level,
  section,
  null,
  password,
  'Use schoolCode + identifier(staff code/phone) + password on /teacher/login'
from vp_teacher_ready
union all
select
  school_code,
  'student',
  name,
  roll_no,
  roll_code,
  class_level,
  section,
  null::text as batch,
  password,
  'Use schoolCode + classLevel + section + rollNo + password on /student/login'
from vp_student_seed;

commit;

-- =============================================================
-- Verification Outputs
-- =============================================================

select 'schools' as item, (select count(*) from public.schools) as rows
union all select 'admins', (select count(*) from public.school_admin_profiles)
union all select 'teachers', (select count(*) from public.teacher_profiles)
union all select 'students', (select count(*) from public.student_profiles)
union all select 'class_sections', (select count(*) from public.class_sections)
union all select 'student_subject_enrollments', (select count(*) from public.student_subject_enrollments)
union all select 'assignment_packs', (select count(*) from public.teacher_assignment_packs)
union all select 'submissions', (select count(*) from public.teacher_submissions)
union all select 'attendance_records', (
  case
    when to_regclass('public.attendance_records') is null then 0
    else (select count(*) from public.attendance_records)
  end
)
order by item;

select
  school_code,
  role,
  count(*) as login_count
from public.seed_login_credentials
group by school_code, role
order by school_code, role;

select school_code, role, display_name, identifier, alt_identifier, class_level, section, batch, password
from public.seed_login_credentials
where role = 'admin'
order by school_code, display_name;

select school_code, role, display_name, identifier, alt_identifier, class_level, section, batch, password
from public.seed_login_credentials
where role = 'teacher'
order by school_code, class_level, section, display_name
limit 30;

select school_code, role, display_name, identifier as roll_no, alt_identifier as roll_code, class_level, section, batch, password
from public.seed_login_credentials
where role = 'student'
order by school_code, class_level, section, identifier
limit 60;
