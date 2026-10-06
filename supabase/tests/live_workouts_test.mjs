// In-memory Postgres (PGlite) check of 20261006_live_workouts.sql + its rollback: owner-only RLS,
// the rev compare-and-swap, the stale-write guard, the stats-only write, the realtime publication.
// Never touches the real Supabase project.
// Run: copy supabase/ next to a node_modules with @electric-sql/pglite (ESM ignores NODE_PATH), then
//   node supabase/tests/live_workouts_test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ex = (sql) => db.exec(sql);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m, re) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(!re || re.test(e.message), m + ' -> ' + e.message.slice(0, 80)); } };
const mig = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// Prod-like baseline: just enough for 20260913_password_auth.sql to apply (same as rls_test.mjs).
await ex(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage; create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
create table public.profiles(code text primary key, name text, username text, total_volume numeric not null default 0,
  workouts int not null default 0, prs int not null default 0, streak int not null default 0, consistency int not null default 0,
  badges int not null default 0, data jsonb not null default '{}', avatar_url text, backup jsonb, updated_at timestamptz not null default now());
create table public.friend_requests(id bigserial primary key, from_code text not null, to_code text not null, status text not null default 'pending', created_at timestamptz not null default now(), unique(from_code,to_code));
create table public.feedback(id bigserial primary key, username text, text text not null, status text not null default 'new', created_at timestamptz not null default now());
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
create publication supabase_realtime;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
insert into public.profiles(code,name,username) values ('@mom','Mom','@mom'), ('@dad','Dad','@dad');
`);
await ex(mig('migrations/20260913_password_auth.sql'));
const MOM = '11111111-1111-1111-1111-111111111111', DAD = '22222222-2222-2222-2222-222222222222';
await ex(`update profiles set user_id='${MOM}' where code='@mom'; update profiles set user_id='${DAD}' where code='@dad';`);
await ex(mig('migrations/20261006_live_workouts.sql'));
await ex(mig('migrations/20261006_live_workouts.sql'));
ok(true, 'migration applies, and re-applies cleanly');
ok((await q(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='live_workouts'`))[0].c === 1, 'live_workouts is in supabase_realtime (once)');
ok((await q(`select relrowsecurity r from pg_class where relname='live_workouts'`))[0].r === true, 'RLS enabled');

const as = async (role, uid) => { await ex(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`); };
const doc = n => JSON.stringify({ id: 'w1', exercises: [], n });

await as('anon');
await expectErr(() => q(`select * from live_workouts`), 'anon cannot read live_workouts');
await expectErr(() => q(`insert into live_workouts(code,session_id,doc) values ('@mom','w1','{}')`), 'anon cannot insert');

await as('authenticated', MOM);
await q(`insert into live_workouts(code,session_id,status,doc,rev,updated_by) values ('@mom','w1','active',$1,1,'phone-a')`, [doc(1)]);
ok((await q(`select count(*)::int c from live_workouts`))[0].c === 1, 'owner inserts and reads own row');
await expectErr(() => q(`insert into live_workouts(code,session_id,doc) values ('@mom','w2','{}')`), 'one row per account (second insert = unique violation)', /duplicate key/);
await expectErr(() => q(`insert into live_workouts(code,session_id,doc) values ('@dad','w9','{}')`), 'cannot insert a row for another account', /row-level security/);
await expectErr(() => q(`update live_workouts set status='done', rev=2 where code='@mom'`), 'status limited to active/finished/discarded', /check constraint/);

// CAS: the app's write is UPDATE ... WHERE rev = N SET rev = N+1.
let r = await q(`update live_workouts set doc=$1, rev=2 where code='@mom' and rev=1 returning rev`, [doc(2)]);
ok(r.length === 1 && Number(r[0].rev) === 2, 'CAS with the current rev lands (rev 1 -> 2)');
r = await q(`update live_workouts set doc=$1, rev=2 where code='@mom' and rev=1 returning rev`, [doc(3)]);
ok(r.length === 0, 'CAS with a stale rev changes zero rows (writer must re-read + merge)');
await expectErr(() => q(`update live_workouts set doc=$1 where code='@mom'`, [doc(4)]), 'guard: a workout change that does not advance rev is refused', /stale write/);
await expectErr(() => q(`update live_workouts set doc=$1, rev=7 where code='@mom'`, [doc(4)]), 'guard: a rev jump (not +1) is refused', /stale write/);
await q(`update live_workouts set hr=128, kcal=240, stats_at=now() where code='@mom'`);
ok((await q(`select rev::int r, hr from live_workouts where code='@mom'`))[0].r === 2, 'live-stats write (hr/kcal) without touching rev is allowed');
await expectErr(() => q(`update live_workouts set hr=129, rev=3 where code='@mom'`), 'guard: rev cannot move on a stats-only write', /rev changed/);
r = await q(`update live_workouts set status='finished', doc=$1, rev=3 where code='@mom' and rev=2 returning status`, [doc(5)]);
ok(r.length === 1 && r[0].status === 'finished', 'Finish = CAS status->finished');
const t0 = (await q(`select updated_at from live_workouts where code='@mom'`))[0].updated_at;
await q(`update live_workouts set updated_at='2000-01-01', hr=1 where code='@mom'`);
ok((await q(`select updated_at from live_workouts where code='@mom'`))[0].updated_at >= t0, 'updated_at is the server clock (client value ignored)');

await as('authenticated', DAD);
ok((await q(`select count(*)::int c from live_workouts`))[0].c === 0, "another account sees none of @mom's row");
r = await q(`update live_workouts set doc='{}', rev=4 where code='@mom' and rev=3 returning rev`);
ok(r.length === 0, "another account cannot update @mom's row");
r = await q(`delete from live_workouts where code='@mom' returning code`);
ok(r.length === 0, "another account cannot delete @mom's row");

// Username change cascades (rename_profile re-keys profiles.code).
await as('authenticated', MOM);
await q(`select rename_profile('@mom2')`);
ok((await q(`select count(*)::int c from live_workouts where code='@mom2'`))[0].c === 1, 'row follows a username change (on update cascade)');
r = await q(`delete from live_workouts where code='@mom2' returning code`);
ok(r.length === 1, 'owner can delete own row');

await ex('reset role');
await ex(mig('rollback/20261006_live_workouts_down.sql'));
ok((await q(`select count(*)::int c from pg_class where relname='live_workouts'`))[0].c === 0
  && (await q(`select count(*)::int c from pg_publication_tables where tablename='live_workouts'`))[0].c === 0, 'rollback drops the table and its publication membership');
await ex(mig('migrations/20261006_live_workouts.sql'));
ok(true, 'migration re-applies after rollback');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
