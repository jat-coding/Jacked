-- Brute-force/bot audit (research/jacked-bruteforce-audit-result-2026-10-16.md), topic: the
-- IG reel on credential-stuffing defense ("10,000 bots hammering your login API").
--
-- account_status(p_code) is the one real gap found: granted to anon with zero throttling at
-- any layer, and for a claimed code it hands back the account's real sign-in email straight
-- from a bare username guess — a free, instant oracle an attacker would chain into
-- signInWithPassword. (public_profiles/friend_profiles were already checked: username+avatar
-- are *intentionally* public per 20260925, no new exposure there. jacked-auth's claim path
-- already fails closed on a 'proof' of real workout history, size-of-guess-space analysed and
-- left alone — see the result doc. Password verification itself is Supabase GoTrue's own
-- hosted endpoint, outside this repo; nothing here can add a check in front of it.)
--
-- Deliberately keyed by caller IP, not by the code being looked up: locking out the *code*
-- would let anyone grief a known target by spamming lookups of their username, denying them
-- the very email their own next real sign-in needs — the exact lockout-as-DoS failure mode
-- the reel itself warns about. Per-IP means a scanning caller gets throttled while the real
-- owner, calling from their own device/IP, is unaffected.
--
-- IP comes from PostgREST's `request.headers` GUC (x-forwarded-for, set by Supabase's edge,
-- not attacker-controlled); outside a PostgREST request (direct psql, this file's own test)
-- there is no such setting and every caller shares one 'unknown' bucket, same as today.
--
-- NOT APPLIED AUTOMATICALLY. Needs Mr. Roni's explicit go before it is run on the real
-- project (Supabase SQL editor). Safe to re-run. Rollback:
-- supabase/rollback/20261016_account_status_rate_limit_down.sql.

begin;

create table if not exists public.account_status_attempts (
  ip           text primary key,
  count        int not null default 1,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);
revoke all on public.account_status_attempts from public, anon, authenticated;

-- 20 lookups per rolling 5 minutes per IP, then a flat 15-minute lock on *that IP only*.
-- plpgsql (was sql) because it now writes the throttle row before answering.
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

commit;
