// In-memory Postgres (PGlite) check of 20261026_set_my_email.sql + its rollback: add an email
// for the first time, change it, the same case-insensitive uniqueness sign-up enforces,
// shape validation, own-row only, and that rollback leaves saved emails intact.
// Never touches the real Supabase project.
// Run: copy supabase/ next to a node_modules with @electric-sql/pglite (ESM ignores NODE_PATH), then
//   node supabase/tests/set_my_email_test.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ex = (sql) => db.exec(sql);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m, re) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(!re || re.test(e.message), m + ' -> ' + e.message.slice(0, 80)); } };
const mig = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// Prod-like baseline: same as live_workouts_test.mjs / rls_test.mjs.
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
insert into auth.users values ('11111111-1111-1111-1111-111111111111','u1@users.jacked.example.com'),
  ('22222222-2222-2222-2222-222222222222','u2@users.jacked.example.com'),
  ('33333333-3333-3333-3333-333333333333','u3@users.jacked.example.com');
insert into public.profiles(code,name,username) values ('@mom','Mom','@mom'), ('@dad','Dad','@dad');
`);
await ex(mig('migrations/20260913_password_auth.sql'));
const MOM = '11111111-1111-1111-1111-111111111111', DAD = '22222222-2222-2222-2222-222222222222', NOPROF = '33333333-3333-3333-3333-333333333333';
await ex(`update profiles set user_id='${MOM}' where code='@mom'; update profiles set user_id='${DAD}' where code='@dad';`);
await ex(mig('migrations/20261021_signup_email.sql'));
// @dad signed up WITH an email (stored lowercased, as jacked-auth's normEmail does); @mom without.
await ex(`update profiles set email='dad@example.com' where code='@dad';`);
await ex(mig('migrations/20261026_set_my_email.sql'));
await ex(mig('migrations/20261026_set_my_email.sql'));
ok(true, 'migration applies, and re-applies cleanly');

const as = async (role, uid) => { await ex(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`); };
const call = async (sql, params) => (await q(sql, params))[0].r;
const emailOf = async code => { await ex('reset role'); return (await q(`select email from profiles where code=$1`, [code]))[0].email; };

await as('anon');
await expectErr(() => q(`select public.set_my_email('x@y.co')`), 'anon cannot call set_my_email', /permission denied/);
await expectErr(() => q(`select public.my_email()`), 'anon cannot call my_email', /permission denied/);

await as('authenticated', '');
ok((await call(`select public.set_my_email('x@y.co') r`)).status === 'not_authenticated', 'no auth.uid() -> not_authenticated');
await as('authenticated', NOPROF);
ok((await call(`select public.set_my_email('x@y.co') r`)).status === 'no_profile', 'signed-in user with no profile row -> no_profile');

// First-time add: @mom has no email at all today.
await as('authenticated', MOM);
let r = await call(`select public.my_email() r`);
ok(r.status === 'ok' && r.email === null, 'my_email: account with no email on file -> ok, email null');
for (const bad of ['', '   ', 'not-an-email', 'a@b', 'a b@c.com', '@x.com', 'x'.repeat(250) + '@e.com']) {
  r = await call(`select public.set_my_email($1) r`, [bad]);
  ok(r.status === 'invalid_email', `invalid_email for ${JSON.stringify(bad.length > 20 ? bad.slice(0, 12) + '...(' + bad.length + ' chars)' : bad)}`);
}
ok((await emailOf('@mom')) === null, 'rejected attempts wrote nothing');
await as('authenticated', MOM);
r = await call(`select public.set_my_email($1) r`, ['  Mom@Example.COM ']);
ok(r.status === 'ok' && r.email === 'mom@example.com', 'first-time add: ok, trimmed + lowercased like sign-up');
ok((await emailOf('@mom')) === 'mom@example.com', 'first-time add: really written to profiles.email');
await as('authenticated', MOM);
ok((await call(`select public.my_email() r`)).email === 'mom@example.com', 'my_email reads it back');
ok((await call(`select public.set_my_email('mom@example.com') r`)).status === 'ok', 're-saving your own current email is ok (not email_taken)');

