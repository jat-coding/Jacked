// LIVE check for functions/v1/jacked-delete-account against the real project. Destructive by
// design, so it only ever deletes accounts it creates itself: three throwaway accounts
// (@zzdel<random>, signed up for real through jacked-auth), never the shared iOS chain test
// account and never a real user. Added 2026-11-08 with the function.
//
//   A: two fake workouts in its backup (plus a second save so profiles_history has a row),
//      a profile photo, an accepted friendship with B and a pending request from C.
//   B -> C: a pending request that does not involve A and must survive A's deletion.
// Then: no token -> 401; A typing B's username -> 400; B typing A's username -> 400, and
// nothing changed. A typing its own username (in caps) -> 200, after which A cannot sign in
// and nothing of A is left in auth.users, profiles, profile_backups, profiles_history,
// friend_requests or the avatars bucket, while B, C and B->C are untouched. B and C are then
// deleted through the same function, which is the cleanup and a second/third live run.
//
// Row counts are read with the service-level Management API query through the agent's
// broker (SUPABASE_API, default /home/roni/agent/scripts/broker/supabase-api) so the test
// never holds a secret itself.
//   node supabase/tests/delete_account_live_test.mjs
import { execFileSync } from 'child_process';
import crypto from 'crypto';

const URL_ = 'https://qehlrwnumrjktujidabz.supabase.co';
const KEY = 'sb_publishable_vmf9BELfVFZpKrdMN3Z34g_R9l056gJ';
const REF = 'qehlrwnumrjktujidabz';
const BROKER = process.env.SUPABASE_API || '/home/roni/agent/scripts/broker/supabase-api';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const sql = (query) => {
  const out = execFileSync(BROKER, ['POST', `/v1/projects/${REF}/database/query`, JSON.stringify({ query })], { encoding: 'utf8' });
  const [body, status] = out.split('\n<<HTTP ');
  if (!status?.startsWith('20')) throw new Error('query failed: ' + out.slice(0, 300));
  return JSON.parse(body);
};
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function http(method, path, { body, bearer, headers = {} } = {}) {
  const r = await fetch(URL_ + path, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${bearer ?? KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : (body instanceof Uint8Array ? body : JSON.stringify(body)),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

async function makeAccount() {
  const code = '@zzdel' + crypto.randomInt(1e7, 1e8);
  const password = crypto.randomBytes(12).toString('base64url') + 'aA1!';
  const reg = await http('POST', '/functions/v1/jacked-auth', { body: { code, password, name: 'delete test' } });
  if (reg.json?.status !== 'ok') throw new Error(`signup ${code}: ${reg.text}`);
  const acct = { code, password, email: reg.json.email };
  const s = await signIn(acct);
  if (!s.json?.access_token) throw new Error(`sign-in ${code}: ${s.text}`);
  acct.token = s.json.access_token; acct.uid = s.json.user.id;
  return acct;
}
const signIn = (a) => http('POST', '/auth/v1/token?grant_type=password', { body: { email: a.email, password: a.password } });
const del = (a, confirm, bearer = a?.token) => http('POST', '/functions/v1/jacked-delete-account', { body: { confirm }, bearer });

function footprint(a) {
  const c = lit(a.code);
  return sql(`select
    (select count(*) from auth.users where id = ${lit(a.uid)})::int as auth_user,
    (select count(*) from public.profiles where code = ${c})::int as profile,
    (select count(*) from public.profile_backups where code = ${c})::int as backup,
    (select count(*) from public.profiles_history where code = ${c})::int as history,
    (select count(*) from public.friend_requests where from_code = ${c} or to_code = ${c})::int as friends,
    (select count(*) from storage.objects where bucket_id = 'avatars' and name = ${lit(a.code + '.jpg')})::int as avatar`)[0];
}
const isGone = (f) => Object.values(f).every((n) => n === 0);

const made = [];
try {
  const A = await makeAccount(); made.push(A);
  const B = await makeAccount(); made.push(B);
  const C = await makeAccount(); made.push(C);
  console.log(`made ${A.code} ${B.code} ${C.code}`);

  // A's data: two fake workouts, then a changed save so the archive trigger writes history.
  const hist = [{ id: 'zzdel-1', date: '2026-11-01', exercises: [] }, { id: 'zzdel-2', date: '2026-11-03', exercises: [] }];
  let r = await http('POST', '/rest/v1/profile_backups', { bearer: A.token, headers: { Prefer: 'resolution=merge-duplicates' }, body: { code: A.code, backup: { jk_hist: hist.slice(0, 1) } } });
  ok(r.status < 300, `A backup saved (${r.status})`);
  r = await http('PATCH', `/rest/v1/profile_backups?code=eq.${encodeURIComponent(A.code)}`, { bearer: A.token, body: { backup: { jk_hist: hist } } });
  ok(r.status < 300, `A backup updated to 2 workouts (${r.status})`);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
  r = await http('POST', `/storage/v1/object/avatars/${encodeURIComponent(A.code + '.jpg')}`, { bearer: A.token, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: jpg });
  ok(r.status < 300, `A avatar uploaded (${r.status} ${r.status >= 300 ? r.text : ''})`);
  const req = (from, to) => http('POST', '/rest/v1/friend_requests', { bearer: from.token, body: { from_code: from.code, to_code: to.code, status: 'pending' } });
  ok((await req(A, B)).status < 300, 'A -> B request sent');
  r = await http('PATCH', `/rest/v1/friend_requests?from_code=eq.${encodeURIComponent(A.code)}&to_code=eq.${encodeURIComponent(B.code)}`, { bearer: B.token, body: { status: 'accepted' } });
  ok(r.status < 300, 'B accepted A (friends)');
  ok((await req(C, A)).status < 300, 'C -> A request sent');
  ok((await req(B, C)).status < 300, 'B -> C request sent (control, not A\'s)');

  const before = footprint(A);
  console.log('A before', JSON.stringify(before));
  ok(before.auth_user === 1 && before.profile === 1 && before.backup === 1 && before.history >= 1 && before.friends === 2 && before.avatar === 1,
    'A has an auth user, profile, backup, history, 2 friend rows and a photo before deleting');

  // Refusals: nothing may change.
  r = await http('POST', '/functions/v1/jacked-delete-account', { body: { confirm: A.code } });
  ok(r.status === 401, `no session -> ${r.status}`);
  r = await del(A, B.code);
  ok(r.status === 400 && r.json?.error === 'confirm_mismatch' && typeof r.json?.message === 'string', `A typing B's username -> ${r.status} ${r.json?.error}`);
  r = await del(B, A.code);
  ok(r.status === 400 && r.json?.error === 'confirm_mismatch', `B typing A's username -> ${r.status} ${r.json?.error}`);
  r = await del(A, '');
  ok(r.status === 400 && r.json?.error === 'confirm_required', `empty confirm -> ${r.status} ${r.json?.error}`);
  ok(JSON.stringify(footprint(A)) === JSON.stringify(before), 'refused calls deleted nothing of A');
  ok(footprint(B).profile === 1, 'refused calls deleted nothing of B');

  // The real thing.
  r = await del(A, A.code.slice(1).toUpperCase());
  ok(r.status === 200 && r.json?.status === 'deleted', `A typing its own username -> ${r.status} ${r.text}`);
  const after = footprint(A);
  console.log('A after', JSON.stringify(after));
  ok(isGone(after), 'A: auth user, profile, backup, history, friend rows and photo all gone');
  r = await signIn(A);
  ok(r.status >= 400 && !r.json?.access_token, `A can no longer sign in (${r.status} ${r.json?.error_code ?? r.json?.error ?? ''})`);
  r = await del(A, A.code);
  ok(r.status === 401, `A's old token is refused afterwards (${r.status})`);
  const fb = footprint(B), fc = footprint(C);
  ok(fb.auth_user === 1 && fb.profile === 1 && fb.friends === 1 && fc.profile === 1 && fc.friends === 1,
    'B and C untouched, B -> C request still there');
} catch (e) {
  ok(false, 'threw: ' + e.message);
} finally {
  // Cleanup through the function itself (a second and third live run).
  for (const a of made) {
    const f0 = footprint(a);
    if (isGone(f0)) continue;
    const r = await del(a, a.code);
    const f = footprint(a);
    ok(r.status === 200 && isGone(f), `cleanup ${a.code} through the function -> ${r.status}, ${isGone(f) ? 'all gone' : JSON.stringify(f)}`);
  }
  const left = sql(`select count(*)::int n from public.profiles where code like '@zzdel%'`)[0].n;
  ok(left === 0, `no @zzdel test profiles left on the project (${left})`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
