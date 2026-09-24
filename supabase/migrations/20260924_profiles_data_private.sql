-- Audit gaps #1/#2 (2026-09-23): profiles.data (calendar days, recent workouts, per-set
-- workout detail, badge list) is world-readable with the public anon key. The `recent`
-- timestamps are enough to compute workout ids (w<epoch-ms>), i.e. the ownership proof
-- jacked-auth asks for, and `wd` publishes every exercise/set/rep/weight of the last month.
--
-- After this migration:
--   * signed-out callers can still read the leaderboard columns (name, username, stats,
--     avatar) -- the app's only signed-out reads are code/name lookups (login, username taken).
--   * nobody can SELECT profiles.data directly. friend_profiles() returns it only for
--     the caller's own row and for accepted friends.
--
-- !! ORDER MATTERS. Apply only AFTER the client that calls friend_profiles() (jacked-pwa
-- BUILD v1.10.0+) is live. The old client selects `data` straight from the table and would
-- get 42501, which blanks every friend's stats. v1.10.0 falls back to the direct select
-- when this function does not exist yet, so it is safe to ship BEFORE this migration.
-- Rollback: supabase/rollback/20260924_profiles_data_private_down.sql

create or replace function public.friend_profiles(p_codes text[])
returns table (
  code text, name text, username text, total_volume numeric, workouts integer, prs integer,
  streak integer, consistency integer, badges integer, avatar_url text, updated_at timestamptz,
  data jsonb
)
language sql stable security definer set search_path = public as $$
  with me as (select p.code from public.profiles p where p.user_id = auth.uid())
  select p.code, p.name, p.username, p.total_volume, p.workouts, p.prs, p.streak,
         p.consistency, p.badges, p.avatar_url, p.updated_at,
         case when p.user_id = auth.uid()
                or exists (select 1 from public.friend_requests fr, me
                            where fr.status = 'accepted'
                              and ((fr.from_code = me.code and fr.to_code = p.code)
                                or (fr.from_code = p.code and fr.to_code = me.code)))
              then p.data end as data
    from public.profiles p
   where auth.uid() is not null
     and p.code = any (p_codes[1:200]);
$$;
revoke all on function public.friend_profiles(text[]) from public, anon;
grant execute on function public.friend_profiles(text[]) to authenticated;

-- Column-level: drop the blanket SELECT, hand back everything except `data`.
revoke select on public.profiles from anon, authenticated;
grant select (code, name, username, total_volume, workouts, prs, streak, consistency,
              badges, avatar_url, user_id, updated_at)
  on public.profiles to anon, authenticated;
