alter table if exists public.school_admin_profiles
  add column if not exists must_change_password boolean;

-- Preserve established principal accounts. Newly provisioned principals are
-- explicitly inserted with this flag set to true by the onboarding flow.
update public.school_admin_profiles
set must_change_password = false
where must_change_password is null;

alter table if exists public.school_admin_profiles
  alter column must_change_password set default true,
  alter column must_change_password set not null;
