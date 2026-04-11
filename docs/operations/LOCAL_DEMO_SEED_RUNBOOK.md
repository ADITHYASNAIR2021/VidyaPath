# Local Demo Seed Runbook

## Purpose
Seed a full, realistic school-management dataset for VidyaPath local/UAT with short, friendly login identifiers and reusable credentials.

## Seed files

- Base schema: `scripts/sql/supabase_init.sql`
- Fresh reset + 3 schools + credentials: `scripts/sql/reset_and_seed_three_schools_friendly_ids.sql`

## What it creates
- Schools:
  - `SPS` = Sreyas Public School and Junior College
  - `STS` = ST. Antonys School
  - `SJS` = ST. Josephs School
- Per school:
  - 2 admins
  - 20 teachers
  - 200 students (Class 10A, 10B, 12A, 12B; no batch split)
- Core operations data:
  - Class sections, teacher mappings, subject enrollments
  - School announcements, events, timetable
  - Attendance records
  - Assignment packs + submissions + exam integrity rows
  - Token usage events
  - Push subscriptions + announcement reads
- Login credential catalog table:
  - `public.seed_login_credentials`

## Friendly identifier format
- Admin: `<SCHOOL_CODE><PHONE10>` (example: `SPS8136859455`)
- Teacher: `<SCHOOL_CODE><PHONE10>` (example: `SPS8136859455`)
- Student:
  - `roll_no`: `<class><section><NNN>` (example: `10A001`)
  - `roll_code`: `<SCHOOL><class><section><NNN>` (example: `SPS10A001`)

## Default seeded passwords
- Admin: generated 6-char mixed password (letters/digits/special)
- Teacher: generated 6-char mixed password (letters/digits/special)
- Student: `Stu@1234`

## Run order (SQL editor)
1. Run `scripts/sql/supabase_init.sql`.
2. Run `scripts/sql/reset_and_seed_three_schools_friendly_ids.sql`.

## Credential retrieval
```sql
select school_code, role, count(*) as users
from public.seed_login_credentials
group by school_code, role
order by school_code, role;

select *
from public.seed_login_credentials
where school_code in ('SPS','STS','SJS')
order by school_code, role, class_level nulls first, section nulls first, display_name;
```

## Login usage
- Admin: `/admin/login`
  - `schoolCode` + `identifier` (admin ID) + password
- Teacher: `/teacher/login`
  - `schoolCode` + `identifier` (staff code or phone) + password
- Student: `/student/login`
  - `schoolCode` + `classLevel` + `section` + `rollNo` + password

## Notes
- The reset script performs a hard reset of school-linked app data before seeding.
- It is re-runnable; IDs stay deterministic but admin/teacher passwords are regenerated each run.
