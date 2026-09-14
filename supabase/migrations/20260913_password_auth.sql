-- Password auth + lockdown.
-- Before: anon key could read every account's full backup and overwrite any row.
-- After: identity = auth.users via profiles.user_id; backups are owner-only;
-- profile rows are publicly readable (leaderboard stats) but only the owner can
-- write them. Accounts are created/claimed only by the `jacked-auth` edge
-- function (service role), which is what enforces the claim proof.
-- Apply in the same release as the matching PWA build: old clients can no
-- longer sync once this lands (their writes fail closed, nothing is erased).

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
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.rename_profile(text) from public;
grant execute on function public.rename_profile(text) to authenticated;

commit;
