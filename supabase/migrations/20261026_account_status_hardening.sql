-- Hardens account_status_by_email (20261021) and fixes the IP both throttled functions key
-- on (20261016). Weekly review 2026-10-25/26, findings #13 and #14.
--
-- #13: account_status_by_email had none of 20261016's per-IP throttle, and handed back the
-- account's real sign-in email on a plain anon, unauthenticated call -- the exact oracle
-- 20261016 closed on the username side, reopened from the email side, with the username
-- added on top. Fix: the same throttle (same table, same 20/5min-then-15min-lock budget),
-- and the 'claimed' response no longer carries email at all (code only) -- only
-- account_status(code) ever hands the sign-in email back now. cloudLogin()'s email-login
-- path makes a second, equally throttled, call to account_status(code) to get it, the same
-- round trip the username-login path already made.
--
-- #14: both functions keyed their throttle on split_part(x-forwarded-for,',',1) -- the
-- LEFTMOST entry, which is whatever the client itself sent. A real proxy chain APPENDS the
-- address it actually saw onto the end of an existing header, never the front, so the
-- leftmost entry is attacker-controlled: change it every request and the throttle never
-- trips, or send a victim's IP there and the victim's own bucket takes the 15-minute lock.
-- Fix: key on the RIGHTMOST entry instead, via one shared helper so both functions (and any
-- later one) read the header the same way.
--
-- NOT APPLIED AUTOMATICALLY. Needs Mr. Roni's explicit go before it runs on the real
-- project (Supabase SQL editor). Safe to re-run. Rollback:
-- supabase/rollback/20261026_account_status_hardening_down.sql.

begin;

-- The IP determination account_status (20261016) inlined, fixed, and shared so
-- account_status_by_email reads the header exactly the same way.
create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare
  v_headers text := current_setting('request.headers', true);
begin
  if v_headers is null or v_headers = '' then return 'unknown'; end if;
  return coalesce(
    nullif(trim(regexp_replace(v_headers::json->>'x-forwarded-for', '^.*,\s*', '')), ''),
    'unknown');
exception when others then return 'unknown';
end;
$$;
revoke all on function public._client_ip() from public;
grant execute on function public._client_ip() to anon, authenticated;

create or replace function public.account_status(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_ip text := public._client_ip();
  r public.account_status_attempts;
begin
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

-- account_status_by_email: same throttle bucket/table as account_status (one IP, one shared
-- budget across both lookup paths), but the 'claimed' response drops email -- an attacker
-- scanning a harvested email list can no longer resolve straight to a working sign-in email
-- from this call alone.
create or replace function public.account_status_by_email(p_email text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_ip text := public._client_ip();
  r public.account_status_attempts;
begin
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
    (select jsonb_build_object('status', 'claimed', 'code', p.code)
       from public.profiles p
       join auth.users u on u.id = p.user_id
      where p.email is not null and lower(p.email) = lower(p_email)),
    jsonb_build_object('status','not_found'));
end;
$$;
revoke all on function public.account_status_by_email(text) from public;
grant execute on function public.account_status_by_email(text) to anon, authenticated;

commit;
