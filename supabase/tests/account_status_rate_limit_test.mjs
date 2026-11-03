// PGlite check for 20261016_account_status_rate_limit.sql applied ON ITS OWN (the state the
// live project is in once it runs, before 20261026_account_status_hardening.sql), plus its
// rollback. rls_test.mjs only ever sees this migration with 20261026 stacked on top, so the
// standalone throttle (leftmost x-forwarded-for keying) was never exercised by itself.
// Added 2026-11-03 when it was applied live (tasks/2026-11-03-apply-rate-limit-migration.md).
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ex = (sql) => db.exec(sql);
const mig = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(true, m + ' -> ' + e.message.slice(0, 70)); } };

// Same minimal Supabase stand-ins as rls_test.mjs, including the default privileges a real
// project grants anon/authenticated on every new public table -- the thing the migration's
// `revoke all` has to beat.
await ex(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage; create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated; grant all on storage.objects to anon, authenticated;
create policy avatars_read on storage.objects for select using (bucket_id='avatars');
create policy avatars_write on storage.objects for insert with check (bucket_id='avatars');
create policy avatars_update on storage.objects for update using (bucket_id='avatars') with check (bucket_id='avatars');
create policy avatars_delete on storage.objects for delete using (bucket_id='avatars');
create table public.profiles(code text primary key, name text, username text, total_volume numeric not null default 0,
  workouts int not null default 0, prs int not null default 0, streak int not null default 0, consistency int not null default 0,
  badges int not null default 0, data jsonb not null default '{}', avatar_url text, backup jsonb, updated_at timestamptz not null default now());
create table public.friend_requests(id bigserial primary key, from_code text not null, to_code text not null, status text not null default 'pending', created_at timestamptz not null default now(), unique(from_code,to_code));
create table public.feedback(id bigserial primary key, username text, text text not null, status text not null default 'new', created_at timestamptz not null default now());
alter table public.profiles enable row level security; alter table public.friend_requests enable row level security; alter table public.feedback enable row level security;
create policy profiles_read on public.profiles for select using (true);
create policy profiles_write on public.profiles for insert with check (true);
create policy profiles_update on public.profiles for update using (true) with check (true);
create policy fr_read on public.friend_requests for select using (true);
create policy fr_write on public.friend_requests for insert with check (true);
create policy fr_update on public.friend_requests for update using (true) with check (true);
create policy fr_delete on public.friend_requests for delete using (true);
create policy fb_read on public.feedback for select using (true);
create policy fb_write on public.feedback for insert with check (true);
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await ex(mig('migrations/20260913_password_auth.sql'));
await ex(`insert into auth.users values ('00000000-0000-0000-0000-000000000001','owner@example.com');
          insert into public.profiles(code, user_id) values ('owner1','00000000-0000-0000-0000-000000000001'), ('free1', null);`);

await ex(mig('migrations/20261016_account_status_rate_limit.sql'));
await ex(mig('migrations/20261016_account_status_rate_limit.sql')); // "safe to re-run"
ok(true, 'migration applies, and applies twice');

const grants = await q(`select grantee, privilege_type from information_schema.role_table_grants
  where table_schema='public' and table_name='account_status_attempts' and grantee in ('anon','authenticated','PUBLIC')`);
ok(grants.length === 0, `no anon/authenticated grant on account_status_attempts (${JSON.stringify(grants)})`);
await ex(`set role anon`);
await expectErr(() => q(`select * from public.account_status_attempts`), 'anon cannot read the throttle table');
await expectErr(() => q(`delete from public.account_status_attempts`), 'anon cannot clear its own throttle row');

const call = async (code, xff) => {
  await ex(`select set_config('request.headers', '${xff === undefined ? '' : JSON.stringify({ 'x-forwarded-for': xff })}', false)`);
  return (await q(`select public.account_status($1) r`, [code]))[0].r;
};
const ipA = '198.51.100.7, 10.0.0.1', ipB = '203.0.113.9';
const a = [];
for (let i = 1; i <= 21; i++) a.push(await call('owner1', ipA));
ok(a[0].status === 'claimed' && a[0].email === 'owner@example.com', 'call 1: unchanged response shape for a claimed code');
ok(a.slice(0, 19).every(r => r.status === 'claimed'), 'calls 1-19 answer normally');
ok(a[19].status === 'rate_limited' && a[19].retry_after === 900, `call 20 trips the lock (${JSON.stringify(a[19])})`);
ok(a[20].status === 'rate_limited' && a[20].retry_after > 890, `call 21 is rate_limited (${JSON.stringify(a[20])})`);
ok(!('email' in a[20]), 'rate_limited response carries no email');
const b = await call('owner1', ipB);
ok(b.status === 'claimed', 'a different IP in the same window is unaffected');
ok((await call('free1', ipB)).status === 'unclaimed', 'unclaimed shape unchanged');
ok((await call('nope', ipB)).status === 'not_found', 'not_found shape unchanged');
ok((await call('nope', undefined)).status === 'not_found', 'no request.headers -> shared unknown bucket still answers');

await ex(`reset role`);
// Window expiry: a lock in the past and a stale window both reset to a fresh count.
await ex(`update public.account_status_attempts set locked_until = now() - interval '1 second', window_start = now() - interval '6 minutes' where ip = '198.51.100.7'`);
await ex(`set role anon`);
ok((await call('owner1', ipA)).status === 'claimed', 'after lock + window expire, IP A answers again');
await ex(`reset role`);
ok((await q(`select count from public.account_status_attempts where ip='198.51.100.7'`))[0].count === 1, 'expired window restarts count at 1');

// Rollback restores the exact pre-migration function and drops the table.
await ex(mig('rollback/20261016_account_status_rate_limit_down.sql'));
ok((await q(`select to_regclass('public.account_status_attempts') t`))[0].t === null, 'rollback drops account_status_attempts');
const lang = (await q(`select l.lanname, p.provolatile from pg_proc p join pg_language l on l.oid=p.prolang where p.proname='account_status'`))[0];
ok(lang.lanname === 'sql' && lang.provolatile === 's', 'rollback restores language sql STABLE function');
await ex(`set role anon`);
const r = [];
for (let i = 0; i < 25; i++) r.push(await call('owner1', ipA));
ok(r.every(x => x.status === 'claimed'), 'after rollback: unthrottled, anon can still call it');
await ex(`reset role`);
await ex(mig('migrations/20261016_account_status_rate_limit.sql'));
ok((await q(`select to_regclass('public.account_status_attempts') t`))[0].t !== null, 're-apply after rollback works');

console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
