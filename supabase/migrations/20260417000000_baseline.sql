create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  school_code text not null unique,
  board text not null default 'CBSE',
  city text,
  state text,
  contact_phone text,
  contact_email text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_affiliate_requests (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  school_code_hint text,
  board text,
  state text,
  city text,
  affiliate_no text,
  website_url text,
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_by_auth_user_id uuid,
  reviewed_at timestamptz,
  linked_school_id uuid references public.schools(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_admin_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  auth_user_id uuid,
  auth_email text,
  admin_identifier text not null,
  phone text,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_user_roles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  role text not null check (role in ('student', 'teacher', 'admin', 'developer')),
  school_id uuid references public.schools(id) on delete cascade,
  profile_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_usage_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  auth_user_id uuid,
  role text,
  endpoint text not null,
  provider text,
  model text,
  request_id text,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  estimated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.identity_counters (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  role_code text not null check (role_code in ('STU', 'TC', 'AD')),
  class_code text not null,
  batch_code text not null,
  year_code text not null,
  next_seq int not null default 1 check (next_seq >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1) Generic app state blob table
-- ---------------------------------------------------------------------------
create table if not exists public.app_state (
  state_key text primary key,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_state_updated_at_idx on public.app_state (updated_at desc);
create index if not exists school_affiliate_requests_status_idx on public.school_affiliate_requests (status, created_at desc);
create index if not exists school_affiliate_requests_school_idx on public.school_affiliate_requests (linked_school_id);

-- ---------------------------------------------------------------------------
-- 2) Teacher + admin normalized schema
-- ---------------------------------------------------------------------------
create table if not exists public.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  auth_user_id uuid,
  auth_email text,
  phone text not null,
  staff_code text,
  name text not null,
  pin_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_scopes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.class_sections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_level int not null check (class_level in (10, 12)),
  section text not null,
  batch text,
  class_teacher_id uuid references public.teacher_profiles(id) on delete set null,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_section_id uuid not null references public.class_sections(id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  role text not null check (role in ('class_teacher', 'subject_teacher')),
  subject text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_subject_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  class_section_id uuid references public.class_sections(id) on delete set null,
  subject text not null,
  assigned_by_teacher_id uuid references public.teacher_profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_activity (
  id bigserial primary key,
  teacher_id uuid references public.teacher_profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('teacher', 'admin', 'system')),
  action text not null,
  chapter_id text,
  pack_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_announcements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  chapter_id text,
  title text not null,
  body text not null,
  batch text,
  delivery_scope text not null default 'chapter' check (delivery_scope in ('class', 'section', 'batch', 'chapter')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.teacher_quiz_links (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  chapter_id text not null,
  url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_topic_priority (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  chapter_id text not null,
  topics text[] not null default '{}'::text[],
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_assignment_packs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  chapter_id text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  visibility_status text not null default 'open' check (visibility_status in ('open', 'closed')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  closed_at timestamptz,
  reopened_count int not null default 0,
  extended_count int not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_submissions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.teacher_assignment_packs(id) on delete cascade,
  student_id uuid,
  student_name text not null default 'Student',
  submission_code text not null,
  attempt_no int not null default 1,
  status text not null default 'pending_review' check (status in ('pending_review', 'graded', 'released')),
  answers jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  grading jsonb not null default '{}'::jsonb,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  auth_user_id uuid,
  auth_email text,
  batch text,
  roll_no text,
  name text not null,
  roll_code text not null,
  class_level int not null check (class_level in (10, 12)),
  section text,
  pin_hash text,
  must_change_password boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_question_bank (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text not null,
  section text,
  chapter_id text not null,
  kind text not null check (kind in ('mcq', 'short', 'long')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer_index int,
  rubric text,
  max_marks numeric(8,2) not null default 1,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  scope_id uuid references public.teacher_scopes(id) on delete set null,
  class_level int not null check (class_level in (10, 12)),
  subject text,
  section text,
  status text not null default 'active' check (status in ('active', 'archived')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.teacher_assignment_packs(id) on delete cascade,
  student_name text not null,
  submission_code text not null,
  status text not null default 'active' check (status in ('active', 'submitted', 'abandoned')),
  violation_counts jsonb not null default '{}'::jsonb,
  total_violations int not null default 0,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  submitted_at timestamptz
);

create table if not exists public.exam_violations (
  id bigserial primary key,
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  event_type text not null,
  detail text,
  occurred_at timestamptz not null default now()
);

alter table if exists public.teacher_submissions
  add column if not exists student_name text not null default 'Student';
alter table if exists public.teacher_submissions
  add column if not exists attempt_no int not null default 1;
alter table if exists public.teacher_submissions
  add column if not exists student_id uuid;
alter table if exists public.teacher_submissions
  add column if not exists status text not null default 'pending_review';
alter table if exists public.teacher_submissions
  add column if not exists grading jsonb not null default '{}'::jsonb;
alter table if exists public.teacher_submissions
  add column if not exists released_at timestamptz;
alter table if exists public.teacher_assignment_packs
  add column if not exists status text not null default 'draft';
alter table if exists public.teacher_assignment_packs
  add column if not exists visibility_status text not null default 'open';
alter table if exists public.teacher_assignment_packs
  add column if not exists valid_from timestamptz not null default now();
alter table if exists public.teacher_assignment_packs
  add column if not exists valid_until timestamptz;
alter table if exists public.teacher_assignment_packs
  add column if not exists closed_at timestamptz;
alter table if exists public.teacher_assignment_packs
  add column if not exists reopened_count int not null default 0;
alter table if exists public.teacher_assignment_packs
  add column if not exists extended_count int not null default 0;
alter table if exists public.teacher_announcements
  add column if not exists batch text;
alter table if exists public.teacher_announcements
  add column if not exists delivery_scope text not null default 'chapter';
alter table if exists public.teacher_profiles
  add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table if exists public.teacher_profiles
  add column if not exists auth_user_id uuid;
alter table if exists public.teacher_profiles
  add column if not exists auth_email text;
alter table if exists public.teacher_profiles
  add column if not exists staff_code text;
alter table if exists public.teacher_scopes
  add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table if exists public.student_profiles
  add column if not exists school_id uuid references public.schools(id) on delete set null;
alter table if exists public.student_profiles
  add column if not exists auth_user_id uuid;
alter table if exists public.student_profiles
  add column if not exists auth_email text;
alter table if exists public.student_profiles
  add column if not exists batch text;
alter table if exists public.student_profiles
  add column if not exists roll_no text;
alter table if exists public.student_profiles
  add column if not exists must_change_password boolean not null default false;
alter table if exists public.class_sections
  add column if not exists notes text;
alter table if exists public.class_sections
  add column if not exists status text not null default 'active';
alter table if exists public.class_sections
  add column if not exists updated_at timestamptz not null default now();
alter table if exists public.teacher_class_assignments
  add column if not exists updated_at timestamptz not null default now();
alter table if exists public.student_subject_enrollments
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  update public.identity_counters
  set role_code = 'STU'
  where role_code = 'ST';
exception
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'identity_counters_role_code_check'
      and conrelid = 'public.identity_counters'::regclass
  ) then
    alter table public.identity_counters
      drop constraint identity_counters_role_code_check;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  alter table public.identity_counters
    add constraint identity_counters_role_code_check
    check (role_code in ('STU', 'TC', 'AD'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_assignment_packs_status_check'
      and conrelid = 'public.teacher_assignment_packs'::regclass
  ) then
    alter table public.teacher_assignment_packs
      drop constraint teacher_assignment_packs_status_check;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  update public.teacher_assignment_packs
  set status = case
    when status = 'active' then 'published'
    when status = 'archived' then 'archived'
    else status
  end
  where status in ('active', 'archived');
exception
  when undefined_table then null;
end $$;

do $$
begin
  alter table public.teacher_assignment_packs
    add constraint teacher_assignment_packs_status_check
    check (status in ('draft', 'review', 'published', 'archived'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_assignment_packs_visibility_status_check'
      and conrelid = 'public.teacher_assignment_packs'::regclass
  ) then
    alter table public.teacher_assignment_packs
      drop constraint teacher_assignment_packs_visibility_status_check;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  alter table public.teacher_assignment_packs
    add constraint teacher_assignment_packs_visibility_status_check
    check (visibility_status in ('open', 'closed'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_announcements_delivery_scope_check'
      and conrelid = 'public.teacher_announcements'::regclass
  ) then
    alter table public.teacher_announcements
      drop constraint teacher_announcements_delivery_scope_check;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  alter table public.teacher_announcements
    add constraint teacher_announcements_delivery_scope_check
    check (delivery_scope in ('class', 'section', 'batch', 'chapter'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_submissions_status_check'
      and conrelid = 'public.teacher_submissions'::regclass
  ) then
    alter table public.teacher_submissions
      drop constraint teacher_submissions_status_check;
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  update public.teacher_submissions
  set status = case
    when status = 'active' then 'pending_review'
    when status = 'archived' then 'released'
    else status
  end
  where status in ('active', 'archived');
exception
  when undefined_table then null;
end $$;

do $$
begin
  alter table public.teacher_submissions
    add constraint teacher_submissions_status_check
    check (status in ('pending_review', 'graded', 'released'));
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_profiles_phone_key'
      and conrelid = 'public.teacher_profiles'::regclass
  ) then
    alter table public.teacher_profiles
      drop constraint teacher_profiles_phone_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_subject_enrollments'
      and column_name = 'student_id'
  ) then
    begin
      alter table public.student_subject_enrollments
        add constraint student_subject_enrollments_student_id_fkey
        foreign key (student_id) references public.student_profiles(id) on delete cascade;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'student_profiles_roll_code_key'
      and conrelid = 'public.student_profiles'::regclass
  ) then
    alter table public.student_profiles
      drop constraint student_profiles_roll_code_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'teacher_submissions_pack_id_submission_code_key'
      and conrelid = 'public.teacher_submissions'::regclass
  ) then
    alter table public.teacher_submissions
      drop constraint teacher_submissions_pack_id_submission_code_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teacher_submissions'
      and column_name = 'student_id'
  ) then
    begin
      alter table public.teacher_submissions
        add constraint teacher_submissions_student_id_fkey
        foreign key (student_id) references public.student_profiles(id) on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

create index if not exists teacher_profiles_phone_idx on public.teacher_profiles (phone);
create index if not exists teacher_profiles_school_idx on public.teacher_profiles (school_id, status);
create index if not exists teacher_profiles_auth_user_idx on public.teacher_profiles (auth_user_id);
create unique index if not exists teacher_profiles_school_staff_code_uniq on public.teacher_profiles (school_id, staff_code) where staff_code is not null;
create unique index if not exists teacher_profiles_school_phone_uniq on public.teacher_profiles (school_id, phone);
create index if not exists teacher_scopes_teacher_idx on public.teacher_scopes (teacher_id, is_active);
create index if not exists teacher_scopes_lookup_idx on public.teacher_scopes (class_level, subject, section, is_active);
create index if not exists teacher_scopes_school_idx on public.teacher_scopes (school_id, class_level, subject, section, is_active);
create index if not exists class_sections_school_idx on public.class_sections (school_id, class_level, section, coalesce(batch, ''), status);
create unique index if not exists class_sections_school_unique on public.class_sections (school_id, class_level, section, coalesce(batch, ''));
create index if not exists class_sections_class_teacher_idx on public.class_sections (class_teacher_id, updated_at desc);
create index if not exists teacher_class_assignments_teacher_idx on public.teacher_class_assignments (teacher_id, role, is_active, updated_at desc);
create index if not exists teacher_class_assignments_section_idx on public.teacher_class_assignments (class_section_id, role, is_active, updated_at desc);
create unique index if not exists teacher_class_assignments_active_uniq on public.teacher_class_assignments (school_id, class_section_id, teacher_id, role, coalesce(subject, '')) where is_active = true;
create unique index if not exists teacher_class_assignments_class_teacher_uniq on public.teacher_class_assignments (school_id, class_section_id) where role = 'class_teacher' and is_active = true;
create index if not exists student_subject_enrollments_student_idx on public.student_subject_enrollments (student_id, status, subject);
create index if not exists student_subject_enrollments_section_idx on public.student_subject_enrollments (class_section_id, status, subject);
create index if not exists student_subject_enrollments_school_idx on public.student_subject_enrollments (school_id, subject, status);
create unique index if not exists student_subject_enrollments_active_uniq on public.student_subject_enrollments (school_id, student_id, coalesce(class_section_id::text, ''), subject) where status = 'active';
create index if not exists teacher_announcements_scope_idx on public.teacher_announcements (class_level, subject, section, is_active, created_at desc);
create index if not exists teacher_quiz_links_chapter_idx on public.teacher_quiz_links (chapter_id, is_active, updated_at desc);
create index if not exists teacher_topic_priority_chapter_idx on public.teacher_topic_priority (chapter_id, is_active, updated_at desc);
create index if not exists teacher_assignment_packs_teacher_idx on public.teacher_assignment_packs (teacher_id, updated_at desc);
create index if not exists teacher_assignment_packs_chapter_idx on public.teacher_assignment_packs (chapter_id, updated_at desc);
create index if not exists teacher_assignment_packs_visibility_idx on public.teacher_assignment_packs (status, visibility_status, valid_from, valid_until, updated_at desc);
create index if not exists teacher_submissions_pack_idx on public.teacher_submissions (pack_id, created_at desc);
create index if not exists teacher_submissions_student_idx on public.teacher_submissions (pack_id, submission_code, created_at desc);
create index if not exists student_profiles_roll_code_idx on public.student_profiles (roll_code);
create unique index if not exists student_profiles_school_roll_code_uniq on public.student_profiles (school_id, roll_code);
create index if not exists student_profiles_class_section_idx on public.student_profiles (class_level, section, status);
create index if not exists student_profiles_school_idx on public.student_profiles (school_id, class_level, section, status);
create index if not exists student_profiles_auth_user_idx on public.student_profiles (auth_user_id);
create unique index if not exists student_profiles_roster_uniq on public.student_profiles (school_id, class_level, coalesce(section, ''), coalesce(batch, ''), roll_no) where roll_no is not null;
create index if not exists teacher_question_bank_teacher_idx on public.teacher_question_bank (teacher_id, updated_at desc);
create index if not exists teacher_question_bank_chapter_idx on public.teacher_question_bank (chapter_id, is_active, updated_at desc);
create index if not exists teacher_activity_teacher_idx on public.teacher_activity (teacher_id, created_at desc);
create unique index if not exists teacher_quiz_links_scope_uniq on public.teacher_quiz_links (teacher_id, scope_id, chapter_id);
create unique index if not exists teacher_topic_priority_scope_uniq on public.teacher_topic_priority (teacher_id, scope_id, chapter_id);
create index if not exists exam_sessions_pack_idx on public.exam_sessions (pack_id, status, started_at desc);
create index if not exists exam_sessions_submission_idx on public.exam_sessions (pack_id, submission_code, started_at desc);
create index if not exists exam_violations_session_idx on public.exam_violations (session_id, occurred_at desc);
create index if not exists schools_status_idx on public.schools (status, updated_at desc);
create unique index if not exists schools_code_uniq on public.schools (school_code);
create unique index if not exists identity_counters_key_uniq
  on public.identity_counters (school_id, role_code, class_code, batch_code, year_code);
create index if not exists identity_counters_school_idx
  on public.identity_counters (school_id, role_code, updated_at desc);
create index if not exists school_admin_profiles_school_idx on public.school_admin_profiles (school_id, status);
create unique index if not exists school_admin_profiles_identifier_uniq on public.school_admin_profiles (school_id, admin_identifier);
create index if not exists school_admin_profiles_auth_user_idx on public.school_admin_profiles (auth_user_id);
create index if not exists platform_user_roles_auth_idx on public.platform_user_roles (auth_user_id, is_active);
create index if not exists platform_user_roles_school_role_idx on public.platform_user_roles (school_id, role, is_active);
create unique index if not exists platform_user_roles_unique_assignment on public.platform_user_roles (auth_user_id, role, coalesce(school_id::text, ''), coalesce(profile_id::text, ''));
create index if not exists token_usage_events_school_idx on public.token_usage_events (school_id, created_at desc);
create index if not exists token_usage_events_endpoint_idx on public.token_usage_events (endpoint, created_at desc);
create index if not exists token_usage_events_auth_idx on public.token_usage_events (auth_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Security, audit, career, and data quality controls
-- ---------------------------------------------------------------------------
create table if not exists public.request_throttle (
  id uuid primary key default gen_random_uuid(),
  throttle_key text not null,
  bucket_start timestamptz not null,
  window_seconds int not null check (window_seconds > 0),
  request_count int not null default 1 check (request_count >= 0),
  blocked_until timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb default '{}'::jsonb
);

create unique index if not exists request_throttle_bucket_uniq
  on public.request_throttle (throttle_key, bucket_start);
create index if not exists request_throttle_last_seen_idx
  on public.request_throttle (last_seen_at desc);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  endpoint text not null,
  action text not null,
  status_code int not null check (status_code between 100 and 599),
  actor_role text not null default 'system' check (actor_role in ('student', 'teacher', 'admin', 'developer', 'system')),
  actor_auth_user_id uuid,
  school_id uuid references public.schools(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_request_idx on public.audit_events (request_id, created_at desc);
create index if not exists audit_events_school_idx on public.audit_events (school_id, created_at desc);

create table if not exists public.api_idempotency (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  actor_auth_user_id uuid,
  endpoint text not null,
  idempotency_key text not null,
  request_hash text,
  response_json jsonb,
  status_code int not null default 200,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create unique index if not exists api_idempotency_actor_key_uniq
  on public.api_idempotency (coalesce(school_id::text, ''), coalesce(actor_auth_user_id::text, ''), endpoint, idempotency_key);
create index if not exists api_idempotency_exp_idx on public.api_idempotency (expires_at);

create table if not exists public.career_track_catalog (
  id uuid primary key default gen_random_uuid(),
  track_code text not null unique,
  stream text not null check (stream in ('pcm', 'pcb', 'commerce')),
  title text not null,
  description text not null,
  source_url text not null,
  last_verified_at date not null,
  verification_owner text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_exam_catalog (
  id uuid primary key default gen_random_uuid(),
  exam_code text not null unique,
  track_code text not null references public.career_track_catalog(track_code) on delete cascade,
  title text not null,
  summary text not null,
  eligibility text not null,
  schedule text not null,
  official_url text not null,
  source_url text not null,
  last_verified_at date not null,
  verification_owner text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_career_map (
  id uuid primary key default gen_random_uuid(),
  chapter_id text not null,
  track_code text not null references public.career_track_catalog(track_code) on delete cascade,
  pathways text[] not null default '{}'::text[],
  relevance text not null,
  source_url text not null,
  last_verified_at date not null,
  verification_owner text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chapter_career_map_unique
  on public.chapter_career_map (chapter_id, track_code);
create index if not exists chapter_career_map_lookup_idx
  on public.chapter_career_map (chapter_id, status, updated_at desc);

create table if not exists public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  school_id uuid references public.schools(id) on delete set null,
  source_path text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists data_quality_issues_status_idx on public.data_quality_issues (status, severity, created_at desc);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'career_track_catalog_touch_updated_at'
  ) then
    create trigger career_track_catalog_touch_updated_at
      before update on public.career_track_catalog
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'career_exam_catalog_touch_updated_at'
  ) then
    create trigger career_exam_catalog_touch_updated_at
      before update on public.career_exam_catalog
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'chapter_career_map_touch_updated_at'
  ) then
    create trigger chapter_career_map_touch_updated_at
      before update on public.chapter_career_map
      for each row execute function public.touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'class_sections_touch_updated_at'
  ) then
    create trigger class_sections_touch_updated_at
      before update on public.class_sections
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'teacher_class_assignments_touch_updated_at'
  ) then
    create trigger teacher_class_assignments_touch_updated_at
      before update on public.teacher_class_assignments
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'student_subject_enrollments_touch_updated_at'
  ) then
    create trigger student_subject_enrollments_touch_updated_at
      before update on public.student_subject_enrollments
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'identity_counters_touch_updated_at'
  ) then
    create trigger identity_counters_touch_updated_at
      before update on public.identity_counters
      for each row execute function public.touch_updated_at();
  end if;
end $$;

insert into public.student_subject_enrollments (
  id,
  school_id,
  student_id,
  class_section_id,
  subject,
  assigned_by_teacher_id,
  status,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  s.school_id,
  s.id,
  null,
  subj.subject,
  null,
  'active',
  now(),
  now()
from public.student_profiles s
cross join (
  values
    ('Physics'),
    ('Chemistry'),
    ('Biology'),
    ('Math'),
    ('Accountancy'),
    ('Business Studies'),
    ('Economics'),
    ('English Core')
) as subj(subject)
left join public.student_subject_enrollments e
  on e.school_id = s.school_id
 and e.student_id = s.id
 and e.subject = subj.subject
 and e.status = 'active'
where s.status = 'active'
  and s.school_id is not null
  and (
    (s.class_level = 10 and subj.subject in ('Physics', 'Chemistry', 'Biology', 'Math', 'English Core'))
    or
    (s.class_level = 12 and subj.subject in ('Physics', 'Chemistry', 'Biology', 'Math', 'Accountancy', 'Business Studies', 'Economics', 'English Core'))
  )
  and e.id is null;

-- ---------------------------------------------------------------------------
-- 4) School operations: attendance, resources, events, timetable, announcements, push/read receipts
-- ---------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  class_level smallint not null check (class_level in (10, 12)),
  section text not null,
  date date not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  marked_at timestamptz not null default now(),
  unique(student_id, date)
);

create index if not exists attendance_records_school_date_idx
  on public.attendance_records (school_id, date desc);
create index if not exists attendance_records_teacher_idx
  on public.attendance_records (teacher_id, date desc);
create index if not exists attendance_records_class_section_idx
  on public.attendance_records (school_id, class_level, section, date desc);

create table if not exists public.class_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('pdf', 'link', 'video', 'image')),
  url text not null,
  subject text,
  class_level smallint check (class_level in (10, 12)),
  section text,
  chapter_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_resources_school_created_idx
  on public.class_resources (school_id, created_at desc);
create index if not exists class_resources_chapter_idx
  on public.class_resources (chapter_id, created_at desc);
create index if not exists class_resources_class_subject_idx
  on public.class_resources (school_id, class_level, subject, section, created_at desc);

create table if not exists public.school_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('exam', 'assignment_due', 'holiday', 'meeting', 'other')),
  event_date date not null,
  class_level smallint check (class_level in (10, 12)),
  section text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_events_school_date_idx
  on public.school_events (school_id, event_date asc, created_at desc);
create index if not exists school_events_scope_idx
  on public.school_events (school_id, class_level, section, event_date asc);

create table if not exists public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_level smallint not null check (class_level in (10, 12)),
  section text not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period_no smallint not null check (period_no >= 1 and period_no <= 20),
  subject text not null,
  teacher_id uuid references public.teacher_profiles(id) on delete set null,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, class_level, section, day_of_week, period_no)
);

create index if not exists timetable_slots_school_scope_idx
  on public.timetable_slots (school_id, class_level, section, day_of_week, period_no);

create table if not exists public.school_announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'teachers', 'students', 'class10', 'class12')),
  created_by_role text not null check (created_by_role in ('admin', 'developer')),
  created_by_auth_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists school_announcements_school_created_idx
  on public.school_announcements (school_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null check (role in ('student', 'teacher', 'admin', 'developer')),
  school_id uuid references public.schools(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_school_idx
  on public.push_subscriptions (school_id, role, created_at desc);

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id text not null,
  student_id text not null,
  school_id uuid references public.schools(id) on delete set null,
  read_at timestamptz not null default now(),
  unique(announcement_id, student_id)
);

create index if not exists announcement_reads_school_idx
  on public.announcement_reads (school_id, read_at desc);
create index if not exists announcement_reads_announcement_idx
  on public.announcement_reads (announcement_id, read_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'class_resources_touch_updated_at'
  ) then
    create trigger class_resources_touch_updated_at
      before update on public.class_resources
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'school_events_touch_updated_at'
  ) then
    create trigger school_events_touch_updated_at
      before update on public.school_events
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'timetable_slots_touch_updated_at'
  ) then
    create trigger timetable_slots_touch_updated_at
      before update on public.timetable_slots
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'school_announcements_touch_updated_at'
  ) then
    create trigger school_announcements_touch_updated_at
      before update on public.school_announcements
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- Retention helper: invoke from scheduled job (pg_cron / external scheduler).
create or replace function public.prune_operational_data()
returns void as $$
begin
  delete from public.request_throttle where last_seen_at < now() - interval '14 days';
  delete from public.api_idempotency where expires_at < now();
  delete from public.audit_events where created_at < now() - interval '180 days';
  delete from public.exam_violations where occurred_at < now() - interval '180 days';
  delete from public.token_usage_events where created_at < now() - interval '365 days';
  delete from public.announcement_reads where read_at < now() - interval '365 days';
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 5) Study enhancements + parent portal
-- ---------------------------------------------------------------------------
create table if not exists public.srs_cards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  card_id text not null,
  chapter_id text not null,
  due timestamptz not null default now(),
  stability double precision not null default 1,
  difficulty double precision not null default 5,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning')),
  last_review timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, card_id)
);