// Uniqueness: identical rule to sign-up (case-insensitive, other accounts only).
r = await call(`select public.set_my_email('DAD@example.com') r`);
ok(r.status === 'email_taken', "taking another account's email (different case) -> email_taken");
ok((await emailOf('@mom')) === 'mom@example.com' && (await emailOf('@dad')) === 'dad@example.com', 'email_taken changed neither row');

// Change: @dad moves to a new address; the old one is freed for others.
await as('authenticated', DAD);
r = await call(`select public.set_my_email('dad2@example.com') r`);
ok(r.status === 'ok' && (await emailOf('@dad')) === 'dad2@example.com', 'change an existing email: ok and written');
await as('authenticated', MOM);
ok((await call(`select public.set_my_email('dad@example.com') r`)).status === 'ok', 'the old address is free once its owner changed away from it');
ok((await emailOf('@mom')) === 'dad@example.com', '...and is now on @mom');
ok((await emailOf('@dad')) === 'dad2@example.com', "own-row only: @mom's call never touched @dad");

// Race backstop: if a conflicting row lands between the pre-check and the UPDATE, the unique
// index raises unique_violation and the function's handler turns it into email_taken. Force
// that path by hiding the pre-check: a trigger that inserts the colliding email on another
// row just before @mom's update runs.
await ex('reset role');
await ex(`create function public._race() returns trigger language plpgsql as $$ begin
  update public.profiles set email = 'race@example.com' where code = '@dad'; return new; end $$;
  create trigger _race before update of email on public.profiles for each row when (old.code = '@mom') execute function public._race();`);
await as('authenticated', MOM);
r = await call(`select public.set_my_email('race@example.com') r`);
ok(r.status === 'email_taken', 'race: unique_violation from the index comes back as email_taken, not an error');
await ex('reset role');
await ex(`drop trigger _race on public.profiles; drop function public._race();`);
ok((await emailOf('@mom')) === 'dad@example.com', 'race: the losing update was rolled back (email unchanged)');
await ex(`update profiles set email='dad2@example.com' where code='@dad'`);

// Login by the new email resolves to the right account (account_status_by_email).
await as('anon');
r = await call(`select public.account_status_by_email('Dad2@Example.com') r`);
ok(r.status === 'claimed' && r.code === '@dad', 'login-by-email finds the account under its changed email');

// Rollback: functions gone, saved emails untouched, re-apply works.
await ex('reset role');
await ex(mig('rollback/20261026_set_my_email_down.sql'));
ok((await q(`select count(*)::int c from pg_proc where proname in ('set_my_email','my_email')`))[0].c === 0, 'rollback drops both functions');
ok((await emailOf('@dad')) === 'dad2@example.com' && (await emailOf('@mom')) === 'dad@example.com', 'rollback keeps every saved email');
ok((await q(`select count(*)::int c from pg_indexes where indexname='profiles_email_lower_uidx'`))[0].c === 1, "rollback leaves 20261021's unique index alone");
await ex(mig('migrations/20261026_set_my_email.sql'));
await as('authenticated', MOM);
ok((await call(`select public.my_email() r`)).email === 'dad@example.com', 're-applied after rollback: works again');

// Self-contained: applies on a project that never ran 20261021 (column + index created).
const db2 = new PGlite();
await db2.exec(`create role anon nologin; create role authenticated nologin;
create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.profiles(code text primary key, user_id uuid unique);`);
await db2.exec(mig('migrations/20261026_set_my_email.sql'));
ok((await db2.query(`select count(*)::int c from pg_indexes where indexname='profiles_email_lower_uidx'`)).rows[0].c === 1, 'applies cleanly without 20261021 (adds email column + unique index itself)');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
