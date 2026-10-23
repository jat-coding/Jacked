-- Undo 20261016_account_status_rate_limit.sql: drops the per-IP throttle and restores
-- account_status() to the original unthrottled lookup from 20260913_password_auth.sql.
begin;

create or replace function public.account_status(p_code text)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select case when p.user_id is null then jsonb_build_object('status','unclaimed')
                 else jsonb_build_object('status','claimed','email',u.email) end
       from public.profiles p left join auth.users u on u.id = p.user_id
      where p.code = p_code),
    jsonb_build_object('status','not_found'));
$$;
revoke all on function public.account_status(text) from public;
grant execute on function public.account_status(text) to anon, authenticated;

drop table if exists public.account_status_attempts;

commit;
