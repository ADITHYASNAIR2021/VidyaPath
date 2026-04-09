-- VidyaPath consolidated Supabase setup
-- Run this once in Supabase SQL editor.
-- Includes:
-- 1) app_state key-value table (analytics/local state migration support)
-- 2) normalized admin + teacher platform tables

create extension if not exists pgcrypto;

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
  phone text not null unique,
  name text not null,
  pin_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_scopes (
  id uuid primary key default gen_random_uuid(),
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
  name text not null,
  roll_code text not null unique,
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
create index if not exists teacher_scopes_teacher_idx on public.teacher_scopes (teacher_id, is_active);
create index if not exists teacher_scopes_lookup_idx on public.teacher_scopes (class_level, subject, section, is_active);
create index if not exists teacher_announcements_scope_idx on public.teacher_announcements (class_level, subject, section, is_active, created_at desc);
create index if not exists teacher_quiz_links_chapter_idx on public.teacher_quiz_links (chapter_id, is_active, updated_at desc);
create index if not exists teacher_topic_priority_chapter_idx on public.teacher_topic_priority (chapter_id, is_active, updated_at desc);
create index if not exists teacher_assignment_packs_teacher_idx on public.teacher_assignment_packs (teacher_id, updated_at desc);
create index if not exists teacher_assignment_packs_chapter_idx on public.teacher_assignment_packs (chapter_id, updated_at desc);
create index if not exists teacher_submissions_pack_idx on public.teacher_submissions (pack_id, created_at desc);
create index if not exists teacher_submissions_student_idx on public.teacher_submissions (pack_id, submission_code, created_at desc);
create index if not exists student_profiles_roll_code_idx on public.student_profiles (roll_code);
create index if not exists student_profiles_class_section_idx on public.student_profiles (class_level, section, status);
create index if not exists teacher_question_bank_teacher_idx on public.teacher_question_bank (teacher_id, updated_at desc);
create index if not exists teacher_question_bank_chapter_idx on public.teacher_question_bank (chapter_id, is_active, updated_at desc);
create index if not exists teacher_activity_teacher_idx on public.teacher_activity (teacher_id, created_at desc);
create unique index if not exists teacher_quiz_links_scope_uniq on public.teacher_quiz_links (teacher_id, scope_id, chapter_id);
create unique index if not exists teacher_topic_priority_scope_uniq on public.teacher_topic_priority (teacher_id, scope_id, chapter_id);
create index if not exists exam_sessions_pack_idx on public.exam_sessions (pack_id, status, started_at desc);
create index if not exists exam_sessions_submission_idx on public.exam_sessions (pack_id, submission_code, started_at desc);
create index if not exists exam_violations_session_idx on public.exam_violations (session_id, occurred_at desc);
