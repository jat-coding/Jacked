-- ============================================================
-- Jacked — full Supabase setup (base schema + every migration)
-- ============================================================
-- GENERATED FILE (weekly review #15, 2026-10-26) -- do not hand-edit. It had drifted since
-- 2026-09 (unauthed, permissive policies) while every migration under supabase/migrations/
-- since then locked the real project down; re-running the stale version would have
-- reopened every table those migrations fixed.
--
-- To change the schema: edit supabase/setup_base.sql (base tables/bucket) or add a new file
-- under supabase/migrations/ (any later change), then run supabase/regen_setup_sql.sh to
-- rebuild this file. Every migration here drops-then-recreates any policy/function it
-- changes and gates its DDL with IF NOT EXISTS/OR REPLACE, so re-running the regenerated
-- file end to end — on a brand-new project OR an already-migrated one — always lands on
-- the exact same final schema. It cannot reopen a table a later migration locked down.
--
-- 1. Brand-new project: SQL Editor → New query → paste ALL of this → Run.
-- 2. In index.html, fill in SUPABASE_URL and SUPABASE_ANON_KEY
--    (Project Settings → API → Project URL and the "anon public" key).
-- ============================================================

-- Original from-scratch bootstrap (pre-auth, 2026-09 vintage): the base tables, indexes,
-- storage bucket and permissive no-auth policies every migration in supabase/migrations/
-- builds on top of with ALTER/DROP POLICY + CREATE POLICY. Hand-edit this file only for the
-- base shape (new base table, new bucket); a policy or column change that supersedes
-- something here belongs in a new migration instead, same as always. After either kind of
-- edit, run supabase/regen_setup_sql.sh to rebuild jacked-pwa/SUPABASE_SETUP.sql.

-- Public profile + cached leaderboard stats, one row per friend code.
create table if not exists public.profiles (
  code         text primary key,
  name         text,
  username     text,
  total_volume numeric    not null default 0,   -- canonical kilograms
  workouts     integer    not null default 0,
  prs          integer    not null default 0,
  streak       integer    not null default 0,
  consistency  integer    not null default 0,
  badges       integer    not null default 0,      -- v0.6: earned achievement count
  data         jsonb      not null default '{}'::jsonb, -- v0.6: {days:[], recent:[]}
  updated_at   timestamptz not null default now()
);

-- v0.6 migration for EXISTING projects (safe to run repeatedly):
alter table public.profiles add column if not exists badges integer not null default 0;
alter table public.profiles add column if not exists data   jsonb   not null default '{}'::jsonb;

-- v0.16: full per-account cloud backup so data follows you across devices.
-- Holds the same bundle as the Export feature (all jk_* keys). Username-keyed,
-- still no auth — anyone with your username can read/overwrite it. Casual use only.
-- (Superseded by 20260913_password_auth.sql, which moves this to profile_backups and
-- drops this column -- kept here only because a fresh project applies this file first.)
alter table public.profiles add column if not exists backup jsonb;

-- Friend requests / friendships. status: 'pending' | 'accepted'.
create table if not exists public.friend_requests (
  id         bigint generated always as identity primary key,
  from_code  text not null,
  to_code    text not null,
  status     text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (from_code, to_code)
);

create index if not exists friend_requests_from_idx on public.friend_requests (from_code);
create index if not exists friend_requests_to_idx   on public.friend_requests (to_code);

-- Row Level Security: enabled, with permissive policies (no auth at this point in time).
-- Every later migration drops and recreates these once real auth lands -- see
-- 20260913_password_auth.sql onward -- so running this base file alone is never the final
-- state on an already-migrated project; see regen_setup_sql.sh.
alter table public.profiles        enable row level security;
alter table public.friend_requests enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_write  on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles        for select using (true);
create policy profiles_write  on public.profiles        for insert with check (true);
create policy profiles_update on public.profiles        for update using (true) with check (true);

drop policy if exists fr_read   on public.friend_requests;
drop policy if exists fr_write  on public.friend_requests;
drop policy if exists fr_update on public.friend_requests;
drop policy if exists fr_delete on public.friend_requests;
create policy fr_read   on public.friend_requests for select using (true);
create policy fr_write  on public.friend_requests for insert with check (true);
create policy fr_update on public.friend_requests for update using (true) with check (true);
create policy fr_delete on public.friend_requests for delete using (true);

-- v1.0: realtime friend updates. Add friend_requests to the realtime publication
-- so adding/accepting a friend pushes to both devices instantly (the app also
-- polls every 25s as a fallback, so this is optional but recommended).
-- Safe to run repeatedly; ignore the "already member" notice if it appears.
do $$
begin
  begin
    alter publication supabase_realtime add table public.friend_requests;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================
-- v1.1: profile pictures
-- ============================================================
-- The image itself lives in Storage; the profiles row only holds its URL, so
-- the frequent stats sync stays a few KB.
alter table public.profiles add column if not exists avatar_url text;

-- Public bucket: avatars are meant to be visible to friends. The client
-- downscales to a 256px JPEG (~15 KB) and writes to "<username>.jpg".
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Same no-auth model as the rest of this app at this point in time: the anon key may
-- read/write any avatar. Locked down to authenticated owners by 20260913_password_auth.sql.
drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_write  on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_read   on storage.objects for select using (bucket_id='avatars');
create policy avatars_write  on storage.objects for insert with check (bucket_id='avatars');
create policy avatars_update on storage.objects for update using (bucket_id='avatars') with check (bucket_id='avatars');
create policy avatars_delete on storage.objects for delete using (bucket_id='avatars');

-- v0.11: in-app feedback (comments from users).
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  username   text,
  text       text not null,
  status     text not null default 'new',   -- 'new' | 'added' | 'wontfix'
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists fb_read  on public.feedback;
drop policy if exists fb_write on public.feedback;
create policy fb_read  on public.feedback for select using (true);
create policy fb_write on public.feedback for insert with check (true);

-- ============================================================
-- 20260913_password_auth.sql
-- ============================================================
-- Password auth + lockdown.
-- Before: anon key could read every account's full backup and overwrite any row.
-- After: identity = auth.users via profiles.user_id; backups are owner-only;
-- profile rows are publicly readable (leaderboard stats) but only the owner can
-- write them. Accounts are created/claimed only by the `jacked-auth` edge
-- function (service role), which is what enforces the claim proof.
-- Apply in the same release as the matching PWA build: old clients can no
-- longer sync once this lands (their writes fail closed, nothing is erased).
-- Also ships CLOUD_BACKUP_PROPOSAL.md option A (version history), re-targeted from
-- profiles.backup to profile_backups, plus a permanent pre-migration snapshot.

begin;

-- ── identity ────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create or replace function public.owns_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists(select 1 from public.profiles where code = p_code and user_id = auth.uid());
$$;
revoke all on function public.owns_code(text) from public;
grant execute on function public.owns_code(text) to anon, authenticated;

-- ── backups move to an owner-only table ─────────────────────────────────────
create table if not exists public.profile_backups (
  code       text primary key references public.profiles(code) on update cascade on delete cascade,
  backup     jsonb,
  updated_at timestamptz not null default now()
);
insert into public.profile_backups(code, backup, updated_at)
  select code, backup, updated_at from public.profiles where backup is not null
  on conflict (code) do nothing;
-- ── backup history (proposal option A) ─────────────────────────────────────
-- No policies + revoked grants: only the dashboard / service role can read it.
create table if not exists public.profiles_history (
  id          bigserial primary key,
  code        text        not null,
  op          text        not null,   -- 'update' | 'delete' | 'pre_auth_migration'
  backup      jsonb,
  updated_at  timestamptz,            -- the archived row's own watermark
  archived_at timestamptz not null default now()
);
create index if not exists profiles_history_code_idx on public.profiles_history (code, id desc);
alter table public.profiles_history enable row level security;
revoke all on public.profiles_history from anon, authenticated;
revoke all on sequence public.profiles_history_id_seq from anon, authenticated;

-- Permanent copy of every legacy blob, taken before the column is dropped.
insert into public.profiles_history (code, op, backup, updated_at)
  select code, 'pre_auth_migration', backup, updated_at from public.profiles where backup is not null;

create or replace function public.archive_profile_backup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'delete', old.backup, old.updated_at);
    return old;
  end if;
  if old.backup is distinct from new.backup then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'update', old.backup, old.updated_at);
    -- keep the newest 30 rolling versions per account; the migration snapshot is never trimmed
    delete from public.profiles_history h
     where h.code = old.code and h.op in ('update','delete')
       and h.id not in (select id from public.profiles_history
                         where code = old.code and op in ('update','delete')
                         order by id desc limit 30);
  end if;
  return new;
