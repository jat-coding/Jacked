// Regression check for the 2026-10-11 friend-invite dedup fix (research/jacked-friend-invite-dedup-20261011-130246.md).
// Real Supabase is blocked by the harness, so SUPA/_authUid/publicProfile/syncMe/refreshFriends
// are stubbed in-page with a tiny fake that mimics the one real constraint this fix depends on:
// a unique (from_code,to_code) row, enforced with a Postgres-style 23505 error on collision.
// Run: PW=<path to node_modules/playwright> node tests/e2e/friend-invite-dedup.mjs
import { startServer, stopServer, launch, close, phone, check, results } from './harness.mjs';

async function installFakeSupa(page, { selectSeesLiveWrites = true } = {}) {
  await page.evaluate((selectSeesLiveWrites) => {
    window.__inserts = 0;
    let row = null; // the one allowed row for @tester -> @friend
    function builder() {
      const b = {
        _op: null, _vals: null,
        select() {
          // update().eq().select() resolves the pending update; a bare select().or() is a
          // lookup query that resolves lazily via .then() below once awaited.
          if (b._op === 'update') return (async () => {
            if (row) { row.status = b._vals.status; return { data: [{ id: row.id }], error: null }; }
            return { data: [], error: null };
          })();
          return b;
        },
        or() { return b; },
        eq(col, val) { b._eqId = val; return b; },
        update(vals) { b._op = 'update'; b._vals = vals; return b; },
        delete() { row = null; return b; },
        insert: async (vals) => {
          await new Promise(r => setTimeout(r, 40)); // simulate the network round-trip -- the race window
          window.__inserts++;
          if (row) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "friend_requests_from_to_unique"' } };
          row = { id: 1, ...vals };
          return { data: null, error: null };
        },
        then(res) {
          // awaited directly after .select()/.or() (the lookup query) or .delete().eq() --
          // empty unless the test wants a stale read to still see the live row
          // (selectSeesLiveWrites=false simulates two devices whose SELECT both ran before
          // either INSERT landed).
          res({ data: (selectSeesLiveWrites && row) ? [row] : [], error: null });
        },
      };
      return b;
    }
    SUPA = { from: () => builder() };
    _authUid = 'test-uid';
    publicProfile = async () => ({ code: '@friend' });
    syncMe = async () => {};
    refreshFriends = async () => {};
  }, selectSeesLiveWrites);
}

async function doubleTapGuard() {
  const { page, ctx, errors } = await phone({});
  await installFakeSupa(page);
  await page.evaluate(() => { document.getElementById('afCode').value = '@friend'; });
  // Two rapid taps before the first request round-trips -- exactly the reported repro.
  await page.evaluate(() => Promise.all([doAF(), doAF()]));
  const inserts = await page.evaluate(() => window.__inserts);
  check('friend-invite: rapid double-tap sends exactly one INSERT, not two', inserts === 1, String(inserts));
  const btn = page.locator('#afSendBtn');
  check('friend-invite: Add Friend button re-enabled after the request settles', await btn.isEnabled());
  check('friend-invite: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function staleReadBackstop() {
  // Simulates two different devices: both SELECTs run before either INSERT is visible to the
  // other, so the client-side guard alone can't help -- this is exactly what the DB unique
  // index (friend_requests_from_to_unique) is the backstop for.
  const { page, ctx, errors } = await phone({});
  await installFakeSupa(page, { selectSeesLiveWrites: false });
  await page.evaluate(() => { document.getElementById('afCode').value = '@friend'; });
  await page.evaluate(() => doAF()); // first "device": lands, inserts the only allowed row
  await page.evaluate(() => { document.getElementById('afCode').value = '@friend'; });
  await page.evaluate(() => doAF()); // second "device": stale SELECT saw nothing pending, INSERT collides
  const inserts = await page.evaluate(() => window.__inserts);
  check('friend-invite: a second insert attempt that collides on the unique index is attempted (proves the backstop is reachable)', inserts === 2, String(inserts));
  const toastText = await page.evaluate(() => document.querySelector('.toast,.tst,#toast')?.textContent || document.body.textContent.match(/already sent a request[^<]*/)?.[0] || '');
  check('friend-invite: 23505 collision is handled as "already sent", not a scary error', !/could not send|network error/i.test(toastText), toastText);
  check('friend-invite: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function acceptDoubleTapGuard() {
  // The actual mechanism behind "stacked acceptance notifications": @friend's pending request
  // sits in the UI, the recipient taps Accept twice before the first round-trip finishes (or
  // taps again on a stale re-render). Before the fix, the UPDATE had no status filter, so the
  // second tap matched the now-already-accepted row and "succeeded" again -- a second "Friend
  // added!" toast stacked on the first for one real acceptance.
  const { page, ctx, errors } = await phone({});
  await page.evaluate(() => {
    window.__updates = 0;
    let row = { id: 1, from_code: '@friend', to_code: '@tester', status: 'pending' };
    function builder() {
      const b = {
        _filters: {},
        eq(col, val) { b._filters[col] = val; return b; },
        update(vals) { b._vals = vals; return b; },
        select() {
          return (async () => {
            await new Promise(r => setTimeout(r, 40)); // the network round-trip -- the race window
            window.__updates++;
            const match = row.from_code === b._filters.from_code && row.to_code === b._filters.to_code
              && (b._filters.status === undefined || row.status === b._filters.status);
            if (!match) return { data: [], error: null };
            row.status = b._vals.status;
            return { data: [{ id: row.id }], error: null };
          })();
        },
      };
      return b;
    }
    SUPA = { from: () => builder() };
    _authUid = 'test-uid';
    refreshFriends = async () => {};
  });
  // Two rapid taps on the same Accept button, same request -- no ev/button needed for the guard itself.
  await page.evaluate(() => Promise.all([acceptFr('@friend'), acceptFr('@friend')]));
  const toasts = await page.evaluate(() => [...document.querySelectorAll('#tc .toast')].map(t => t.textContent));
  const added = toasts.filter(t => t.includes('Friend added')).length;
  check('friend-invite: double-tap Accept updates the row once, not twice', (await page.evaluate(() => window.__updates)) === 1, String(await page.evaluate(() => window.__updates)));
  check('friend-invite: double-tap Accept shows exactly one "Friend added!" toast, not stacked', added === 1, JSON.stringify(toasts));
  check('friend-invite: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await startServer();
await launch();
try {
  for (const s of [doubleTapGuard, staleReadBackstop, acceptDoubleTapGuard]) {
    try { await s(); } catch (e) { check(`${s.name}: suite crashed`, false, e.stack.split('\n').slice(0, 3).join(' ')); }
  }
} finally { await close(); stopServer(); }
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
