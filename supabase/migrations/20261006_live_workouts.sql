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
