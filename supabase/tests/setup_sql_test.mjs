// Weekly review #15 (2026-10-26): SUPABASE_SETUP.sql is now generated from setup_base.sql +
// every file in migrations/ (see regen_setup_sql.sh). This test proves the generated file
// actually reaches the real, current, locked-down schema when run top-to-bottom on a fresh
// project, AND that running it a SECOND time on an already-migrated project is a no-op --
// the literal claim the stale 2026-09 file broke ("re-running it would not reopen any
// table").
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (sql) => (await db.query(sql)).rows;
const ex = (sql) => db.exec(sql);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(true, m + ' -> ' + e.message.slice(0, 70)); } };
const as = async (role, uid) => { await ex(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`); };

// Minimal stand-ins for what a brand-new Supabase project already provides, same shape
// rls_test.mjs uses -- auth.users/auth.uid(), and enough of storage to take the bucket
// insert + avatar policies SUPABASE_SETUP.sql itself creates (NOT pre-created here, unlike
// rls_test.mjs's baseline, since the whole point is that THIS file creates them).
await ex(`
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`);

const setupSql = fs.readFileSync(new URL('../../jacked-pwa/SUPABASE_SETUP.sql', import.meta.url), 'utf8');
await ex(setupSql);
ok(true, 'generated SUPABASE_SETUP.sql applied end to end to a fresh project with no errors');

await q(`insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x')`);
await q(`update public.profiles set code='@mom' where false`);   // no-op, just confirms the column exists post-run
await q(`insert into public.profiles(code,name,username) values ('@mom','Mom','@mom'),('@dad','Dad','@dad')`);
await q(`update public.profiles set user_id='11111111-1111-1111-1111-111111111111' where code='@mom'`);

// The exact claim from the finding: a fresh project ends at the CURRENT locked-down
// schema, not the stale 2026-09 permissive one.
await as('anon');
ok((await q(`select count(*)::int c from profiles`))[0].c === 0, 'fresh project: anon cannot read profiles directly (20260925 lockdown reached, not the base using(true))');
await expectErr(() => q(`update profiles set name='x' where code='@mom'`), 'fresh project: anon cannot update profiles (base using(true) policy was superseded)');
await expectErr(() => q(`insert into friend_requests(from_code,to_code,status) values ('@dad','@mom','accepted')`), 'fresh project: anon cannot forge a friend request (base using(true)/with check(true) was superseded)');
await expectErr(() => q(`insert into storage.objects values ('avatars','@dad.jpg')`), 'fresh project: anon cannot write avatars (base no-role policy was superseded by 20260913)');
await ex('reset role');
ok((await q(`select count(*)::int c from information_schema.columns where table_name='profiles' and column_name='backup'`))[0].c === 0, 'fresh project: profiles.backup (base column) was dropped by 20260913, not left open');
ok((await q(`select account_status('@mom') s`))[0].s.status === 'claimed', 'fresh project: account_status (hardened version) works end to end');

// The literal #15 claim: running the WHOLE file a second time does not reopen anything.
await ex(setupSql);
ok(true, 'generated SUPABASE_SETUP.sql re-applied a second time with no errors');
await as('anon');
ok((await q(`select count(*)::int c from profiles`))[0].c === 0, 're-run: anon still cannot read profiles directly -- re-running did not reopen the table');
await expectErr(() => q(`update profiles set name='x' where code='@mom'`), 're-run: anon still cannot update profiles');
await expectErr(() => q(`insert into friend_requests(from_code,to_code,status) values ('@dad','@mom','accepted')`), 're-run: anon still cannot forge a friend request');
await expectErr(() => q(`insert into storage.objects values ('avatars','@dad.jpg')`), 're-run: anon still cannot write avatars');
await ex('reset role');
ok((await q(`select count(*)::int c from profiles where code='@mom'`))[0].c === 1, 're-run: existing data survived (no table was dropped/recreated)');

if (fails) { console.log(`\n${fails} FAILED`); process.exitCode = 1; } else console.log('\nALL PASS');