end $$;
revoke all on function public.archive_profile_backup() from public;
drop trigger if exists profile_backups_archive on public.profile_backups;
create trigger profile_backups_archive
  before update or delete on public.profile_backups
  for each row execute function public.archive_profile_backup();

alter table public.profiles drop column if exists backup;

alter table public.profile_backups enable row level security;
revoke all on public.profile_backups from anon, authenticated;
grant select, insert, update on public.profile_backups to authenticated;
drop policy if exists pb_read   on public.profile_backups;
drop policy if exists pb_insert on public.profile_backups;
drop policy if exists pb_update on public.profile_backups;
create policy pb_read   on public.profile_backups for select to authenticated using (public.owns_code(code));
create policy pb_insert on public.profile_backups for insert to authenticated with check (public.owns_code(code));
create policy pb_update on public.profile_backups for update to authenticated using (public.owns_code(code)) with check (public.owns_code(code));

-- ── profiles: public read, owner-only update of non-identity columns ────────
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_write  on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, username, total_volume, workouts, prs, streak, consistency, badges, data, avatar_url, updated_at)
  on public.profiles to authenticated;

-- ── friend requests: participants only ──────────────────────────────────────
drop policy if exists fr_read   on public.friend_requests;
drop policy if exists fr_write  on public.friend_requests;
drop policy if exists fr_update on public.friend_requests;
drop policy if exists fr_delete on public.friend_requests;
create policy fr_read   on public.friend_requests for select to authenticated
  using (public.owns_code(from_code) or public.owns_code(to_code));
