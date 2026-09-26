-- Undo 20260925_profiles_public_username_avatar_only.sql (profiles world-readable again).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to public using (true);
drop function if exists public.public_profiles(text[]);
drop function if exists public.friend_profiles(text[]);
drop function if exists public.is_friend_of(text);
