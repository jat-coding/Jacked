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

const as = async (role, uid) => { await ex(`reset role; select set_config('request.jwt.claim.sub', '${uid||''}', false); set role ${role};`); };
const MOM='11111111-1111-1111-1111-111111111111', DAD='22222222-2222-2222-2222-222222222222';

await ex('reset role');
ok((await q(`select count(*)::int c from profile_backups`))[0].c === 2, 'backups copied (2 non-null)');
ok((await q(`select count(*)::int c from information_schema.columns where table_name='profiles' and column_name='backup'`))[0].c === 0, 'profiles.backup dropped');
await ex(`update profiles set user_id='${MOM}' where code='@mom'`);  // simulate edge-function claim

// anon
await as('anon');
ok((await q(`select count(*)::int c from profiles`))[0].c === 3, 'anon can read public profile rows');
await expectErr(() => q(`select * from profile_backups`), 'anon cannot read backups');
await expectErr(() => q(`update profiles set name='x' where code='@mom'`), 'anon cannot update profiles');
await expectErr(() => q(`insert into profiles(code) values ('@evil')`), 'anon cannot insert profiles');
await expectErr(() => q(`select * from friend_requests`), 'anon cannot read friend graph');
ok((await q(`select account_status('@mom') s`))[0].s.status === 'claimed', 'account_status claimed');
ok((await q(`select account_status('@dad') s`))[0].s.status === 'unclaimed', 'account_status unclaimed');
ok((await q(`select account_status('@nope') s`))[0].s.status === 'not_found', 'account_status not_found');
await q(`insert into feedback(username,text) values ('@x','hi')`); ok(true, 'anon can send feedback');
await expectErr(() => q(`select * from feedback`), 'anon cannot read feedback');

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
ok((await q(`update profiles set name='Mom B', workouts=3, data='{"days":[]}' where code='@mom' returning code`)).length === 1, 'owner updates own stats');
await expectErr(() => q(`update profiles set user_id='${DAD}' where code='@mom'`), 'owner cannot reassign user_id');
await expectErr(() => q(`update profiles set code='@x' where code='@mom'`), 'owner cannot change code directly');
await expectErr(() => q(`delete from profiles where code='@mom'`), 'owner cannot delete profile row');
ok((await q(`select * from friend_requests`)).length === 1, 'mom sees only her friend requests');
ok((await q(`update friend_requests set status='accepted' where from_code='@mom' returning id`)).length === 1, 'mom updates own request');
ok((await q(`delete from friend_requests where from_code='@dad' returning id`)).length === 0, 'mom cannot delete dad<->empty request');
await q(`insert into friend_requests(from_code,to_code,status) values ('@mom','@empty','accepted')`); ok(true, 'mom can send request');
await q(`insert into storage.objects values ('avatars','@mom.jpg')`); ok(true, 'mom writes own avatar');
ok((await q(`select rename_profile('@dad') r`))[0].r.status === 'taken', 'rename to taken');
ok((await q(`select rename_profile('BAD') r`))[0].r.status === 'invalid', 'rename invalid');
ok((await q(`select rename_profile('@mommy') r`))[0].r.status === 'ok', 'rename ok');
ok((await q(`select code from profile_backups`))[0].code === '@mommy', 'backup followed rename (cascade)');
ok((await q(`select count(*)::int c from friend_requests where from_code='@mommy'`))[0].c === 2, 'friend requests followed rename');
ok((await q(`select owns_code('@mommy') o`))[0].o === true, 'owns renamed code');

await as('authenticated', DAD);
ok((await q(`select rename_profile('@dadx') r`))[0].r.status === 'no_profile', 'rename without profile');
await ex('reset role');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
