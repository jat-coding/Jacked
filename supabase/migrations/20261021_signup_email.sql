-- Optional user-supplied email at sign-up, so the same account can log in with
-- either its username or this email (Mr. Roni, 2026-10-21 voice memo + follow-up
-- tap confirm). Nullable so every existing account is unaffected.
--
-- Not to be confused with the per-account SYNTHETIC email auth.users already
-- carries (<uuid>@users.jacked.example.com, set in jacked-auth/logic.ts register()
-- and never mailed -- it only exists so Supabase Auth has an `email` column to
-- sign in with). This is a second, real, user-typed address with its own column.
--
-- Column is select-restricted the same way the rest of profiles is (20260924's
-- column grant list and/or 20260925's row policy, whichever is actually live --
-- `email` is in neither, by design): the client only ever reaches it through the
-- SECURITY DEFINER functions below, which bypass RLS and apply their own check.
-- No direct `select`/`update` grant on profiles.email is added here.
--
-- Rollback: supabase/rollback/20261021_signup_email_down.sql

begin;

alter table public.profiles add column if not exists email text;

-- Case-insensitive uniqueness, but only among rows that have one -- an email is
-- optional, so many accounts legitimately share "no email" (null).
create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email)) where email is not null;

-- Email-keyed counterpart to account_status(): resolves a user-typed email to
-- the account's synthetic sign-in email, for cloudLogin()'s "username or email"
-- field. No 'unclaimed' case here (unlike account_status): a profile only ever
-- gets a user-supplied email via register(), which always creates the auth user
-- first -- so any row with email set already has user_id set too.
create or replace function public.account_status_by_email(p_email text)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select jsonb_build_object('status', 'claimed', 'email', u.email, 'code', p.code)
       from public.profiles p
       join auth.users u on u.id = p.user_id
      where p.email is not null and lower(p.email) = lower(p_email)),
    jsonb_build_object('status', 'not_found'));
$$;
revoke all on function public.account_status_by_email(text) from public;
grant execute on function public.account_status_by_email(text) to anon, authenticated;

commit;
