-- ============================================================
-- Jacked — Supabase setup for friends + leaderboard
-- ============================================================
-- 1. In your Supabase project: SQL Editor → New query → paste ALL of this → Run.
-- 2. In index.html, fill in SUPABASE_URL and SUPABASE_ANON_KEY
--    (Project Settings → API → Project URL and the "anon public" key).
--
-- Identity is the user's unique @username, stored in the `code` primary-key
-- column (so the DB enforces uniqueness). There is NO auth, so the
-- policies below allow the anonymous key to read/write. That suits this casual
-- app, but it means anyone with your anon key can read/modify these two tables.
-- Do not store anything sensitive here.
-- ============================================================

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

-- Row Level Security: enabled, with permissive policies (no auth in this app).
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

-- Same no-auth model as the rest of this app: the anon key may read/write any
-- avatar. That means anyone with the key can overwrite someone else's picture.
-- Acceptable for a casual friends app; revisit when real auth lands.
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
