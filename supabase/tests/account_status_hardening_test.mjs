// PGlite check for 20261026_account_status_hardening.sql applied on top of the exact state the
// live project was in on 2026-11-03: 20260913 password_auth + 20261016 rate limit (standalone,
// leftmost-XFF keying) + 20261021 signup_email (unthrottled account_status_by_email that hands
// back the sign-in email). rls_test.mjs only ever sees the full stack; this reproduces findings
// #13/#14 against the before-state, proves the migration closes both, and round-trips the
// rollback back to the before-state. Added 2026-11-03 when it was applied live
// (tasks/2026-11-03-apply-account-status-hardening-migration.md).
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
await ex(mig('migrations/20261021_signup_email.sql'));
await ex(`update public.profiles set email = 'Owner.Login@Example.com' where code = 'owner1'`);

const call = async (fn, arg, xff) => {
  await ex(`select set_config('request.headers', '${xff === undefined ? '' : JSON.stringify({ 'x-forwarded-for': xff })}', false)`);
  return (await q(`select public.${fn}($1) r`, [arg]))[0].r;
};
const keys = async () => (await q(`select ip from public.account_status_attempts order by ip`)).map(r => r.ip);
const clear = () => ex(`reset role; delete from public.account_status_attempts where ip is not null; set role anon`);
const REAL = '136.0.0.9';   // the address Supabase's edge appends (rightmost)

// ---- BEFORE: reproduce #14 and #13 against the live pre-migration functions ----
await ex(`set role anon`);
let r;
for (let i = 0; i < 25; i++) r = await call('account_status', 'owner1', `192.0.2.${i + 1}, ${REAL}`);
ok(r.status === 'claimed', 'before: rotating the spoofed leftmost entry never trips the throttle (#14 repro)');
await ex(`reset role`);
let k = await keys();
ok(k.length === 25 && !k.includes(REAL), 'before: every spoofed leftmost value got its own bucket, the real IP none');
await clear();
r = await call('account_status_by_email', 'owner.login@example.com', REAL);
ok(r.status === 'claimed' && r.email === 'owner@example.com', 'before: account_status_by_email hands back the sign-in email (#13 repro)');
for (let i = 0; i < 25; i++) r = await call('account_status_by_email', 'owner.login@example.com', REAL);
ok(r.status === 'claimed', 'before: account_status_by_email is unthrottled (#13 repro)');
await clear();

// ---- APPLY ----
await ex(`reset role`);
await ex(mig('migrations/20261026_account_status_hardening.sql'));
await ex(mig('migrations/20261026_account_status_hardening.sql')); // "safe to re-run"
ok(true, 'hardening migration applies on the live before-state, and applies twice');
await ex(`set role anon`);

// _client_ip(): rightmost entry, trimmed; junk/absent -> 'unknown'
const ip = async (xff) => {
  await ex(`select set_config('request.headers', '${xff === undefined ? '' : JSON.stringify({ 'x-forwarded-for': xff })}', false)`);
  return (await q(`select public._client_ip() r`))[0].r;
};
ok(await ip(`1.2.3.4, ${REAL}`) === REAL, '_client_ip reads the rightmost entry');
ok(await ip(`1.2.3.4,${REAL}`) === REAL, '_client_ip: no space after comma');
ok(await ip(`a, b ,  ${REAL}  `) === REAL, '_client_ip: three entries, padded');
ok(await ip(REAL) === REAL, '_client_ip: single entry');
ok(await ip(undefined) === 'unknown', '_client_ip: no headers -> unknown');
ok(await ip(`1.2.3.4, `) === 'unknown', '_client_ip: trailing empty entry -> unknown');
await ex(`select set_config('request.headers', 'not json', false)`);
ok((await q(`select public._client_ip() r`))[0].r === 'unknown', '_client_ip: malformed headers -> unknown, no error');

// #14 fixed: rotating the leftmost entry all lands in the REAL bucket and trips on call 20
const a = [];
for (let i = 0; i < 21; i++) a.push(await call('account_status', 'owner1', `192.0.2.${i + 1}, ${REAL}`));
ok(a.slice(0, 19).every(x => x.status === 'claimed' && x.email === 'owner@example.com'), 'after: calls 1-19 answer, account_status still returns email');
ok(a[19].status === 'rate_limited' && a[20].status === 'rate_limited', 'after: rotating spoofed leftmost entries trips the lock on call 20');
await ex(`reset role`);
k = await keys();
ok(JSON.stringify(k) === JSON.stringify([REAL]), `after: only the real (rightmost) IP has a bucket (${JSON.stringify(k)})`);
// victim lockout no longer possible: a victim's IP spoofed as leftmost never touches the victim's bucket
await clear();
for (let i = 0; i < 21; i++) await call('account_status', 'nope', `203.0.113.50, ${REAL}`);
ok((await call('account_status', 'owner1', '203.0.113.50')).status === 'claimed', 'after: spoofing a victim IP as leftmost cannot lock the victim out');
await clear();

// #13 fixed: email path throttled, shares the bucket, and drops email
r = await call('account_status_by_email', 'OWNER.login@example.com', REAL);
ok(r.status === 'claimed' && r.code === 'owner1' && !('email' in r), `after: by_email returns code only (${JSON.stringify(r)})`);
ok((await call('account_status_by_email', 'nobody@example.com', REAL)).status === 'not_found', 'after: by_email not_found');
for (let i = 0; i < 17; i++) await call('account_status_by_email', 'x@example.com', `192.0.2.${i}, ${REAL}`);
// 19 lookups used; one account_status call is the 20th -> one shared bucket
ok((await call('account_status', 'owner1', REAL)).status === 'rate_limited', 'after: by_email and account_status share one per-IP budget');
ok((await call('account_status_by_email', 'owner.login@example.com', REAL)).status === 'rate_limited', 'after: by_email itself is rate_limited once locked');
ok((await call('account_status_by_email', 'owner.login@example.com', '198.51.100.3')).status === 'claimed', 'after: a different real IP is unaffected');
await ex(`reset role`);
const acl = await q(`select proname, proacl::text a from pg_proc where proname in ('_client_ip','account_status','account_status_by_email') order by 1`);
ok(acl.length === 3 && acl.every(x => /anon=X/.test(x.a) && /authenticated=X/.test(x.a) && !/[{,]=X/.test(x.a)), `grants: anon+authenticated execute, no PUBLIC (${JSON.stringify(acl)})`);

// ---- ROLLBACK: back to the exact live before-state ----
await ex(mig('rollback/20261026_account_status_hardening_down.sql'));
ok((await q(`select to_regprocedure('public._client_ip()') t`))[0].t === null, 'rollback drops _client_ip');
const be = (await q(`select l.lanname, p.provolatile from pg_proc p join pg_language l on l.oid=p.prolang where p.proname='account_status_by_email'`))[0];
ok(be.lanname === 'sql' && be.provolatile === 's', 'rollback restores by_email as language sql STABLE (matches live before-state)');
await clear();
r = await call('account_status_by_email', 'owner.login@example.com', REAL);
ok(r.email === 'owner@example.com' && r.code === 'owner1', 'rollback: by_email shape back to before-state');
await call('account_status', 'owner1', `192.0.2.99, ${REAL}`);
await ex(`reset role`);
ok((await keys()).includes('192.0.2.99'), 'rollback: account_status back to leftmost keying');
await ex(mig('migrations/20261026_account_status_hardening.sql'));
ok((await q(`select to_regprocedure('public._client_ip()') t`))[0].t !== null, 're-apply after rollback works');

console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
