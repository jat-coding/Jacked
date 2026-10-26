-- Friend-requests lockdown: close the forced-friendship hole (weekly project review
-- 2026-10-25, findings #1 and #2; Fable second-opinion review
-- artifacts/fable/decision-20261026-000820-1611336.md, which amended and is authoritative
-- over the agent's original plan).
--
-- Before: fr_write (20260913_password_auth.sql:111-112) only checked owns_code(from_code)
-- on INSERT, with no restriction on status or to_code. fr_update (20260913:113-115) let
-- EITHER party change status, in both USING and WITH CHECK, and SUPABASE_SETUP.sql's
-- project-default grant hands `authenticated` UPDATE on every column of friend_requests
-- (20260913:118 only revokes anon's grant). Any signed-in user could therefore:
--   insert into friend_requests(from_code,to_code,status) values (<me>,<victim>,'accepted')
-- or insert a pending request naming themselves on both ends, then UPDATE from_code to
-- re-aim an already-"theirs" row at a victim before accepting it. Either way,
-- is_friend_of(<victim>) (20260925_profiles_public_username_avatar_only.sql) then returns
-- true, which unlocks the victim's private profile/stats/calendar through profiles_read
-- and friend_profiles(). Finding #2 (legacy-account takeover) chains off this same hole to
-- read a victim's recent-workout timestamps and rebuild the jacked-auth ownership proof.
--
-- After:
--   * INSERT still requires owns_code(from_code), and now ALSO requires status='pending' --
--     nobody can insert a request that starts out already 'accepted'.
--   * UPDATE's column grant is narrowed to `status` only -- from_code/to_code can never be
--     changed by a client UPDATE statement, no matter what RLS allows. (rename_profile,
--     the one legitimate code rewrite, runs as the function owner and bypasses grants to
--     `authenticated` entirely, so it is unaffected.)
--   * UPDATE's USING requires owns_code(to_code) only (not from_code any more), and WITH
--     CHECK additionally pins the transition to status='accepted'. Only the RECIPIENT of a
--     request can transition it, and only to accepted -- the sender can no longer
--     self-accept, and the recipient can't use UPDATE to set any other status (declining
--     stays a DELETE, policy fr_delete, which this migration does not touch).
--   * Two table CHECK constraints bound the domain: from_code <> to_code (can't friend
--     yourself), and status in ('pending','accepted') (no other value is a valid row).
-- fr_read and fr_delete (20260913:109-110, 116-117) are left exactly as they are -- both
-- parties still need to see the request and to delete/unfriend from either side.
--
-- Deliberately NOT touched here: whether profiles.email is exposed to an accepted friend
-- (real or forged). That depends on which of 20260924's column grant or 20260925's row
-- policy is actually live, which this migration does not change either way -- see the
-- accompanying research doc for the live-project read-only check and its confidence level.
--
-- NOT APPLIED AUTOMATICALLY. Needs Mr. Roni's explicit go before it is run on the real
-- project (Supabase SQL editor). Safe to re-run. Rollback:
-- supabase/rollback/20261026_friend_requests_lockdown_down.sql.
-- Requires 20260913_password_auth.sql (public.owns_code, the friend_requests table and
-- its fr_* policies).

begin;

-- ── bound the domain ────────────────────────────────────────────────────────
do $$ begin
  alter table public.friend_requests
    add constraint friend_requests_from_ne_to check (from_code <> to_code);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.friend_requests
    add constraint friend_requests_status_check check (status in ('pending','accepted'));
exception when duplicate_object then null;
end $$;

-- ── freeze from_code/to_code on UPDATE: status is the only updatable column ─
revoke update on public.friend_requests from authenticated;
grant update (status) on public.friend_requests to authenticated;

-- ── insert must start pending; update must be the recipient accepting ──────
drop policy if exists fr_write  on public.friend_requests;
drop policy if exists fr_update on public.friend_requests;
create policy fr_write  on public.friend_requests for insert to authenticated
  with check (public.owns_code(from_code) and status = 'pending');
create policy fr_update on public.friend_requests for update to authenticated
  using (public.owns_code(to_code))
  with check (public.owns_code(to_code) and status = 'accepted');

commit;
