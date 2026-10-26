-- Undo 20261026_account_status_hardening.sql: restores account_status() and
-- account_status_by_email() to their 20261016/20261021 definitions (left-most XFF entry,
-- email included in account_status_by_email's response, no shared IP helper).
begin;

create or replace function public.account_status(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_ip text := 'unknown';
  r public.account_status_attempts;
begin
  if v_headers is not null and v_headers <> '' then
    v_ip := coalesce(nullif(split_part(v_headers::json->>'x-forwarded-for', ',', 1), ''), 'unknown');
  end if;

  select * into r from public.account_status_attempts where ip = v_ip for update;

  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('status', 'rate_limited', 'retry_after', extract(epoch from r.locked_until - now())::int);
  end if;

  if r.ip is null or now() - r.window_start > interval '5 minutes' then
    insert into public.account_status_attempts(ip, count, window_start, locked_until)
      values (v_ip, 1, now(), null)
      on conflict (ip) do update set count = 1, window_start = now(), locked_until = null;
  else
    update public.account_status_attempts
       set count = r.count + 1,
           locked_until = case when r.count + 1 >= 20 then now() + interval '15 minutes' else null end
     where ip = v_ip;
    if r.count + 1 >= 20 then
      return jsonb_build_object('status', 'rate_limited', 'retry_after', 900);
    end if;
  end if;

  return coalesce(
    (select case when p.user_id is null then jsonb_build_object('status','unclaimed')
                 else jsonb_build_object('status','claimed','email',u.email) end
       from public.profiles p left join auth.users u on u.id = p.user_id
      where p.code = p_code),
    jsonb_build_object('status','not_found'));
end;
$$;
revoke all on function public.account_status(text) from public;
grant execute on function public.account_status(text) to anon, authenticated;

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

revoke all on function public._client_ip() from public, anon, authenticated;
drop function if exists public._client_ip();

commit;
