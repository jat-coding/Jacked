-- Undo 20261006_live_workouts.sql. The table only ever holds the workout in progress (finished
-- workouts live in each account's backup blob), so dropping it loses at most a session that is
-- open right now; phone builds before v1.10.72 never read it, and v1.10.72+ treat a missing
-- table as offline (they keep working locally and finish as before).
begin;
do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_workouts') then
    alter publication supabase_realtime drop table public.live_workouts;
  end if;
end $$;
drop table if exists public.live_workouts;   -- drops its policies and trigger with it
drop function if exists public.live_workouts_guard();
commit;
