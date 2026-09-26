-- Mr. Roni, 2026-09-25 (topic 620): the only publicly visible profile fields are USERNAME and
-- AVATAR. Name, volume, workouts, PRs, streak, consistency, badges, updated_at and `data`
-- (calendar, recent workouts, per-set detail, badge list) are visible only to the owner and
-- to ACCEPTED friends. Supersedes 20260924_profiles_data_private.sql (column-level, left
-- name + stats public); apply THIS one instead, never both.
--
-- Row-level, not column-level, on purpose: the owner and accepted friends keep the full
-- row, so a signed-in client that already selects stat columns from `profiles` (the
-- watch's "cheap poll", carrying its access token) keeps working with no change. A
-- column-level revoke would fail every such request with 42501 even for the owner.
--
-- After this migration:
--   * profiles SELECT: own row + accepted friends' rows. Everyone else, and every signed-out
--     caller, gets zero rows (not an error).
--   * public_profiles(codes) -> (code, username, avatar_url) for anyone, signed in or not.
--     This is the only stranger-readable surface. Capped at 200 codes per call.
--   * friend_profiles(codes) -> every requested row; full for me + accepted friends, and
--     code/username/avatar_url only for pending, sent and strangers (rest is NULL).
--
-- !! ORDER MATTERS. Apply only AFTER the client that calls public_profiles() (jacked-pwa
-- BUILD v1.10.29+) is live AND the watch owners have confirmed their poll sends the
-- access token (watch-client/WATCH_BRIDGE.md item A14). Older clients that read `profiles`
-- for a stranger (username-taken check, add-friend lookup) would get zero rows.
-- Rollback: supabase/rollback/20260925_profiles_public_username_avatar_only_down.sql

-- Is p_code an accepted friend of the signed-in caller? SECURITY DEFINER so the check does
-- not recurse through profiles' own policy.
create or replace function public.is_friend_of(p_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.friend_requests fr
      join public.profiles me on me.user_id = auth.uid()
     where auth.uid() is not null
       and fr.status = 'accepted'
       and ((fr.from_code = me.code and fr.to_code = p_code)
         or (fr.from_code = p_code and fr.to_code = me.code))
  );
$$;
revoke all on function public.is_friend_of(text) from public, anon;
grant execute on function public.is_friend_of(text) to authenticated;

-- The stranger-readable surface: username + avatar, nothing else.
create or replace function public.public_profiles(p_codes text[])
returns table (code text, username text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.code, p.username, p.avatar_url
    from public.profiles p
   where p.code = any (p_codes[1:200]);
$$;
revoke all on function public.public_profiles(text[]) from public;
grant execute on function public.public_profiles(text[]) to anon, authenticated;

-- Same signature as the 20260924 draft, so a client on v1.10.0+ needs no change; the
-- difference is that pending / sent / stranger rows now come back stripped.
create or replace function public.friend_profiles(p_codes text[])
returns table (
  code text, name text, username text, total_volume numeric, workouts integer, prs integer,
  streak integer, consistency integer, badges integer, avatar_url text, updated_at timestamptz,
  data jsonb
)
language sql stable security definer set search_path = public as $$
  select p.code, s.name, p.username, s.total_volume, s.workouts, s.prs, s.streak,
         s.consistency, s.badges, p.avatar_url, s.updated_at, s.data
    from public.profiles p
    left join lateral (
      select p.name, p.total_volume, p.workouts, p.prs, p.streak, p.consistency, p.badges,
             p.updated_at, p.data
       where p.user_id = auth.uid() or public.is_friend_of(p.code)
    ) s on true
   where auth.uid() is not null
     and p.code = any (p_codes[1:200]);
$$;
revoke all on function public.friend_profiles(text[]) from public, anon;
grant execute on function public.friend_profiles(text[]) to authenticated;

-- The lock: rows visible to the owner and accepted friends only. Grants stay as they are.
drop policy if exists profiles_read on public.profiles;
-- `to authenticated` only: with no policy for anon, signed-out callers get zero rows and the
-- policy functions never need an anon EXECUTE grant.
create policy profiles_read on public.profiles for select to authenticated
  using (public.owns_code(code) or public.is_friend_of(code));