create policy fr_write  on public.friend_requests for insert to authenticated
  with check (public.owns_code(from_code));
create policy fr_update on public.friend_requests for update to authenticated
  using (public.owns_code(from_code) or public.owns_code(to_code))
  with check (public.owns_code(from_code) or public.owns_code(to_code));
create policy fr_delete on public.friend_requests for delete to authenticated
  using (public.owns_code(from_code) or public.owns_code(to_code));
revoke all on public.friend_requests from anon;

-- ── feedback: anyone may send, nobody may read it back through the API ──────
drop policy if exists fb_read on public.feedback;
revoke select, update, delete on public.feedback from anon, authenticated;

-- ── avatars: public read, only the owner writes <code>.jpg ─────────────────
drop policy if exists avatars_write  on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_write  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.owns_code(regexp_replace(name, '\.jpg$', '')));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.owns_code(regexp_replace(name, '\.jpg$', '')))
  with check (bucket_id = 'avatars' and public.owns_code(regexp_replace(name, '\.jpg$', '')));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.owns_code(regexp_replace(name, '\.jpg$', '')));

-- ── RPCs ────────────────────────────────────────────────────────────────────
-- Login needs the (synthetic, never-mailed) auth email for a username.
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

-- Username change: re-key atomically (backups follow via ON UPDATE CASCADE).
create or replace function public.rename_profile(p_new text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if auth.uid() is null then return jsonb_build_object('status','not_authenticated'); end if;
  if p_new !~ '^@[a-z0-9_]{3,20}$' then return jsonb_build_object('status','invalid'); end if;
  select code into v_old from public.profiles where user_id = auth.uid() for update;
  if v_old is null then return jsonb_build_object('status','no_profile'); end if;
  if v_old = p_new then return jsonb_build_object('status','ok'); end if;
  if exists(select 1 from public.profiles where code = p_new) then
    return jsonb_build_object('status','taken');
  end if;
  update public.profiles set code = p_new, username = p_new where code = v_old;
  update public.friend_requests set from_code = p_new where from_code = v_old;
  update public.friend_requests set to_code   = p_new where to_code   = v_old;
  update public.profiles_history set code = p_new where code = v_old;
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.rename_profile(text) from public;
grant execute on function public.rename_profile(text) to authenticated;

commit;

-- ============================================================
-- 20260914_revoke_rpc_execute.sql
-- ============================================================
-- Supabase grants EXECUTE to anon/authenticated by default; the trigger function
-- is never meant to be called over the API, and renames need a signed-in user.
revoke execute on function public.archive_profile_backup() from anon, authenticated;
revoke execute on function public.rename_profile(text) from anon;

-- ============================================================
-- 20260921_backup_history_daily.sql
-- ============================================================
-- Backup history: one restore point per day, newest 14 kept (was: one per SAVE, newest 30).
--
-- Why: the app pushes a full backup ~3s after every change, and the old trigger archived the
-- previous copy on every one of those pushes. 30 rolling versions therefore covered only the
-- last few active hours -- useless as a "go back" point -- while storing 30 full copies of
-- every user's data. Now the first push each day archives the copy as it stood before it
-- (a real end-of-yesterday restore point), later pushes that day archive nothing, and 14 days
-- are kept. Deleting a backup row is still always archived. The permanent
-- 'pre_auth_migration' snapshot is never touched.
--
-- Not applied automatically. Run in the Supabase SQL editor; it is safe to re-run.

create or replace function public.archive_profile_backup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'delete', old.backup, old.updated_at);
    return old;
  end if;
  if old.backup is not null and old.backup is distinct from new.backup
     and not exists (select 1 from public.profiles_history h
                      where h.code = old.code and h.op = 'update'
                        and h.archived_at > now() - interval '20 hours') then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'update', old.backup, old.updated_at);
    delete from public.profiles_history h
     where h.code = old.code and h.op in ('update','delete')
       and h.id not in (select id from public.profiles_history
                         where code = old.code and op in ('update','delete')
                         order by id desc limit 14);
  end if;
  return new;
