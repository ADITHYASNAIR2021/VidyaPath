-- VidyaPath consolidated Supabase setup
-- Run this once in Supabase SQL editor.
-- Includes:
-- 1) app_state key-value table (analytics/local state migration support)
-- 2) normalized admin + teacher platform tables

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Multi-school + RBAC core
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 1) Generic app state blob table
-- ---------------------------------------------------------------------------
create table if not exists public.app_state (
  state_key text primary key,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_state_updated_at_idx on public.app_state (updated_at desc);

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
create index if not exists teacher_announcements_scope_idx on public.teacher_announcements (class_level, subject, section, is_active, created_at desc);
create index if not exists teacher_quiz_links_chapter_idx on public.teacher_quiz_links (chapter_id, is_active, updated_at desc);
create index if not exists teacher_topic_priority_chapter_idx on public.teacher_topic_priority (chapter_id, is_active, updated_at desc);
create index if not exists teacher_assignment_packs_teacher_idx on public.teacher_assignment_packs (teacher_id, updated_at desc);
create index if not exists teacher_assignment_packs_chapter_idx on public.teacher_assignment_packs (chapter_id, updated_at desc);
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

-- Retention helper: invoke from scheduled job (pg_cron / external scheduler).
create or replace function public.prune_operational_data()
returns void as $$
begin
  delete from public.request_throttle where last_seen_at < now() - interval '14 days';
  delete from public.api_idempotency where expires_at < now();
  delete from public.audit_events where created_at < now() - interval '180 days';
  delete from public.exam_violations where occurred_at < now() - interval '180 days';
  delete from public.token_usage_events where created_at < now() - interval '365 days';
end;
$$ language plpgsql;
