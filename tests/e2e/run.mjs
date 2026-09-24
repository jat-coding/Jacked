// Jacked PWA browser suite: regression checks for the core flows plus the
// 2026-09-24 changes (tap-to-clear set inputs, monthly Coward-Maxing,
// Consistency-Maxing, Jacked). Screenshots go to $SHOTS (default /tmp/jk16/shots).
import fs from 'fs';
import { startServer, stopServer, launch, close, phone, check, results, wk, ex, days, LB } from './harness.mjs';
const SHOTS = process.env.SHOTS || '/tmp/jk16/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const badges = page => page.evaluate(() => computeBadges().map(b => ({ name: b.name, earned: b.earned, tier: b.tier || null, desc: b.desc })));
const badge = async (page, n) => (await badges(page)).find(b => b.name === n);
const SEP15 = new Date('2026-09-15T12:00:00-06:00');

async function regression() {
  // Boot, every tab renders, no page errors.
  const { page, ctx, errors } = await phone({ seed: { hist: [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]])])] }, now: SEP15 });
  for (const t of ['home', 'routines', 'exercises', 'metrics', 'leaderboard']) {
    await page.evaluate(t => sp(t), t);
    await page.waitForTimeout(150);
    check(`regression: ${t} tab renders`, await page.locator('#page-' + t).isVisible());
  }
  check('regression: Achievements card lists 12 badges', (await badges(page)).length === 12, String((await badges(page)).length));
  const lb = await page.evaluate(() => yourStats().badges);
  check('regression: leaderboard badge count = earned count', lb === (await badges(page)).filter(b => b.earned).length);
  const shared = await page.evaluate(() => myBadgeList().map(b => b.n));
  check('regression: synced badge list matches earned', shared.length === lb);
  check('regression: no page errors while browsing tabs', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function workoutFlow() {
  // Start a routine, log a set by typing, finish, confirm history + PR.
  const cex = [{ id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }];
  const { page, ctx, errors } = await phone({ seed: { cex, routines: [{ id: 'r1', name: 'Push', desc: '', exercises: ['cex1'] }] } });
  await page.evaluate(() => startRW('r1'));
  const w = page.locator('#wSession input.si').nth(0), r = page.locator('#wSession input.si').nth(1);
  await w.tap(); await page.keyboard.type('135');
  await r.tap(); await page.keyboard.type('8');
  await page.locator('#wSession .sd').first().tap();
  const st = await page.evaluate(() => aw.exercises[0].sets[0]);
  check('workout: typed weight/reps stored', Math.round(st.weight * LB) === 135 && st.reps === 8 && st.done, JSON.stringify(st));
  await page.evaluate(() => { cm('restModal'); finishW(true); });
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => gH());
  check('workout: finish saves to history', h.length === 1 && h[0].exercises[0].sets[0].reps === 8);
  const pr = await page.evaluate(() => gPR()['cex1']);
  check('workout: PR committed on finish', pr && pr.reps === 8, JSON.stringify(pr));
  check('workout: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function tapToClear() {
  const cex = [{ id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
               { id: 'cex2', name: 'Plank', muscle: 'core', equip: 'none', tracking: 'duration', category: 'strength', notes: '', images: [], _c: true }];
  const { page, ctx, errors } = await phone({ seed: { cex, routines: [{ id: 'r1', name: 'Push', desc: '', exercises: ['cex1', 'cex2'] }] } });
  await page.evaluate(() => startRW('r1'));
  const w = page.locator('#wSession input.si').nth(0), r = page.locator('#wSession input.si').nth(1);
  await w.tap(); await page.keyboard.type('100'); await r.tap(); await page.keyboard.type('10');
  await page.locator('#awName').tap();                       // blur
  const ph0 = await w.evaluate(el => el.placeholder);
  // 1) focus clears and shows the old value as placeholder
  await w.tap();
  const f = await w.evaluate(el => ({ v: el.value, ph: el.placeholder, im: el.getAttribute('inputmode') }));
  check('tap-to-clear: focus empties weight box', f.v === '', JSON.stringify(f));
  check('tap-to-clear: old weight shown as placeholder', f.ph === '100', JSON.stringify(f));
  check('tap-to-clear: numeric keypad kept (inputmode=decimal)', f.im === 'decimal');
  await page.screenshot({ path: `${SHOTS}/1-cleared-input.png` });
  // 2) blur with nothing typed restores, state untouched
  await page.locator('#awName').tap();
  const b = await w.evaluate(el => ({ v: el.value, ph: el.placeholder }));
  const s1 = await page.evaluate(() => aw.exercises[0].sets[0]);
  check('tap-to-clear: blur with nothing typed restores value', b.v === '100' && Math.round(s1.weight * LB) === 100, JSON.stringify(b));
  check('tap-to-clear: placeholder goes back to what it was before focus', b.ph === ph0, `${b.ph} vs ${ph0}`);
  // 3) typed then erased -> still restores old value in STATE (never saves 0)
  await r.tap(); await page.keyboard.type('7'); await page.keyboard.press('Backspace');
  await page.locator('#awName').tap();
  const s2 = await page.evaluate(() => aw.exercises[0].sets[0]);
  check('tap-to-clear: type-then-erase restores old reps (no accidental 0)', s2.reps === 10 && (await r.inputValue()) === '10', JSON.stringify(s2));
  // 4) typed value saves, starting from empty (no "10" prefix)
  await r.tap(); await page.keyboard.type('12'); await page.locator('#awName').tap();
  const s3 = await page.evaluate(() => aw.exercises[0].sets[0]);
  check('tap-to-clear: typed value saves from an empty field', s3.reps === 12 && (await r.inputValue()) === '12', JSON.stringify(s3));
  // 5) an empty set keeps its suggestion placeholder on focus
  await page.locator('#wSession button', { hasText: '+ Add Set' }).first().tap();
  const w2 = page.locator('#wSession input.si').nth(2);
  await w2.tap();
  check('tap-to-clear: empty new set still shows the suggestion placeholder', (await w2.evaluate(el => el.placeholder)) === '100');
  await page.locator('#awName').tap();
  check('tap-to-clear: empty field stays empty after blur', (await w2.inputValue()) === '');
  // 6) duration box (same column) behaves the same
  const d = page.locator('#wSession .card, #wSession > div').filter({ hasText: 'Plank' }).locator('input.si').first();
  await d.tap(); await page.keyboard.type('45'); await page.locator('#awName').tap();
  await d.tap();
  const dv = await d.evaluate(el => ({ v: el.value, ph: el.placeholder }));
  await page.locator('#awName').tap();
  check('tap-to-clear: duration box clears too and restores', dv.v === '' && dv.ph === '45' && (await d.inputValue()) === '45', JSON.stringify(dv));
  // 7) non-set inputs (plate calculator) are NOT cleared
  await page.evaluate(() => { const i = document.getElementById('bwInput'); i.value = '180'; });
  await page.evaluate(() => { const i = document.getElementById('bwInput'); i.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
  check('tap-to-clear: body-weight field is left alone', (await page.evaluate(() => document.getElementById('bwInput').value)) === '180');
  // 8) history editor: finish, open edit, same behaviour + save
  await page.evaluate(() => { cm('restModal'); aw.exercises.forEach(e => e.sets.forEach(s => s.done = true)); finishW(true); });
  await page.waitForTimeout(300);
  const id = await page.evaluate(() => gH()[0].id);
  await page.evaluate(() => cm('fsModal'));
  await page.evaluate(id => openWE(id), id);
  const er = page.locator('#weContent input.si').nth(1);
  await er.tap();
  const ev = await er.evaluate(el => ({ v: el.value, ph: el.placeholder }));
  check('tap-to-clear: history editor clears + shows old reps', ev.v === '' && ev.ph === '12', JSON.stringify(ev));
  await page.locator('#weName').tap();
  check('tap-to-clear: history editor restores on blur', (await er.inputValue()) === '12');
  await er.tap(); await page.keyboard.type('9'); await page.locator('#weName').tap();
  await page.evaluate(() => saveWE());
  check('tap-to-clear: history editor typed value saves', (await page.evaluate(() => gH()[0].exercises[0].sets[0].reps)) === 9);
  check('tap-to-clear: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function coward() {
  const run = async (label, dates, now, want) => {
    const { page, ctx } = await phone({ seed: { hist: dates.map(d => wk(d)) }, now });
    const b = await badge(page, 'Coward-Maxing');
    check(`coward: ${label}`, b.earned === want, `earned=${b.earned}`);
    await ctx.close();
  };
  const daily = (a, b) => days(a, (new Date(b) - new Date(a)) / 864e5 + 1);
  await run('7 days off inside the month (Sep 2-8) -> earned', ['2026-09-01', ...daily('2026-09-09', '2026-09-14')], SEP15, true);
  await run('6 days off inside the month -> not earned', ['2026-09-01', ...daily('2026-09-08', '2026-09-14')], SEP15, false);
  await run('layoff straddling Aug/Sep (only 2 days in Sep) -> not earned (quarter rule would have)', ['2026-08-25', ...daily('2026-09-03', '2026-09-14')], SEP15, false);
  await run('ongoing layoff: last workout Sep 7, today Sep 15 -> earned', ['2026-09-07'], SEP15, true);
  await run('ongoing layoff: last workout Sep 8, today Sep 15 -> not yet', ['2026-09-08'], SEP15, false);
  await run('month rollover clears it: Sep lapse, today Oct 3', ['2026-09-01', '2026-09-20', '2026-10-01', '2026-10-02'], new Date('2026-10-03T12:00:00-06:00'), false);
  await run('month rollover: 7 off in Oct counts', ['2026-09-30'], new Date('2026-10-09T12:00:00-06:00'), true);
  await run('brand-new account, one workout today -> not earned', ['2026-09-15'], SEP15, false);
  await run('first workout mid-month: days before it do not count', ['2026-09-12', '2026-09-13', '2026-09-14'], SEP15, false);
  // Cardio-Maxing kept its quarterly window
  const { page, ctx } = await phone({ seed: { hist: [wk('2026-07-05', [ex('Run', [[1, 6]], 'distance')])] }, now: SEP15 });
  check('coward: Cardio-Maxing still quarterly (July run counts in Sep)', (await badge(page, 'Cardio-Maxing')).tier === 'gold');
  await ctx.close();
}

async function consistency() {
  const run = async (label, hist, want) => {
    const { page, ctx } = await phone({ seed: { hist }, now: SEP15 });
    const b = await badge(page, 'Consistency-Maxing');
    check(`consistency: ${label}`, b.earned === want, `earned=${b.earned} ${b.desc}`);
    await ctx.close();
  };
  await run('7 consecutive days -> earned', days('2026-08-01', 7).map(d => wk(d)), true);
  await run('6 consecutive days -> not earned', days('2026-08-01', 6).map(d => wk(d)), false);
  await run('gap: 6 days, 1 off, 1 more -> not earned', [...days('2026-08-01', 6), '2026-08-08'].map(d => wk(d)), false);
  await run('two workouts same day do not count as two days (6 distinct days, 7 workouts)', [...days('2026-08-01', 6).map(d => wk(d)), wk('2026-08-06', [], { hour: 18 })], false);
  await run('two workouts on one day inside a 7-day run -> earned', [...days('2026-08-01', 7).map(d => wk(d)), wk('2026-08-03', [], { hour: 19 })], true);
  await run('late-night local workouts use local dates (23:00 Denver = next day UTC)', days('2026-08-01', 7).map(d => wk(d, [], { hour: 23 })), true);
  await run('permanent: streak back in August, nothing since', [...days('2026-06-01', 7), '2026-09-14'].map(d => wk(d)), true);
  // Not a duplicate of PR-Maxing: 7 days in a row with no PRs earns Consistency only
  const { page, ctx } = await phone({ seed: { hist: days('2026-08-01', 7).map(d => wk(d)) }, now: SEP15 });
  check('consistency: differs from PR-Maxing (no PRs -> PR-Maxing locked)', (await badge(page, 'PR-Maxing')).earned === false && (await badge(page, 'Consistency-Maxing')).earned === true);
  await ctx.close();
}

function allGoldHistory({ pullReps = 20 } = {}) {
  const h = [];
  // 7 straight days, each with a PR -> PR-Maxing + Consistency-Maxing
  days('2026-09-01', 7).forEach(d => h.push(wk(d, [], { pr: true })));
  // Big lifts in one workout: bench 315x1, squat 400x5, deadlift 405x1 -> 1000lb club, bench gold, leg gold @180bw (360)
  h.push(wk('2026-09-08', [ex('Barbell Bench Press', [[315, 1]]), ex('Barbell Squat', [[400, 5]]), ex('Barbell Deadlift', [[405, 1]]),
    ex('Barbell Overhead Press', [[185, 5]]), ex('Pull-up', [[0, pullReps]], 'bodyweight_reps'), ex('Push-up', [[0, 80]], 'bodyweight_reps'),
    ex('Run', [[1, 6]], 'distance')]));
  // Variety: 100 distinct exercises
  const many = []; for (let i = 0; i < 100; i++) many.push(ex('Var ' + i, [[20, 5]], 'weight_reps', 'var' + i));
  h.push(wk('2026-09-09', many));
  // keep training daily so Coward-Maxing is NOT earned (proves it isn't required either way)
  days('2026-09-10', 5).forEach(d => h.push(wk(d)));
  return h;
}

async function jacked() {
  const seed = (o) => ({ hist: allGoldHistory(o), bw: 180 / LB });
  {
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    const bs = await badges(page);
    const j = bs.find(b => b.name === 'Jacked');
    const missing = bs.filter(b => !b.earned && b.name !== 'Jacked' && b.name !== 'Coward-Maxing').map(b => b.name);
    check('jacked: unlocked with every badge earned + all tiers gold', j.earned, `missing=${missing} ${j.desc}`);
    check('jacked: Coward-Maxing not required (it is locked here)', bs.find(b => b.name === 'Coward-Maxing').earned === false);
    check('jacked: does not count itself (10 required, not 11/12)', /10 \/ 10 badges · 6 \/ 6 at Gold/.test(j.desc), j.desc);
    check('jacked: all six tiered badges gold', bs.filter(b => b.tier).every(b => b.tier === 'gold') && bs.filter(b => b.tier).length === 6);
    await page.evaluate(() => sp('metrics'));
    await page.waitForTimeout(200);
    await page.locator('#page-metrics').getByText('Achievements').first().scrollIntoViewIfNeeded();
    await ctx.close();
  }
  {
    const { page, ctx } = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    const bs = await badges(page);
    check('jacked: locked when one tier is only silver (pull-ups 15)', bs.find(b => b.name === 'Pull-up-Maxing').tier === 'silver' && bs.find(b => b.name === 'Jacked').earned === false);
    await ctx.close();
  }
  {
    // popup opens for both new badges without errors
    const { page, ctx, errors } = await phone({ seed: seed(), now: SEP15 });
    for (const n of ['Jacked', 'Consistency-Maxing', 'Coward-Maxing']) {
      await page.evaluate(n => badgeInfo(n), n);
      const txt = await page.locator('#badgeFullBody').innerText();
      check(`popup: ${n} opens with how-to copy`, /how to earn it/i.test(txt) && txt.length > 60);
      if (n === 'Coward-Maxing') check('popup: Coward copy says monthly, not 3 months', /monthly/i.test(txt) && !/3 months|quarter/i.test(txt), txt);
      await page.evaluate(() => closeBadgeFull());
    }
    check('popup: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

async function narrowAndShots() {
  const h = allGoldHistory({ pullReps: 15 });   // Consistency earned, Jacked locked -> both visible
  for (const width of [320, 390]) {
    const { page, ctx } = await phone({ width, height: width === 320 ? 640 : 844, seed: { hist: h, bw: 180 / LB }, now: SEP15 });
    await page.evaluate(() => sp('metrics'));
    await page.waitForTimeout(300);
    const card = page.locator('[onclick="badgeInfo(\'Jacked\')"]');
    await card.scrollIntoViewIfNeeded();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`narrow ${width}px: no horizontal overflow`, over <= 0, 'overflow px=' + over);
    const rows = await page.evaluate(() => [...document.querySelectorAll('[onclick^="badgeInfo("]')].map(el => { const r = el.getBoundingClientRect(); return { r: r.right, w: el.scrollWidth - el.clientWidth }; }));
    check(`narrow ${width}px: every badge row fits the screen`, rows.length === 12 && rows.every(x => x.r <= width + 0.5 && x.w <= 0), JSON.stringify(rows.filter(x => x.r > width || x.w > 0)));
    if (width === 390) {
      await page.locator('[onclick="badgeInfo(\'Consistency-Maxing\')"]').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${SHOTS}/2-badges-new.png` });
      await page.evaluate(() => badgeInfo('Jacked')); await page.waitForTimeout(250);
      await page.screenshot({ path: `${SHOTS}/3-jacked-popup.png` });
    }
    await ctx.close();
  }
}

await startServer();
await launch();
try {
  for (const s of [regression, workoutFlow, tapToClear, coward, consistency, jacked, narrowAndShots]) {
    try { await s(); } catch (e) { check(`${s.name}: suite crashed`, false, e.stack.split('\n').slice(0, 3).join(' ')); }
  }
} finally { await close(); stopServer(); }
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
