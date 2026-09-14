-- Supabase grants EXECUTE to anon/authenticated by default; the trigger function
-- is never meant to be called over the API, and renames need a signed-in user.
revoke execute on function public.archive_profile_backup() from anon, authenticated;
revoke execute on function public.rename_profile(text) from anon;
