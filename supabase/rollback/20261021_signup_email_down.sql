-- Rollback for supabase/migrations/20261021_signup_email.sql

begin;

revoke all on function public.account_status_by_email(text) from public, anon, authenticated;
drop function if exists public.account_status_by_email(text);

drop index if exists public.profiles_email_lower_uidx;
alter table public.profiles drop column if exists email;

commit;
