// Unit check for supabase/functions/jacked-delete-account/logic.ts against a fake Store:
// confirm rules, delete order, stop-and-report on a failed step, and the retry path.
// Run: node supabase/tests/delete_account_logic_test.mjs   (Node 22.18+ strips the TS types)
import { deleteAccount, normU } from '../functions/jacked-delete-account/logic.ts';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

function fakeStore(code, failAt) {
  const calls = [];
  const step = (name) => async (arg) => { calls.push(`${name}:${arg}`); if (name === failAt) throw new Error('boom'); };
  return {
    calls,
    getCodeForUser: async (uid) => { calls.push(`get:${uid}`); return code; },
    deleteBackup: step('backup'), deleteLiveWorkout: step('live'), deleteFriendRequests: step('fr'),
    deleteHistory: step('history'), deleteAvatar: step('avatar'), deleteProfile: step('profile'),
    deleteAuthUser: step('auth'),
  };
}
const quiet = () => {};

ok(normU('  @@Mom! ') === '@mom', 'normU matches the client rule');

let s = fakeStore('@alice');
let r = await deleteAccount(s, 'u1', {}, quiet);
ok(r.http === 400 && r.body.error === 'confirm_required' && s.calls.length === 0, 'missing confirm -> 400, nothing read or deleted');

s = fakeStore('@alice');
r = await deleteAccount(s, 'u1', { confirm: '@bob' }, quiet);
ok(r.http === 400 && r.body.error === 'confirm_mismatch', 'someone else\'s username -> 400');
ok(s.calls.join() === 'get:u1', 'mismatch deletes nothing');

s = fakeStore('@alice');
r = await deleteAccount(s, 'u1', { confirm: ' Alice ' }, quiet);
ok(r.http === 200 && r.body.status === 'deleted', 'own username (any case, no @) -> deleted');
ok(s.calls.join() === 'get:u1,backup:@alice,live:@alice,fr:@alice,history:@alice,avatar:@alice,profile:@alice,history:@alice,auth:u1',
  'order: backup, live, friends, history, avatar, profile, history sweep, auth user last');

s = fakeStore('@alice', 'avatar');
const logged = [];
r = await deleteAccount(s, 'u1', { confirm: '@alice' }, (...a) => logged.push(a.join(' ')));
ok(r.http === 500 && r.body.error === 'delete_failed' && /avatar/.test(r.body.message), 'failed step -> 500 naming the step');
ok(!s.calls.includes('profile:@alice') && !s.calls.includes('auth:u1'), 'stops at the failed step: profile and auth user untouched');
ok(logged.some((l) => l.includes('step avatar failed for @alice')), 'failed step is logged');

s = fakeStore(null);
r = await deleteAccount(s, 'u1', { confirm: '@victim' }, quiet);
ok(r.http === 200 && s.calls.join() === 'get:u1,auth:u1', 'no profile left (retry) -> only the caller\'s own auth user, nothing named by the body');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