end $$;
revoke all on function public.archive_profile_backup() from public;

-- One-off: trim what the old trigger already piled up to the same 14.
delete from public.profiles_history h
 where h.op in ('update','delete')
   and h.id not in (select id from (
         select id, row_number() over (partition by code order by id desc) rn
           from public.profiles_history where op in ('update','delete')) x
        where x.rn <= 14);

-- ============================================================
-- 20260924_profiles_data_private.sql
-- ============================================================
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

-- ============================================================
-- 20260925_profiles_public_username_avatar_only.sql
-- ============================================================
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

-- ============================================================
-- 20261006_live_workouts.sql
-- ============================================================
-- Live shared workout (phone <-> watch), rollout step 1: the server record.
-- Mr. Roni's design (watch-client/BOARD.md c9bd1dc + c7d9f25) on Phil's schema proposal (f775c3a).
-- Wire contract for the `doc` column (ids, change stamps, tombstones, merge rule): WATCH_BRIDGE.md A17.
--
-- One row per account holding the workout in progress. Transient: NOT part of the backup blob,
-- NOT archived (no history trigger); a finished/discarded row is simply replaced by the next Start.
-- Writes are compare-and-swap on `rev` (UPDATE ... WHERE code = X AND rev = N SET rev = N+1; zero
-- rows = someone wrote first: re-read, merge, retry). The guard trigger below makes that
-- non-optional for anything that changes the workout itself.
-- The watch's live heart rate / calories go in hr/kcal/stats_at WITHOUT touching rev, so live
-- stats never conflict with set edits.
--
-- NOT APPLIED AUTOMATICALLY. Needs Mr. Roni's explicit go before it is run on the real project
-- (Supabase SQL editor). Safe to re-run. Rollback: supabase/rollback/20261006_live_workouts_down.sql.
-- Requires 20260913_password_auth.sql (public.owns_code).

