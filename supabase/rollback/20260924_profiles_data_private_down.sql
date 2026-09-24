-- Undo 20260924_profiles_data_private.sql (restores the world-readable `data` column).
grant select on public.profiles to anon, authenticated;
drop function if exists public.friend_profiles(text[]);
