-- Emergency undo for 20260913_password_auth.sql: puts backups back on
-- profiles.backup (latest owner-written version) and restores the old open
-- policies, so the pre-auth PWA build syncs again. Auth users and
-- profiles_history are left in place (harmless, and history is the safety net).
begin;

alter table public.profiles add column if not exists backup jsonb;
update public.profiles p set backup = b.backup from public.profile_backups b where b.code = p.code;

drop trigger if exists profile_backups_archive on public.profile_backups;
drop table if exists public.profile_backups;
drop function if exists public.archive_profile_backup();
drop function if exists public.rename_profile(text);
drop function if exists public.account_status(text);

drop policy if exists profiles_update on public.profiles;
create policy profiles_write  on public.profiles for insert with check (true);
create policy profiles_update on public.profiles for update using (true) with check (true);
grant select, insert, update, delete on public.profiles to anon, authenticated;

drop policy if exists fr_read   on public.friend_requests;
drop policy if exists fr_write  on public.friend_requests;
drop policy if exists fr_update on public.friend_requests;
drop policy if exists fr_delete on public.friend_requests;
create policy fr_read   on public.friend_requests for select using (true);
create policy fr_write  on public.friend_requests for insert with check (true);
create policy fr_update on public.friend_requests for update using (true) with check (true);
create policy fr_delete on public.friend_requests for delete using (true);
grant select, insert, update, delete on public.friend_requests to anon, authenticated;

create policy fb_read on public.feedback for select using (true);
grant select, update, delete on public.feedback to anon, authenticated;

drop policy if exists avatars_write  on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_write  on storage.objects for insert with check (bucket_id = 'avatars');
create policy avatars_update on storage.objects for update using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
create policy avatars_delete on storage.objects for delete using (bucket_id = 'avatars');

drop function if exists public.owns_code(text);
alter table public.profiles drop column if exists user_id;

commit;
