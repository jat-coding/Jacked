# Cloud backup of `profiles.backup` — proposal (2026-09-13)

**Status: proposal, not implemented. Dad + Jack to decide.**

## The gap

Every user's complete database is one JSONB column, `profiles.backup`, overwritten in
place on every sync. There is no history table, no versioning, no undo — and on the
Supabase **Free** plan there are no platform backups either (Pro has 7-day daily
backups; PITR is a paid add-on).

What protects the data today:

1. **Merge-safe writes** (v1.5, hardened v1.8): every client does GET → union-merge →
   watermark-CAS. A client can *add* to the blob; it can't blindly replace it. Deletes
   are tombstones (`jk_deleted`).
2. **Full copies on every device**: phone localStorage, Galaxy watch Room mirror,
   Apple Watch LocalStore. A corrupted/emptied cloud row is re-populated by the next
   device pull (a union).

The failure these don't cover: a client writes a *valid-looking but wrong* blob and
every device pulls it before anyone notices. Low probability, total cost.

## Options

### A. In-database history via trigger — **recommended first step**

Zero external infrastructure, restore is one SQL statement, invisible to clients.
Keeps the last 30 distinct versions per account (jsonb `IS DISTINCT FROM` is
semantic, so no-op writes don't archive). RLS is enabled with **no policies**, so the
public anon key cannot read or write the history table; the trigger runs as
`security definer` so it can. Also archives on row delete (username change deletes
the old row).

Storage: worst case ~400 KB/blob × 30 versions × heavy users → tens of MB for the
current user base, well inside the 500 MB Free limit. Lower the `limit 30` if needed.

Paste into the Supabase SQL editor:

```sql
create table if not exists public.profiles_history (
  id           bigserial primary key,
  code         text        not null,
  op           text        not null,             -- 'update' | 'delete'
  backup       jsonb,
  updated_at   timestamptz,                      -- the archived row's own watermark
  archived_at  timestamptz not null default now()
);
create index if not exists profiles_history_code_idx
  on public.profiles_history (code, archived_at desc);

-- Locked: no policies → anon/authenticated roles get nothing. Only the dashboard/SQL
-- editor (postgres role) can read it.
alter table public.profiles_history enable row level security;

create or replace function public.archive_profile_backup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'delete', old.backup, old.updated_at);
    return old;
  end if;
  if old.backup is distinct from new.backup then
    insert into public.profiles_history (code, op, backup, updated_at)
      values (old.code, 'update', old.backup, old.updated_at);
    -- keep the newest 30 per account
    delete from public.profiles_history h
     where h.code = old.code
       and h.id not in (select id from public.profiles_history
                         where code = old.code
                         order by archived_at desc limit 30);
  end if;
  return new;
end
$$;

drop trigger if exists profiles_archive_backup on public.profiles;
create trigger profiles_archive_backup
  before update or delete on public.profiles
  for each row execute function public.archive_profile_backup();
```

Restore one account to its previous version (SQL editor, after eyeballing the row):

```sql
-- what's available
select id, op, updated_at, archived_at,
       jsonb_array_length(coalesce(backup->'jk_hist','[]'::jsonb)) as workouts
  from public.profiles_history where code = '@dad' order by archived_at desc;

-- roll back to a specific archived version (replace 123)
update public.profiles
   set backup = (select backup from public.profiles_history where id = 123),
       updated_at = now()
 where code = '@dad';
```

After a restore, every device's next pull is a union with its local copy, so a device
holding the *bad* data would re-merge it back in — do the restore while the offending
device is offline, or wipe/re-login that device first.

### B. Off-site snapshot in git (defence in depth, can be added later)

A scheduled GitHub Action that GETs every `profiles` row nightly and commits it, so git
history gives per-night rollback and survives a Supabase project loss. Two constraints:

- `jat-coding/Jacked` is **public** (required for Netlify CD on Free). Plain-JSON
  snapshots there would publish everyone's workout history. So either:
  - **B1.** encrypt each snapshot with an `age` public key before committing (private
    key kept in a password manager, shared Dad/Jack; no repo secrets or admin rights
    needed), or
  - **B2.** a **private** `jat-coding/jacked-backups` repo that the Action pushes to via
    a deploy key (readable per-account diffs; needs Jack to create the repo + key).
- GitHub pauses scheduled workflows on repos with no activity for 60 days; the snapshot
  commits themselves count as activity in B2, not in B1 if nothing changed. Add a
  `workflow_dispatch` and check it occasionally.

### C. Supabase Pro ($25/mo)

Daily platform backups, 7-day retention. Covers project-level disasters but restoring
one user's row from a full-database backup is awkward. Only worth it if the project
needs Pro for other reasons.

## Recommendation

**Do A now** (five minutes in the SQL editor, nothing else changes). Add B1 or B2 when
there's appetite for an off-site copy. Dad's wear-agent can write the Action for either
B variant on request; A needs Jack's SQL console.
