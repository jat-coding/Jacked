-- Add or change the optional email on file from Profile -> Account, after sign-up
-- (Mr. Roni, 2026-10-26: "where is the location for adding your email to your account?"
-- then "Add an edit-email option to Jacked's Account settings? -> Yes, build it").
-- Task card: projects/Jacked/tasks/2026-10-26-edit-email-account-settings.md.
--
-- This is the user-typed profiles.email from 20261021_signup_email.sql, NOT the synthetic
-- auth.users email (<uuid>@users.jacked.example.com) the account actually signs in with --
-- that one is never touched here, so changing this email can never lock anyone out.
--
-- Same uniqueness rule sign-up enforces, not a weaker one: the real constraint is
-- 20261021's unique index on lower(email) where email is not null (case-insensitive, nulls
-- exempt). jacked-auth's register() pre-checks and answers 'email_taken'; set_my_email()
-- does the same pre-check AND catches the index's unique_violation (two accounts racing for
-- one address) as 'email_taken' too, never a 500. Same normalisation (trim + lowercase),
-- same shape check and 255-char cap as logic.ts normEmail()/EMAIL_RE.
--
-- profiles.email still has no client select/update grant (20261021's design): both
-- functions are SECURITY DEFINER and only ever read/write the caller's own row
-- (user_id = auth.uid()). Callable by `authenticated` only.
--
-- The column + index lines are 20261021's own, repeated idempotently so this file is safe
-- on a project where 20261021 was never applied. Safe to re-run.
-- NOT APPLIED AUTOMATICALLY: needs Mr. Roni's explicit go before it runs on the real
-- project (Supabase SQL editor). Rollback: supabase/rollback/20261026_set_my_email_down.sql.

begin;

alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email)) where email is not null;

-- The caller's own email on file (null = none yet), for the Account section to display.
create or replace function public.my_email()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_code text; v_email text;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_authenticated'); end if;
  select code, email into v_code, v_email from public.profiles where user_id = auth.uid();
  if v_code is null then return jsonb_build_object('status','no_profile'); end if;
  return jsonb_build_object('status','ok','email',v_email);
end $$;
revoke all on function public.my_email() from public;
grant execute on function public.my_email() to authenticated;

-- Add (first time) or change the caller's email on file.
create or replace function public.set_my_email(p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_new text := lower(regexp_replace(coalesce(p_email,''), '^\s+|\s+$', '', 'g'));
begin
  if auth.uid() is null then return jsonb_build_object('status','not_authenticated'); end if;
  if v_new = '' or length(v_new) > 255 or v_new !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('status','invalid_email');
  end if;
  select code into v_code from public.profiles where user_id = auth.uid() for update;
  if v_code is null then return jsonb_build_object('status','no_profile'); end if;
  if exists(select 1 from public.profiles
             where email is not null and lower(email) = v_new and code <> v_code) then
    return jsonb_build_object('status','email_taken');
  end if;
  begin
    update public.profiles set email = v_new where code = v_code;
  exception when unique_violation then
    return jsonb_build_object('status','email_taken');
  end;
  return jsonb_build_object('status','ok','email',v_new);
end $$;
revoke all on function public.set_my_email(text) from public;
grant execute on function public.set_my_email(text) to authenticated;

commit;
