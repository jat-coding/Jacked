// Weekly review 2026-10-25/26 batch: live e2e coverage for the 13 confirmed-high findings
// fixed in this batch (research/project-review-jacked-pwa-weekly-20261025/report.md #3-15).
// #13/#14 (account_status*/XFF spoof) are covered in supabase/tests/rls_test.mjs and
// tests/e2e/auth-flow.mjs instead -- they are backend/login-flow fixes, not Library/active-
// workout rendering, so they don't belong in this file.
import { phone, check, wk, ex, days, LB, STD_ID } from './harness.mjs';
import { makeDb, device, ev } from './live.mjs';

const toasts = page => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '));
const wait = ms => new Promise(r => setTimeout(r, ms));

// #3: a resident tab that never reloads can't rely on sw.js's own bytes changing (74
// releases went by with CACHE unbumped) -- it now polls index.html's BUILD directly.
async function swContentVersionCheck() {
  const { page, ctx, errors } = await phone({});
  await ctx.route('**/index.html', async route => {
    const resp = await route.fetch();
    let body = await resp.text();
    body = body.replace(/const BUILD = 'v[^']+'/, "const BUILD = 'v99.99.99'");
    route.fulfill({ response: resp, body });
  });
  await page.evaluate(() => { window._mark = 1; });
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window._checkForUpdate())]);
  check('weekly review #3: a bumped BUILD served on a later fetch reaches an already-open tab (reloads)', await page.evaluate(() => window._mark === undefined));
  check('swContentVersionCheck: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function swContentVersionCheckNoop() {
  const { page, ctx, errors } = await phone({});
  await page.evaluate(() => { window._mark = 1; });
  let reloaded = false;
  page.once('load', () => { reloaded = true; });
  await page.evaluate(() => window._checkForUpdate());
  await wait(500);
  check('weekly review #3: an unchanged BUILD does not reload', !reloaded && (await page.evaluate(() => window._mark === 1)));
  check('swContentVersionCheckNoop: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #5: third-party exercise DB fields go unescaped into onclick(...) (id) and <img src>
// (images). loadDB() must drop a hostile id/image rather than let it reach the page, and
// the live-tier badge's onclick (a second, separate spot that embedded ex.name) must not
// be breakable by a `"` in a name.
async function exDbSanitizesHostilePayload() {
  const { page, ctx, errors } = await phone({});
  await ctx.route(/raw\.githubusercontent\.com/, route => {
    const payload = [
      { id: "evil');fetch('//evil", name: 'Evil Exercise', category: 'strength', primaryMuscles: ['chest'], equipment: 'barbell', images: ['x.jpg"><script>evil()</script>'] },
      { id: 'Mixed_Exercise', name: 'Mixed', category: 'strength', primaryMuscles: ['chest'], equipment: 'barbell', images: ['ok/0.jpg', 'bad".jpg'] },
      { id: 'Real_Exercise', name: 'Real Exercise', category: 'strength', primaryMuscles: ['chest'], equipment: 'barbell', images: ['Real_Exercise/0.jpg'] },
    ];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  // The app preloads the real DB 500ms after boot (index.html: setTimeout(loadDB,500)),
  // which already ran against the real network before this route existed -- force a fresh
  // load against the mocked payload instead of trusting that first, real one.
  await page.evaluate(() => { dbLoaded = false; dbLoading = false; allDB = []; loadDB(); });
  await page.waitForFunction(() => dbLoaded);
  const r = await page.evaluate(() => ({
    ids: allDB.map(e => e.id),
    mixedImages: allDB.find(e => e.id === 'Mixed_Exercise').images,
  }));
  check('weekly review #5: a hostile exercise id (breaks onclick) is dropped by loadDB entirely', !r.ids.includes("evil');fetch('//evil"), JSON.stringify(r.ids));
  check('weekly review #5: a real exercise in the same payload still loads', r.ids.includes('Real_Exercise') && r.ids.includes('Mixed_Exercise'), JSON.stringify(r.ids));
  check('weekly review #5: a hostile image path on an otherwise-fine exercise is dropped, the good one kept', JSON.stringify(r.mixedImages) === JSON.stringify(['ok/0.jpg']), JSON.stringify(r.mixedImages));
  await page.evaluate(() => renderEx());
  const html = await page.evaluate(() => document.getElementById('exList').innerHTML);
  check('weekly review #5: rendering the library after a hostile payload adds no <script> tag', !html.includes('<script>'), html.slice(0, 200));
  // The live-tier badge onclick (index.html ~4192) JS-escapes the name then esc()s the
  // WHOLE onclick string -- a `"` in the name must not be able to add a new attribute.
  const dom = await page.evaluate(() => {
    const name = 'foo" onmouseover="alert(1)';
    const onclickExpr = esc(`metricBadgeInfo('bench','gold',225,'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`);
    const div = document.createElement('div');
    div.innerHTML = `<span onclick="${onclickExpr}">x</span>`;
    const span = div.firstElementChild;
    return { attrCount: span.attributes.length, hasOnmouseover: span.hasAttribute('onmouseover'), onclick: span.getAttribute('onclick') };
  });
  check('weekly review #5: a `"` in an exercise name cannot break out of the live-tier badge\'s onclick attribute (stays one attribute, no onmouseover added)', dom.attrCount === 1 && !dom.hasOnmouseover && dom.onclick.includes('foo" onmouseover'), JSON.stringify(dom));
  check('exDbSanitizesHostilePayload: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #6: editing a built-in warm-up used to silently discard every change (saveCE's custom
// branch never found it in jk_cex). It must now go through the override path and persist.
async function warmupEditPersists() {
  const { page, ctx, errors } = await phone({});
  await page.evaluate(() => {
    openEditEx('wu_core');   // built-in warm-up (Plank)
    document.getElementById('ceEquip').value = 'dumbbell';
    document.getElementById('ceNotes').value = 'slow and controlled';
    saveCE();
  });
  const after = await page.evaluate(() => { const e = byId('wu_core'); return { equip: e.equip, notes: e.notes }; });
  check('weekly review #6: editing a warm-up\'s equip/notes and saving actually persists it', after.equip === 'dumbbell' && after.notes === 'slow and controlled', JSON.stringify(after));
  await page.evaluate(() => openEditEx('wu_core'));
  const reopened = await page.evaluate(() => document.getElementById('ceEquip').value);
  check('weekly review #6: re-opening the editor shows the persisted change, not the original', reopened === 'dumbbell', reopened);
  const editMode = await page.evaluate(() => ({ muscleHidden: document.getElementById('ceMuscleRow').style.display === 'none', trackingHidden: document.getElementById('ceTrackingRow').style.display === 'none' }));
  check('weekly review #6: muscle/tracking are not offered as editable for a warm-up (they are not in the override, and database-driven for every built-in exercise)', editMode.muscleHidden && editMode.trackingHidden, JSON.stringify(editMode));
  check('warmupEditPersists: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #7: "Delete Exercise" on a warm-up used to strip it from every routine while it stayed
// visible in the Library. It must now hide from the Library (built-in-exercise behavior)
// and leave routines that already used it alone.
async function warmupDeleteHidesLibraryKeepsRoutines() {
  const seed = { routines: [{ id: 'r1', name: 'Warmup Routine', desc: '', exercises: ['wu_core'] }] };
  const { page, ctx, errors } = await phone({ seed });
  await page.evaluate(() => deleteEx('wu_core'));
  await page.waitForFunction(() => document.getElementById('confirmModal').classList.contains('open'));
  await page.evaluate(() => _cfDone(true));
  await wait(150);
  const r = await page.evaluate(() => {
    renderEx();
    return {
      hidden: gHidden().includes('wu_core'),
      routineKept: gR().find(r => r.id === 'r1').exercises.includes('wu_core'),
      inLibraryHtml: document.getElementById('exList').innerHTML.includes('Plank'),
    };
  });
  check('weekly review #7: deleting a warm-up hides it from the Library', r.hidden && !r.inLibraryHtml, JSON.stringify(r));
  check('weekly review #7: the routine that already had it keeps it (no ghost state)', r.routineKept, JSON.stringify(r));
  check('warmupDeleteHidesLibraryKeepsRoutines: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const SYNTH_DB = [
  { id: 'Barbell_Squat', name: 'Barbell Squat', category: 'strength', primaryMuscles: ['quadriceps'], equipment: 'barbell', images: [] },
  { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press', category: 'strength', primaryMuscles: ['chest'], equipment: 'barbell', images: [] },
  { id: 'Bent_Over_Barbell_Row', name: 'Barbell Row', category: 'strength', primaryMuscles: ['middle back'], equipment: 'barbell', images: [] },
];
// #8: addCurated/startCuratedRoutine used to trust an immediately-resolved loadDB() even
// while another load was already in flight, silently saving/starting with exercises
// dropped. They must wait it out, and refuse (not silently proceed empty) if it never ends.
async function curatedWaitsForInFlightLoad() {
  const { page, ctx, errors } = await phone({});
  // The app preloads the real DB 500ms after boot (index.html: setTimeout(loadDB,500)), so
  // by now dbLoaded is already true -- reset it to actually simulate "a load from
  // elsewhere is in flight, this one hasn't finished yet".
  await page.evaluate(db => {
    dbLoaded = false; allDB = [];
    dbLoading = true;   // simulate: the Library's own load is already running elsewhere
    setTimeout(() => { allDB = db; dbLoaded = true; dbLoading = false; }, 300);
  }, SYNTH_DB);
  await page.evaluate(() => addCurated(0));   // StrongLifts 5x5 (2 routines)
  const routines = await page.evaluate(() => gR());
  check('weekly review #8: addCurated waits out an in-flight load instead of saving empty routines', routines.length === 2 && routines.every(r => r.exercises.length > 0), JSON.stringify(routines.map(r => r.exercises.length)));
  check('curatedWaitsForInFlightLoad (add): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  const { page: page2, ctx: ctx2, errors: errors2 } = await phone({});
  await page2.evaluate(db => {
    dbLoaded = false; allDB = [];
    dbLoading = true;
    setTimeout(() => { allDB = db; dbLoaded = true; dbLoading = false; }, 300);
  }, SYNTH_DB);
  await page2.evaluate(() => startCuratedRoutine(0, 0));   // StrongLifts A
  const state = await page2.evaluate(() => ({ hasAw: !!aw, exCount: aw ? aw.exercises.length : 0 }));
  check('weekly review #8: startCuratedRoutine waits out an in-flight load before starting', state.hasAw && state.exCount > 0, JSON.stringify(state));
  check('curatedWaitsForInFlightLoad (start): no page errors', errors2.length === 0, errors2.join(' | '));
  await ctx2.close();
}
async function curatedBlocksWhenDBNeverLoads() {
  const { page, ctx, errors } = await phone({});
  await page.evaluate(() => { dbLoaded = false; allDB = []; dbLoading = true; });   // never resolves within the poll window
  await page.evaluate(() => addCurated(0));
  const routines = await page.evaluate(() => gR());
  check('weekly review #8: addCurated refuses (no empty routine saved) when the DB never finishes loading', routines.length === 0, JSON.stringify(routines));
  check('weekly review #8: a clear error is shown instead of a false "Added" toast', /couldn.t load|check your connection/i.test(await toasts(page)), await toasts(page));
  check('curatedBlocksWhenDBNeverLoads: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #9: removing an exercise mid-live-workout tombstoned its sets too, but those set
// tombstones had nowhere to attach on the wire once the exercise itself was gone -- every
// later sync re-wrote the same doc forever. A second/third sync with no further change
// must write nothing more.
async function liveTombstoneNoResyncLoop() {
  const db = makeDb();
  const A = await device(db, 'phone-A');
  await ev(A, () => {
    startRW('r2');   // SEED routine with 2 exercises (cex1, cex2)
    aw.exercises[0].sets[0] = { ...aw.exercises[0].sets[0], weight: 100, reps: 5, done: true };
    renderWS();
  });
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });   // publish
  check('live tombstone: published', db.ops.length === 1 && db.ops[0][0] === 'insert', JSON.stringify(db.ops));
  await ev(A, () => rmEx(0));   // remove the exercise that has the done set
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });   // writes the removal
  const n = db.ops.length;
  check('live tombstone: removal written once', n === 2 && db.ops[1][0] === 'update', JSON.stringify(db.ops));
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  check('weekly review #9: a second sync with no further change writes nothing more (no resync loop)', db.ops.length === n, JSON.stringify(db.ops));
  await ev(A, () => { clearTimeout(_livePushT); return liveSync(); });
  check('weekly review #9: a third sync still writes nothing (not a fluke/race)', db.ops.length === n, JSON.stringify(db.ops));
  check('liveTombstoneNoResyncLoop: no page errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();
}

// #10: the live Cardio-Maxing tier chip appended a pseudo-workout with no date, and the
// cardio branch of badgeTierForKey drops anything whose date doesn't parse -- so "live"
// could never beat "pre" for a run. Direct check of the root cause, then the real render.
async function cardioLiveTierDateFix() {
  const { page, ctx, errors } = await phone({});
  const direct = await page.evaluate(() => {
    const runEx = { exId: 'bi_run_outdoor', name: 'Running (outdoor)', tracking: 'distance', sets: [{ weight: 5, reps: 5, done: true }] };
    return {
      withDate: badgeTierForKey('cardio', [{ exercises: [runEx], date: new Date().toISOString() }]),
      noDate: badgeTierForKey('cardio', [{ exercises: [runEx] }]),
    };
  });
  check('weekly review #10 (root cause): an undated pseudo-workout is dropped by the cardio branch', direct.noDate.tier === null, JSON.stringify(direct));
  check('weekly review #10: the same workout, dated, is actually counted', direct.withDate.tier !== null, JSON.stringify(direct));
  await page.evaluate(() => {
    aw = { id: 'wtest', routineId: null, name: 'Test', date: new Date().toISOString(), startedAt: Date.now(),
      exercises: [{ exId: 'bi_run_outdoor', name: 'Running (outdoor)', muscle: 'cardio', equip: 'body only', tracking: 'distance', imgUrl: null,
        sets: [{ weight: 5, reps: 5, done: true }] }] };
    awStart = Date.now();
    renderWS();
  });
  const chip = await page.evaluate(() => { const el = document.getElementById('wSession'); return !!el && el.innerHTML.includes("metricBadgeInfo('cardio'"); });
  check('weekly review #10: a fast run mid-workout actually fires the live Cardio-Maxing tier chip', chip === true, String(chip));
  check('cardioLiveTierDateFix: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #11: chTouched only ever looked at cardio/hold exercises, so a corrected weight-lift PR
// (edit or delete) left the old, wrong, documented PR standing forever.
async function editWorkoutRepairsWeightPR() {
  const W0 = { ...wk('2026-10-01', [ex('Barbell Bench Press', [[300, 5]])]), id: 'wb0', prCount: 1, prSets: [{ exId: STD_ID['Barbell Bench Press'], ei: 0, si: 0, weight: 300 / LB, reps: 5 }] };
  const seed = { hist: [W0], prs: { [STD_ID['Barbell Bench Press']]: { weight: 300 / LB, reps: 5, date: W0.date } } };
  const { page, ctx, errors } = await phone({ seed, now: new Date('2026-10-10T12:00:00-06:00') });
  await page.evaluate(id => { openWE(id); weDraft.exercises[0].sets[0].weight = 100 / 2.20462; saveWE(); }, 'wb0');
  const r = await page.evaluate(id => gPR()[id], STD_ID['Barbell Bench Press']);
  check("weekly review #11: correcting a typo'd weight down in Edit Workout re-derives the PR (no longer stuck at 300 lb)", r && Math.round(r.weight * 2.20462) === 100, JSON.stringify(r));
  check('editWorkoutRepairsWeightPR: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function deleteWorkoutRepairsWeightPR() {
  const W0 = { ...wk('2026-10-01', [ex('Barbell Bench Press', [[300, 5]])]), id: 'wb0', prCount: 1, prSets: [{ exId: STD_ID['Barbell Bench Press'], ei: 0, si: 0, weight: 300 / LB, reps: 5 }] };
  const W1 = { ...wk('2026-10-05', [ex('Barbell Bench Press', [[100, 5]])]), id: 'wb1' };
  const seed = { hist: [W0, W1], prs: { [STD_ID['Barbell Bench Press']]: { weight: 300 / LB, reps: 5, date: W0.date } } };
  const { page, ctx, errors } = await phone({ seed, now: new Date('2026-10-10T12:00:00-06:00') });
  const del = async id => { await page.evaluate(id => { openWD(id); document.getElementById('wdMore').click(); document.getElementById('actMenu-del').click(); }, id); await wait(100); await page.evaluate(() => _cfDone(true)); await wait(200); };
  await del('wb0');
  const r = await page.evaluate(id => gPR()[id], STD_ID['Barbell Bench Press']);
  check("weekly review #11: deleting the workout that held a typo'd PR re-derives it from what's left (100 lb)", r && Math.round(r.weight * 2.20462) === 100, JSON.stringify(r));
  check('deleteWorkoutRepairsWeightPR: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// #12: refreshFriends dropped the `error` from a failed friend_requests fetch, so
// supabase-js's {data:null,error} (never throws) silently wiped liveFriends/the cache.
async function refreshFriendsKeepsOnError() {
  const { page, ctx, errors } = await phone({ seed: { closeBuddies: ['@pal'] } });
  await page.evaluate(() => {
    localStorage.setItem('jk_friendsCache', JSON.stringify([{ code: '@pal', name: 'Pal' }]));
    liveFriends = [{ code: '@pal', name: 'Pal' }];
    const q = table => { const b = { select() { return b; }, or() { return b; }, eq() { return b; }, in() { return b; },
      then(res) { if (table === 'friend_requests') return res({ data: null, error: { message: 'Failed to fetch' } }); res({ data: [], error: null }); } }; return b; };
    const chan = { on() { return chan; }, subscribe() { return chan; }, unsubscribe() {} };
    SUPA = { from: q, rpc: async () => ({ data: [], error: null }), channel: () => chan, removeChannel() {} };
    _authUid = 'uid-test';
    syncMe = async () => {};
  });
  await page.evaluate(() => refreshFriends());
  const r = await page.evaluate(() => ({ live: liveFriends, cache: JSON.parse(localStorage.getItem('jk_friendsCache') || 'null') }));
  check('weekly review #12: a failed friend_requests fetch keeps the friends already loaded (not wiped to [])', r.live && r.live.length === 1 && r.live[0].code === '@pal', JSON.stringify(r.live));
  check('weekly review #12: the on-disk cache is untouched too', r.cache && r.cache.length === 1, JSON.stringify(r.cache));
  check('refreshFriendsKeepsOnError: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const WEEKLY_REVIEW_SUITES = [
  swContentVersionCheck, swContentVersionCheckNoop,
  exDbSanitizesHostilePayload,
  warmupEditPersists, warmupDeleteHidesLibraryKeepsRoutines,
  curatedWaitsForInFlightLoad, curatedBlocksWhenDBNeverLoads,
  liveTombstoneNoResyncLoop,
  cardioLiveTierDateFix,
  editWorkoutRepairsWeightPR, deleteWorkoutRepairsWeightPR,
  refreshFriendsKeepsOnError,
];