create index if not exists srs_cards_student_due_idx
  on public.srs_cards (student_id, due asc);
create index if not exists srs_cards_chapter_idx
  on public.srs_cards (chapter_id, due asc);

create table if not exists public.student_streaks (
  student_id uuid primary key references public.student_profiles(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active date,
  total_study_days int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_badges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  badge_type text not null,
  earned_at timestamptz not null default now(),
  unique(student_id, badge_type)
);

create index if not exists student_badges_student_earned_idx
  on public.student_badges (student_id, earned_at desc);

create table if not exists public.chapter_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  chapter_id text not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique(student_id, chapter_id)
);

create index if not exists chapter_notes_student_updated_idx
  on public.chapter_notes (student_id, updated_at desc);

create table if not exists public.mock_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  class_level smallint not null check (class_level in (10, 12)),
  subject text not null,
  duration_minutes int not null default 60,
  question_count int not null default 20,
  status text not null default 'active' check (status in ('active', 'submitted')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score numeric(8,2),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists mock_exam_sessions_student_created_idx
  on public.mock_exam_sessions (student_id, created_at desc);
create index if not exists mock_exam_sessions_school_status_idx
  on public.mock_exam_sessions (school_id, status, created_at desc);

create table if not exists public.parent_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  phone text not null,
  pin_hash text not null,
  name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id),
  unique(phone, student_id)
);

create index if not exists parent_links_school_idx
  on public.parent_links (school_id, status, updated_at desc);
create index if not exists parent_links_phone_idx
  on public.parent_links (phone, status);


do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'srs_cards_touch_updated_at') then
    create trigger srs_cards_touch_updated_at
      before update on public.srs_cards
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'student_streaks_touch_updated_at') then
    create trigger student_streaks_touch_updated_at
      before update on public.student_streaks
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'chapter_notes_touch_updated_at') then
    create trigger chapter_notes_touch_updated_at
      before update on public.chapter_notes
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'mock_exam_sessions_touch_updated_at') then
    create trigger mock_exam_sessions_touch_updated_at
      before update on public.mock_exam_sessions
      for each row execute function public.touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'parent_links_touch_updated_at') then
    create trigger parent_links_touch_updated_at
      before update on public.parent_links
      for each row execute function public.touch_updated_at();
  end if;
end $$;
