import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ex = (sql) => db.exec(sql);
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(true, m + ' -> ' + e.message.slice(0, 70)); } };

// ── prod-like baseline ──
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
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
insert into public.profiles(code,name,username,backup) values
  ('@mom','Mom','@mom','{"jk_hist":[{"id":"w1"}]}'), ('@dad','Dad','@dad','{"jk_hist":[{"id":"w2"}]}'), ('@empty','E','@empty',null);
insert into public.friend_requests(from_code,to_code,status) values ('@mom','@dad','accepted'),('@dad','@empty','accepted');
insert into storage.objects values ('avatars','@mom.jpg');
`);
await ex(fs.readFileSync(new URL("../migrations/20260913_password_auth.sql", import.meta.url), 'utf8'));
ok(true, 'migration applied');
await ex(fs.readFileSync(new URL("../migrations/20261016_account_status_rate_limit.sql", import.meta.url), 'utf8'));
ok(true, 'rate-limit migration applied');
await ex(fs.readFileSync(new URL("../migrations/20261021_signup_email.sql", import.meta.url), 'utf8'));
ok(true, 'signup-email migration applied');
await ex(fs.readFileSync(new URL("../migrations/20260925_profiles_public_username_avatar_only.sql", import.meta.url), 'utf8'));
ok(true, 'friend-profile privacy migration applied');
await ex(fs.readFileSync(new URL("../migrations/20261026_friend_requests_lockdown.sql", import.meta.url), 'utf8'));
ok(true, 'friend-requests lockdown migration applied');

const as = async (role, uid) => { await ex(`reset role; select set_config('request.jwt.claim.sub', '${uid||''}', false); set role ${role};`); };
const MOM='11111111-1111-1111-1111-111111111111', DAD='22222222-2222-2222-2222-222222222222';

await ex('reset role');
ok((await q(`select count(*)::int c from profile_backups`))[0].c === 2, 'backups copied (2 non-null)');
ok((await q(`select count(*)::int c from information_schema.columns where table_name='profiles' and column_name='backup'`))[0].c === 0, 'profiles.backup dropped');
await ex(`update profiles set user_id='${MOM}' where code='@mom'`);  // simulate edge-function claim
ok((await q(`select count(*)::int c from profiles_history where op='pre_auth_migration'`))[0].c === 2, 'pre-migration snapshot of both legacy blobs');

// anon
await as('anon');
ok((await q(`select count(*)::int c from profiles`))[0].c === 0, 'anon reads 0 rows directly from profiles (20260925: row policy is to authenticated only)');
ok((await q(`select count(*)::int c from public_profiles(array['@mom','@dad','@empty'])`))[0].c === 3, 'anon reads the public username/avatar surface via public_profiles() instead');
await expectErr(() => q(`select * from profile_backups`), 'anon cannot read backups');
await expectErr(() => q(`update profiles set name='x' where code='@mom'`), 'anon cannot update profiles');
await expectErr(() => q(`insert into profiles(code) values ('@evil')`), 'anon cannot insert profiles');
await expectErr(() => q(`select * from friend_requests`), 'anon cannot read friend graph');
ok((await q(`select account_status('@mom') s`))[0].s.status === 'claimed', 'account_status claimed');
ok((await q(`select account_status('@dad') s`))[0].s.status === 'unclaimed', 'account_status unclaimed');
ok((await q(`select account_status('@nope') s`))[0].s.status === 'not_found', 'account_status not_found');

// account_status rate limit (20261016): per-IP, not per-code, so griefing a target's own
// lookups isn't possible to begin with — only the calling IP gets throttled.
await ex(`select set_config('request.headers', '{"x-forwarded-for":"9.9.9.1"}', false)`);
for (let i = 0; i < 19; i++) await q(`select account_status('@mom') s`);
ok((await q(`select account_status('@mom') s`))[0].s.status === 'rate_limited', '20th lookup from one IP throttled');
ok((await q(`select account_status('@mom') s`))[0].s.status === 'rate_limited', 'stays throttled on the next call too');
await ex(`select set_config('request.headers', '{"x-forwarded-for":"9.9.9.2"}', false)`);
ok((await q(`select account_status('@mom') s`))[0].s.status === 'claimed', 'a different IP is unaffected (owner can still look themselves up)');
await ex(`select set_config('request.headers', '', false)`);
ok((await q(`select account_status('@dad') s`))[0].s.status === 'unclaimed', 'no x-forwarded-for header still answers (shared "unknown" bucket)');

// Optional sign-up email (2026-10-21): still as anon -- it must NOT be able to set this
// column itself (register() writes it with the service role, bypassing RLS entirely).
await expectErr(() => q(`update profiles set email='x@y.com' where code='@mom'`), 'anon cannot set profiles.email directly (no column grant)');
// Simulate what the edge function's service role does: @mom is claimed (has user_id),
// so register() could have given it an email.
await ex('reset role');
await ex(`update profiles set email='Mom@Example.com' where code='@mom';`);
const momAuthEmail = (await q(`select email from auth.users where id='${MOM}'`))[0].email;
await as('anon');
ok((await q(`select account_status_by_email('mom@example.com') s`))[0].s.status === 'claimed', 'account_status_by_email is case-insensitive (anon-callable, like account_status)');
ok((await q(`select account_status_by_email('mom@example.com') s`))[0].s.email === momAuthEmail, 'account_status_by_email resolves to the account\'s real (synthetic) sign-in email');
ok((await q(`select account_status_by_email('nobody@example.com') s`))[0].s.status === 'not_found', 'account_status_by_email not_found');
await ex('reset role');
await expectErr(() => q(`insert into profiles(code,name,username,email) values ('@evil2','E2','@evil2','mom@example.com')`), 'two profiles cannot share the same email, case-insensitively');
await q(`insert into profiles(code,name,username) values ('@noemail1','N1','@noemail1'),('@noemail2','N2','@noemail2')`);
ok(true, 'two accounts with no email at all is not a collision (partial index)');
await as('anon');

await q(`insert into feedback(username,text) values ('@x','hi')`); ok(true, 'anon can send feedback');
await expectErr(() => q(`select * from feedback`), 'anon cannot read feedback');

await expectErr(() => q(`select * from profiles_history`), 'anon cannot read history');
// authenticated as DAD (no profile yet)
await as('authenticated', DAD);
ok((await q(`select * from profile_backups`)).length === 0, 'non-owner sees no backups');
ok((await q(`update profiles set name='hack' where code='@mom' returning code`)).length === 0, 'non-owner update of @mom affects 0 rows');
await expectErr(() => q(`update profile_backups set backup='{}' where code='@mom'`).then(r => { if (r.length === 0) throw new Error('0 rows (blocked)'); }), 'non-owner cannot write @mom backup');
await expectErr(() => q(`insert into profile_backups(code,backup) values ('@dad','{}')`), 'unclaimed @dad backup not writable by random user');
await expectErr(() => q(`insert into friend_requests(from_code,to_code) values ('@mom','@dad')`), 'cannot forge request from someone else');
await expectErr(() => q(`insert into storage.objects values ('avatars','@mom.jpg')`), 'cannot overwrite someone else avatar');

// authenticated as MOM (owner)
await as('authenticated', MOM);
ok((await q(`select backup from profile_backups where code='@mom'`)).length === 1, 'owner reads own backup');
ok((await q(`select backup from profile_backups`)).length === 1, 'owner sees only own backup');
const upd = await q(`update profile_backups set backup='{"jk_hist":[]}', updated_at=now() where code='@mom' and updated_at=updated_at returning code`);
ok(upd.length === 1, 'owner CAS-updates own backup');
await expectErr(() => q(`select * from profiles_history`), 'owner cannot read history via API');
await ex('reset role');
ok((await q(`select count(*)::int c from profiles_history where code='@mom' and op='update'`))[0].c === 1, 'changed backup archived');
await ex(`update profile_backups set updated_at=now() where code='@mom'`);
ok((await q(`select count(*)::int c from profiles_history where code='@mom' and op='update'`))[0].c === 1, 'no-op backup write not archived');
for (let i = 0; i < 35; i++) await ex(`update profile_backups set backup='{"jk_hist":[{"id":"v${i}"}]}' where code='@mom'`);
ok((await q(`select count(*)::int c from profiles_history where code='@mom' and op='update'`))[0].c === 30, 'rolling history capped at 30');
ok((await q(`select count(*)::int c from profiles_history where code='@mom' and op='pre_auth_migration'`))[0].c === 1, 'migration snapshot survives trimming');
ok((await q(`select backup from profiles_history where code='@mom' and op='update' order by id desc limit 1`))[0].backup.jk_hist[0].id === 'v33', 'newest archive is the previous version');
await as('authenticated', MOM);
ok((await q(`update profiles set name='Mom B', workouts=3, data='{"days":[]}' where code='@mom' returning code`)).length === 1, 'owner updates own stats');
await expectErr(() => q(`update profiles set user_id='${DAD}' where code='@mom'`), 'owner cannot reassign user_id');
await expectErr(() => q(`update profiles set code='@x' where code='@mom'`), 'owner cannot change code directly');
await expectErr(() => q(`delete from profiles where code='@mom'`), 'owner cannot delete profile row');
ok((await q(`select * from friend_requests`)).length === 1, 'mom sees only her friend requests');
// 20261026 lockdown: the sender is no longer a party who can transition status -- only
// the recipient (owns_code(to_code)) can, so mom updating her own mom->dad row now affects 0.
ok((await q(`update friend_requests set status='accepted' where from_code='@mom' returning id`)).length === 0, 'mom (sender, not recipient) can no longer flip her own request\'s status');
ok((await q(`delete from friend_requests where from_code='@dad' returning id`)).length === 0, 'mom cannot delete dad<->empty request');

// A forged insert that starts out already 'accepted' is rejected (fr_write now requires
// status='pending'); the real client-equivalent insert (status 'pending') still works.
await expectErr(() => q(`insert into friend_requests(from_code,to_code,status) values ('@mom','@empty','accepted')`), 'forged accepted insert is rejected');
await q(`insert into friend_requests(from_code,to_code,status) values ('@mom','@empty','pending')`); ok(true, 'mom can send a real (pending) request');
// Sender self-accepting her own pending request: RLS-blocked updates return 0 affected
// rows rather than throwing, so this is a row-count check, not expectErr.
ok((await q(`update friend_requests set status='accepted' where from_code='@mom' and to_code='@empty' returning id`)).length === 0, 'mom cannot self-accept her own pending request');
// Re-aiming from_code via UPDATE is rejected outright: the column grant only covers
// `status`, so this errors regardless of RLS or which rows the WHERE clause would match.
await expectErr(() => q(`update friend_requests set from_code='@dad' where from_code='@mom' and to_code='@empty'`), 're-aiming from_code via UPDATE is rejected (status is the only updatable column)');

await q(`insert into storage.objects values ('avatars','@mom.jpg')`); ok(true, 'mom writes own avatar');
ok((await q(`select rename_profile('@dad') r`))[0].r.status === 'taken', 'rename to taken');
ok((await q(`select rename_profile('BAD') r`))[0].r.status === 'invalid', 'rename invalid');
ok((await q(`select rename_profile('@mommy') r`))[0].r.status === 'ok', 'rename ok');
ok((await q(`select code from profile_backups`))[0].code === '@mommy', 'backup followed rename (cascade)');
ok((await q(`select count(*)::int c from friend_requests where from_code='@mommy'`))[0].c === 2, 'friend requests followed rename');
ok((await q(`select owns_code('@mommy') o`))[0].o === true, 'owns renamed code');

// A genuine RECIPIENT accepting a real pending request still works, and is_friend_of
// then returns true for both directions -- the fix narrows who can accept, it doesn't
// break accepting itself.
await ex('reset role');
const VIC='33333333-3333-3333-3333-333333333333';
await q(`insert into profiles(code,name,username,workouts,data) values ('@vic','Vic','@vic',9,'{"days":["x"]}')`);
await ex(`insert into auth.users values ('${VIC}','vic@x')`);
await ex(`update profiles set user_id='${VIC}' where code='@vic'`);
await as('authenticated', MOM); // code is now @mommy after the rename above
await q(`insert into friend_requests(from_code,to_code,status) values ('@mommy','@vic','pending')`); ok(true, 'mommy sends vic a real request');
await as('authenticated', VIC);
ok((await q(`update friend_requests set status='accepted' where from_code='@mommy' and to_code='@vic' returning id`)).length === 1, 'vic (the recipient) accepts the pending request');
ok((await q(`select is_friend_of('@mommy') f`))[0].f === true, 'vic sees mommy as an accepted friend');
await as('authenticated', MOM);
ok((await q(`select is_friend_of('@vic') f`))[0].f === true, 'mommy sees vic as an accepted friend back (accept works both directions)');

// A victim's full profile is still invisible to an attacker with only a forged or
// non-existent friendship -- no row from `profiles`, and no private field from
// friend_profiles() either.
await as('authenticated', DAD);
ok((await q(`select * from profiles where code='@vic'`)).length === 0, 'attacker with no real friendship reads 0 rows of the victim\'s profile');
ok((await q(`select data from friend_profiles(array['@vic'])`))[0].data === null, 'friend_profiles hands a non-friend no private data for the victim');

await ex('reset role');
ok((await q(`select count(*)::int c from profiles_history where code='@mom'`))[0].c === 0 && (await q(`select count(*)::int c from profiles_history where code='@mommy'`))[0].c === 31, 'history follows rename');
await as('authenticated', MOM);

await as('authenticated', DAD);
ok((await q(`select rename_profile('@dadx') r`))[0].r.status === 'no_profile', 'rename without profile');
await ex('reset role');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
