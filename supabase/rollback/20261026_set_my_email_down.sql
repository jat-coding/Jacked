-- Rollback for supabase/migrations/20261026_set_my_email.sql.
-- Drops only the two functions. profiles.email and its unique index belong to
-- 20261021_signup_email.sql (its own rollback drops them), and every email already saved
-- stays exactly where it is.

begin;

revoke all on function public.set_my_email(text) from public, anon, authenticated;
drop function if exists public.set_my_email(text);
revoke all on function public.my_email() from public, anon, authenticated;
drop function if exists public.my_email();

commit;
