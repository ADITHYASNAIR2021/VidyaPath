-- Materialized view for admin analytics — replaces the 25k-row Node.js aggregation
-- in /api/admin/analytics.  Refreshed every 30 min via pg_cron (scheduled below).
-- Covers: active-student counts per school/day + submission funnel per school/day.
-- Prerequisite: teacher_assignment_packs.school_id column (added in 000200 migration).

create materialized view if not exists public.daily_school_submission_stats as
select
  tap.school_id,
  (ts.created_at at time zone 'UTC')::date          as date,
  count(distinct ts.student_id)                      as active_students,
  count(*)                                           as total_submissions,
  count(*) filter (where ts.status in ('graded', 'released')) as graded_count,
  count(*) filter (where ts.status = 'released')             as released_count
from public.teacher_submissions ts
join public.teacher_assignment_packs tap on ts.pack_id = tap.id
where tap.school_id is not null
  and ts.student_id is not null
group by tap.school_id, (ts.created_at at time zone 'UTC')::date;

-- Unique index required for CONCURRENTLY refresh (non-blocking)
create unique index if not exists daily_school_submission_stats_pk
  on public.daily_school_submission_stats (school_id, date);

-- Composite index for the analytics read pattern: WHERE school_id = $1 AND date >= $2
create index if not exists daily_school_submission_stats_school_date_idx
  on public.daily_school_submission_stats (school_id, date desc);

-- Grant read access to service_role (used by the analytics API route)
grant select on public.daily_school_submission_stats to service_role;

-- Schedule CONCURRENTLY refresh every 30 minutes via pg_cron.
-- pg_cron must be enabled in the Supabase dashboard (Extensions → pg_cron).
-- If pg_cron is not available, comment out the SELECT below and refresh via
-- a Supabase edge function cron or call REFRESH MATERIALIZED VIEW CONCURRENTLY
-- daily_school_submission_stats from a scheduled server action.
do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'refresh-daily-school-submission-stats',
      '*/30 * * * *',
      $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_school_submission_stats$$
    );
  end if;
end
$$;