begin;

create table if not exists public.live_workouts (
  code        text primary key references public.profiles(code) on update cascade on delete cascade,
  session_id  text        not null,                 -- minted at Start; becomes the workout's id in jk_hist
  status      text        not null default 'active' check (status in ('active','finished','discarded')),
  doc         jsonb       not null,                 -- the in-progress workout (`aw` + ids/stamps/tombstones)
  rev         bigint      not null default 1 check (rev >= 1),
  updated_at  timestamptz not null default now(),
  updated_by  text,                                 -- device id: 'phone-…' | 'wear-…' | 'watchos-…'
  hr          int,
  kcal        int,
  stats_at    timestamptz
);

-- Server-side half of the CAS: any change to the workout (doc/status/session) must advance rev by
-- exactly one from the row it read; a live-stats-only write keeps rev as is. updated_at is the
-- server's clock, so "is this active row abandoned?" never depends on a device clock.
create or replace function public.live_workouts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.doc, new.status, new.session_id) is distinct from (old.doc, old.status, old.session_id) then
      if new.rev <> old.rev + 1 then
        raise exception 'live_workouts: stale write (row is at rev %, write carried rev %)', old.rev, new.rev
          using errcode = '40001';
      end if;
    elsif new.rev <> old.rev then
      raise exception 'live_workouts: rev changed without a workout change' using errcode = '40001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.live_workouts_guard() from public;
drop trigger if exists live_workouts_guard on public.live_workouts;
create trigger live_workouts_guard
  before insert or update on public.live_workouts
  for each row execute function public.live_workouts_guard();

-- Owner-only, same shape as profile_backups (20260913_password_auth.sql), plus delete.
alter table public.live_workouts enable row level security;
revoke all on public.live_workouts from anon, authenticated;
grant select, insert, update, delete on public.live_workouts to authenticated;
drop policy if exists lw_read   on public.live_workouts;
drop policy if exists lw_insert on public.live_workouts;
drop policy if exists lw_update on public.live_workouts;
drop policy if exists lw_delete on public.live_workouts;
create policy lw_read   on public.live_workouts for select to authenticated using (public.owns_code(code));
create policy lw_insert on public.live_workouts for insert to authenticated with check (public.owns_code(code));
create policy lw_update on public.live_workouts for update to authenticated using (public.owns_code(code)) with check (public.owns_code(code));
create policy lw_delete on public.live_workouts for delete to authenticated using (public.owns_code(code));

-- Realtime: the phone subscribes (filter code=eq.<me>); Realtime applies the select policy above,
-- so nobody receives another account's changes. Guarded so a re-run (or a project without the
-- publication) is a no-op instead of an error.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_workouts') then
    alter publication supabase_realtime add table public.live_workouts;
  end if;
end $$;

commit;

-- ============================================================
-- 20261016_account_status_rate_limit.sql
-- ============================================================
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

-- ============================================================
-- 20261021_signup_email.sql
-- ============================================================
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

-- ============================================================
-- 20261026_account_status_hardening.sql
-- ============================================================
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

-- ============================================================
-- 20261026_friend_requests_lockdown.sql
-- ============================================================
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
