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
