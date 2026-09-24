// Jacked PWA browser suite: regression checks for the core flows plus the
// 2026-09-24 changes (tap-to-clear set inputs, monthly Coward-Maxing,
// Consistency-Maxing, Jacked). Screenshots go to $SHOTS (default /tmp/jk16/shots).
import fs from 'fs';
import { startServer, stopServer, launch, close, phone, check, results, wk, ex, days, LB } from './harness.mjs';
const SHOTS = process.env.SHOTS || '/tmp/jk16/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const badges = page => page.evaluate(() => computeBadges().map(b => ({ name: b.name, earned: b.earned, tier: b.tier || null, desc: b.desc, detail: b.detail })));
const badge = async (page, n) => (await badges(page)).find(b => b.name === n);
const SEP15 = new Date('2026-09-15T12:00:00-06:00');
// Sep 2026 monthly badges already done, so the all-gold seed can hold Jacked (it needs the Monthly-reset badges too).
const MB_SEP = { '2026-09': { group: 'biceps', target: 4, done: true, comeback: true } };

async function regression() {
  // Boot, every tab renders, no page errors.
  const { page, ctx, errors } = await phone({ seed: { hist: [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]])])] }, now: SEP15 });
  for (const t of ['home', 'routines', 'exercises', 'metrics', 'leaderboard']) {
    await page.evaluate(t => sp(t), t);
    await page.waitForTimeout(150);
    check(`regression: ${t} tab renders`, await page.locator('#page-' + t).isVisible());
  }
  check('regression: Achievements card lists 14 badges', (await badges(page)).length === 14, String((await badges(page)).length));
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
  const seed = (o) => ({ hist: allGoldHistory(o), bw: 180 / LB, monthBadges: MB_SEP });
  {
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    const bs = await badges(page);
    const j = bs.find(b => b.name === 'Jacked');
    const missing = bs.filter(b => !b.earned && b.name !== 'Jacked' && b.name !== 'Coward-Maxing').map(b => b.name);
    check('jacked: unlocked with every badge earned + all tiers gold', j.earned, `missing=${missing} ${j.desc}`);
    check('jacked: Coward-Maxing not required (it is locked here)', bs.find(b => b.name === 'Coward-Maxing').earned === false);
    check('jacked: needs 8 (6 tiered + Challenge + Comeback), permanent ones not counted', /8 \/ 8 badges · 6 \/ 6 at Gold/.test(j.detail) && !/\d+ \/ \d+/.test(j.desc), j.detail + ' | ' + j.desc);
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
    // Permanent badges are not required: only the Monthly-reset and 3-month-reset badges gate Jacked.
    const h = [wk('2026-09-12', [ex('Barbell Bench Press', [[315, 1]]), ex('Barbell Squat', [[400, 5]]), ex('Barbell Overhead Press', [[185, 5]]), ex('Pull-up', [[0, 20]], 'bodyweight_reps'), ex('Push-up', [[0, 80]], 'bodyweight_reps'), ex('Run', [[1, 6]], 'distance')])];
    const { page, ctx } = await phone({ seed: { hist: h, bw: 180 / LB, monthBadges: MB_SEP }, now: SEP15 });
    const bs = await badges(page);
    const perm = ['1000lb Club', 'Variety-Maxing', 'PR-Maxing', 'Consistency-Maxing'].map(n => bs.find(b => b.name === n).earned);
    check('jacked: earned with NO permanent badge (3-month + monthly only)', bs.find(b => b.name === 'Jacked').earned === true && perm.every(x => x === false), JSON.stringify({ perm, j: bs.find(b => b.name === 'Jacked') }));
    await page.evaluate(() => badgeInfo('Jacked'));
    const txt = await page.locator('#badgeFullBody').innerText();
    check('popup: Jacked how-to names the groups, not each badge', /Monthly reset/.test(txt) && /3-month reset/.test(txt) && /Permanent badges are not needed/.test(txt) && !/Bench, Shoulder/.test(txt), txt);
    await ctx.close();
    const m = await phone({ seed: { hist: h, bw: 180 / LB }, now: SEP15 });
    check('jacked: locked when the monthly badges are not earned', (await badge(m.page, 'Jacked')).earned === false);
    await m.ctx.close();
  }
  {
    // Coward-Maxing locks Jacked: every badge otherwise earned, then a 14-day layoff inside the month.
    const { page, ctx } = await phone({ seed: seed(), now: new Date('2026-09-29T12:00:00-06:00') });
    const bs = await badges(page);
    check('jacked: locked while Coward-Maxing is held', bs.find(b => b.name === 'Coward-Maxing').earned === true && bs.find(b => b.name === 'Jacked').earned === false, JSON.stringify(bs.filter(b => !b.earned).map(b => b.name)));
    await page.evaluate(() => badgeInfo('Jacked'));
    const txt = await page.locator('#badgeFullBody').innerText();
    check('popup: Jacked says Coward-Maxing locks it', /locked by Coward-Maxing/i.test(txt) && /cannot have Coward-Maxing/i.test(txt), txt);
    const coward = bs.find(b => b.name === 'Coward-Maxing');
    check('metrics row: Coward description has no "resets monthly"', !/resets monthly/i.test(coward.desc), coward.desc);
    await ctx.close();
  }
  {
    // Leaderboard crown: previous calendar month's top weight lifted, next to the name with a gilded row.
    const aug = wk('2026-08-12', [ex('Barbell Bench Press', [[185, 5]])]); aug.totalVolume = 10000;
    const friends = [{ id: '@bob', code: '@bob', name: 'Bob', username: '@bob', pmVol: 50000 }, { id: '@amy', code: '@amy', name: 'Amy', username: '@amy', pmVol: 20000 }];
    const { page, ctx, errors } = await phone({ seed: { hist: [aug], friends }, now: SEP15 });
    await page.evaluate(() => { sp('leaderboard'); renderLB(); });
    await page.waitForTimeout(200);
    const crowned = await page.evaluate(() => [...crownCodes()]);
    check('crown: last month top lifter (Bob, 50000) wears it', crowned.length === 1 && crowned[0] === '@bob', JSON.stringify(crowned));
    const rows = await page.locator('#page-leaderboard .gilded').count();
    check('crown: gilded row + crown icon on that name only', rows >= 1 && (await page.locator('#page-leaderboard .gilded svg').count()) >= 1 && (await page.locator('#page-leaderboard .gilded', { hasText: 'Amy' }).count()) === 0, String(rows));
    await page.screenshot({ path: SHOTS + '/crown.png' });
    check('crown: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    // Nobody lifted last month -> nobody is crowned.
    const { page, ctx } = await phone({ seed: {}, now: SEP15 });
    check('crown: nobody crowned when nobody lifted last month', (await page.evaluate(() => crownCodes().size)) === 0);
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

async function monthly() {
  const seed = (o) => ({ hist: allGoldHistory(o), bw: 180 / LB, monthBadges: MB_SEP });
  {
    // Tiers follow the last 3 months: the same September lifts, viewed in December, have dropped; all-time best is kept.
    const { page, ctx } = await phone({ seed: seed(), now: new Date('2026-12-15T12:00:00-07:00') });
    const bs = await badges(page);
    check('rolling: Bench tier gone once the lift is older than 3 months', bs.find(b => b.name === 'Bench-Maxing').tier === null, JSON.stringify(bs.find(b => b.name === 'Bench-Maxing')));
    check('rolling: Jacked lost when tiers drop below Gold', bs.find(b => b.name === 'Jacked').earned === false);
    await page.evaluate(() => badgeInfo('Bench-Maxing'));
    const txt = await page.locator('#badgeFullBody').innerText();
    check('rolling: popup keeps the highest ever, grayed (315 lb, gold)', /highest ever/i.test(txt) && /315 lb/.test(txt) && /gold/i.test(txt), txt);
    await ctx.close();
  }
  {
    // ...and a lift still inside the window counts (Sep 8 seen from Nov 20).
    const { page, ctx } = await phone({ seed: seed(), now: new Date('2026-11-20T12:00:00-07:00') });
    check('rolling: lift 2.4 months old still counts', (await badge(page, 'Bench-Maxing')).tier === 'gold');
    await ctx.close();
  }
  {
    // Jacked is checked every month and each month it was held is kept.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await badges(page);
    const mb = await page.evaluate(() => S.g('monthBadges'));
    check('jacked: month it was held is recorded', Array.isArray(mb._jackedMonths) && mb._jackedMonths.includes('2026-09'), JSON.stringify(mb));
    await page.evaluate(() => badgeInfo('Jacked'));
    const txt = await page.locator('#badgeFullBody').innerText();
    check('jacked: popup shows months held', /held in 1 month/i.test(txt) && /September 2026/.test(txt), txt);
    await ctx.close();
  }
  {
    // Monthly recap card: top of Home, above the streak box, first 7 days of the month only.
    const { page, ctx, errors } = await phone({ seed: seed(), now: new Date('2026-10-03T12:00:00-06:00') });
    await page.evaluate(() => { renderHome(); });
    const vis = await page.evaluate(() => { const c = document.getElementById('recapCard'), s = document.getElementById('streakBanner'); return { shown: c.style.display !== 'none', txt: c.innerText, above: !!(c.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    check('recap: card shows in first week, names September', vis.shown && /September recap/i.test(vis.txt), JSON.stringify(vis));
    check('recap: card sits above the streak box', vis.above);
    await page.evaluate(() => document.getElementById('recapCard').click());
    await page.waitForTimeout(250);
    const full = await page.locator('#recapFullBody').innerText();
    check('recap: tap opens full recap with tiles, best lift and tiers', /September 2026/.test(full) && /sessions/i.test(full) && /best lift/i.test(full) && /bench/i.test(full), full);
    const dims = await page.evaluate(async () => { const c = await recapImage(_recap); return [c.width, c.height]; });
    check('recap: share image renders (1080 wide)', dims[0] === 1080 && dims[1] > 1000, String(dims));
    await page.evaluate(() => closeRecap());
    await page.evaluate(() => dismissRecap('2026-09'));
    check('recap: dismiss hides the card', await page.evaluate(() => document.getElementById('recapCard').style.display === 'none'));
    check('recap: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { page, ctx } = await phone({ seed: seed(), now: new Date('2026-10-15T12:00:00-06:00') });
    await page.evaluate(() => renderHome());
    check('recap: card hidden after day 7', await page.evaluate(() => document.getElementById('recapCard').style.display === 'none'));
    const rows = await page.evaluate(() => cardRecaps().html);
    check('recap: Metrics > Monthly Recaps still lists September', /September 2026/.test(rows));
    await ctx.close();
  }
  {
    // Earned non-tiered badges show a teal "Earned" pill and a teal icon backdrop in the popup; Coward-Maxing (a penalty) does not.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => sp('metrics')); await page.waitForTimeout(300);
    const pill = await page.evaluate(() => { const r = n => document.querySelector(`[onclick="badgeInfo('${n}')"] .badge`); const a = r('PR-Maxing'), b = r('Consistency-Maxing'); return { a: a && a.textContent + '|' + getComputedStyle(a).color, b: b && b.textContent }; });
    check('teal: earned non-tiered badge shows a teal Earned pill', /^Earned\|rgb\(32, 211, 194\)/.test(pill.a) && pill.b === 'Earned', JSON.stringify(pill));
    await page.evaluate(() => badgeInfo('PR-Maxing'));
    const pop = await page.evaluate(() => ({ st: document.querySelector('#badgeFullBody .bf-status').innerText, bg: getComputedStyle(document.querySelector('#badgeFullBody .bf-icon')).backgroundColor, ring: getComputedStyle(document.querySelector('#badgeFullBody .bf-status')).color }));
    check('teal: popup status says earned, icon backdrop and status teal', /earned/i.test(pop.st) && pop.bg === 'rgba(32, 211, 194, 0.14)' && pop.ring === 'rgb(32, 211, 194)', JSON.stringify(pop));
    await ctx.close();
  }
  {
    // Unlocked Jacked: own gold hero section at the very top of Achievements, not repeated in the list.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => sp('metrics')); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const h = document.getElementById('jackedHero'); const rc = h.getBoundingClientRect(); return { has: true, cnt: document.querySelectorAll('[onclick="badgeInfo(\'Jacked\')"]').length, ht: rc.height, txt: h.innerText.trim(), icon: !!h.querySelector('svg') }; });
    check('hero: unlocked Jacked is a short crown + name box at the top, once, no description', r.cnt === 1 && r.ht < 70 && /^JACKED$/i.test(r.txt) && r.icon, JSON.stringify(r));
    await page.screenshot({ path: `${SHOTS}/hero.png` });
    await ctx.close();
    const l = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await l.page.evaluate(() => sp('metrics')); await l.page.waitForTimeout(300);
    check('hero: locked Jacked stays in the list, no hero', await l.page.evaluate(() => !document.getElementById('jackedHero') && document.querySelectorAll('[onclick="badgeInfo(\'Jacked\')"]').length === 1));
    await l.ctx.close();
  }
  for (const [w, hgt] of [[390, 844], [375, 667], [360, 640]]) {
    // Monthly recap: one phone screen, no scrolling (Mr. Roni, 2026-09-24).
    const { page, ctx } = await phone({ width: w, height: hgt, seed: seed(), now: new Date('2026-10-03T12:00:00-06:00') });
    await page.evaluate(() => openRecapNow()); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const f = document.getElementById('recapFull'); const wrap = document.getElementById('recapFullBody'); return { sh: f.scrollHeight, ch: f.clientHeight, ow: f.scrollWidth - f.clientWidth, tiers: wrap.querySelectorAll('.rc-b').length }; });
    check(`recap fits one screen at ${w}x${hgt}`, m.sh <= m.ch && m.ow <= 0 && m.tiers === 6, JSON.stringify(m));
    await page.screenshot({ path: `${SHOTS}/recap-${w}.png` });
    await ctx.close();
  }
  {
    // Achievements grouped by reset type with small grey labels.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => sp('metrics')); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const out = []; document.querySelectorAll('#page-metrics .bgrp, #page-metrics [onclick^="badgeInfo("]').forEach(el => out.push(el.classList.contains('bgrp') ? '#' + el.textContent : el.getAttribute('onclick').slice(11, -2))); return out; });
    const idx = n => g.indexOf(n), lab = ['#Monthly reset', '#3-month reset', '#Permanent'].map(idx);
    check('groups: three grey labels in order (Monthly, 3-month, Permanent)', lab[0] >= 0 && lab[0] < lab[1] && lab[1] < lab[2], JSON.stringify(g));
    check('groups: Challenge/Comeback under Monthly (Coward hidden), tiered under 3-month, 1000lb/Variety/PR/Consistency under Permanent',
      ['Challenge-Maxing', 'Comeback-Maxing'].every(n => idx(n) > lab[0] && idx(n) < lab[1]) && idx('Coward-Maxing') < 0 &&
      ['Bench-Maxing', 'Shoulder-Maxing', 'Leg-Maxing', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing'].every(n => idx(n) > lab[1] && idx(n) < lab[2]) &&
      ['1000lb Club', 'Variety-Maxing', 'PR-Maxing', 'Consistency-Maxing'].every(n => idx(n) > lab[2]), JSON.stringify(g));
    await ctx.close();
    const l = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await l.page.evaluate(() => sp('metrics')); await l.page.waitForTimeout(300);
    const gl = await l.page.evaluate(() => [...document.querySelectorAll('#page-metrics .bgrp, #page-metrics [onclick^="badgeInfo("]')].map(el => el.classList.contains('bgrp') ? '#' + el.textContent : el.getAttribute('onclick').slice(11, -2)));
    const jt = await l.page.evaluate(() => { const j = computeBadges().find(b => b.name === 'Jacked'); badgeInfo('Jacked'); return [j.desc, document.getElementById('badgeFullBody').innerText]; });
    check('teaser: locked Jacked promises something special (list + popup)', /something special/i.test(jt[0]) && /reward/i.test(jt[1]) && /something special/i.test(jt[1]), JSON.stringify(jt));
    const ju = await phone({ seed: seed(), now: SEP15 });
    check('teaser: unlocked Jacked shows no reward teaser', await ju.page.evaluate(() => { badgeInfo('Jacked'); return !/something special/i.test(document.getElementById('badgeFullBody').innerText); }));
    await ju.ctx.close();
    check('groups: locked Jacked sits under Monthly reset', gl.indexOf('Jacked') > gl.indexOf('#Monthly reset') && gl.indexOf('Jacked') < gl.indexOf('#3-month reset'), JSON.stringify(gl));
    await l.ctx.close();
  }
  {
    // Shimmering tab titles while Jacked is held; plain when it is not.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => { renderHome(); sp('metrics'); });
    const on = await page.evaluate(() => { const t = document.querySelector('#page-metrics .pt'); const cs = getComputedStyle(t); return { attr: document.documentElement.hasAttribute('data-jacked'), anim: cs.animationName, clip: cs.webkitBackgroundClip || cs.backgroundClip, ht: getComputedStyle(document.querySelector('#jackedHero .jh-t')).animationName }; });
    check('gold titles: Jacked held -> tab titles shimmer in gold, box shimmers', on.attr && on.anim === 'ptSweep' && /text/.test(on.clip) && on.ht === 'jhTxt', JSON.stringify(on));
    const fr = await page.evaluate(() => { const g = getComputedStyle(document.body, '::before'); const sec = document.querySelector('#page-metrics .metric-card, #page-metrics .sec'); return [g.position, g.pointerEvents, getComputedStyle(document.body, '::after').position, sec && getComputedStyle(sec).outlineColor, sec && getComputedStyle(sec).outlineWidth, getComputedStyle(document.querySelector('.pt span')).textShadow]; });
    check('glow: soft edge glow (fixed, click-through), no screen border, gold outline on sections, dot has no teal glow', fr[0] === 'fixed' && fr[1] === 'none' && fr[2] !== 'fixed' && /255, 215, 0/.test(fr[3]) && parseFloat(fr[4]) > 0 && fr[5] === 'none', JSON.stringify(fr));
    const t = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await t.page.evaluate(() => { renderHome(); sp('metrics'); });
    const off = await t.page.evaluate(() => ({ attr: document.documentElement.hasAttribute('data-jacked'), anim: getComputedStyle(document.querySelector('#page-metrics .pt')).animationName }));
    check('gold titles: no Jacked -> plain titles', !off.attr && off.anim === 'none', JSON.stringify(off));
    await page.waitForTimeout(450);   // let the .2s colour transition finish
    const nv = await page.evaluate(() => { const n = document.querySelector('nav'), ac = document.querySelector('nav .nb.active'); return [getComputedStyle(n).borderTopColor, getComputedStyle(ac).color, getComputedStyle(document.getElementById('navInd')).backgroundColor]; });
    check('nav: pill outline, selected tab and highlight are gold with Jacked', /255, 215, 0/.test(nv[0]) && nv[1] === 'rgb(255, 215, 0)' && /255, 215, 0/.test(nv[2]), JSON.stringify(nv));
    check('glow: nothing without Jacked', await t.page.evaluate(() => getComputedStyle(document.querySelector('nav .nb.active')).color !== 'rgb(255, 215, 0)' && getComputedStyle(document.body, '::before').position !== 'fixed' && getComputedStyle(document.querySelector('#page-metrics .sec, #page-metrics .metric-card')).outlineStyle === 'none'));
    await page.evaluate(() => { S.s('hist', gH().filter(w => !(w.exercises || []).some(e => /pull/i.test(e.name)))); renderHome(); });
    check('gold titles: losing Jacked removes it', await page.evaluate(() => !document.documentElement.hasAttribute('data-jacked') && getComputedStyle(document.querySelector('#page-metrics .pt')).animationName === 'none'));
    await ctx.close(); await t.ctx.close();
  }
  {
    // Coward-Maxing is hidden from Achievements until it is earned.
    const has = async (o, now) => { const { page, ctx } = await phone({ seed: o, now }); await page.evaluate(() => sp('metrics')); await page.waitForTimeout(250); const r = await page.evaluate(() => !!document.querySelector('[onclick="badgeInfo(\'Coward-Maxing\')"]')); await ctx.close(); return r; };
    check('coward: hidden from the list while not earned', (await has(seed(), SEP15)) === false);
    check('coward: shown once earned', (await has(seed(), new Date('2026-09-29T12:00:00-06:00'))) === true);
  }
  {
    // Comeback-Maxing anti-softlock: half the days of the month keeps it even when last month was better.
    const run = async (label, hist, want) => {
      const { page, ctx } = await phone({ seed: { hist }, now: new Date('2026-10-25T12:00:00-06:00') });
      check(`comeback: ${label}`, (await badge(page, 'Comeback-Maxing')).earned === want, (await badge(page, 'Comeback-Maxing')).desc);
      await ctx.close();
    };
    const sep = days('2026-09-01', 30).map(d => wk(d));   // trained every day last month, so nothing to beat
    await run('16 of 31 days in Oct after a perfect Sep -> kept', [...sep, ...days('2026-10-01', 16).map(d => wk(d))], true);
    await run('15 of 31 days in Oct after a perfect Sep -> not earned', [...sep, ...days('2026-10-01', 15).map(d => wk(d))], false);
  }
  {
    // Challenge-Maxing: glutes never picked, never the same group two months running.
    const { page, ctx } = await phone({ seed: seed(), now: new Date('2026-10-03T12:00:00-06:00') });
    const g1 = await page.evaluate(() => { computeBadges(); return S.g('monthBadges')['2026-10'].group; });
    check('challenge: group chosen, not glutes', !!g1 && g1 !== 'glutes', g1);
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
    check(`narrow ${width}px: every badge row fits the screen`, rows.length === 13 && rows.every(x => x.r <= width + 0.5 && x.w <= 0), JSON.stringify(rows.filter(x => x.r > width || x.w > 0)));
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

// Google Fonts are blocked in tests, so headings fall back to a wide system font. Stand in a
// condensed face (Ubuntu Sans 75% width, still wider than Barlow Condensed) so layout checks and
// screenshots are closer to the real app. Applied after boot so it can't affect app logic.
const condensed = page => page.addStyleTag({ content: ":root{--fh:'Ubuntu Sans',sans-serif} .sv,.sl,.ebn,h1,h2,h3,[style*='var(--fh)']{font-stretch:75%}" });
// Past-workout PRs: replayed from history (same rule as commitPRs), shown in the day sheet
// (one exercise per row, gold star) and the workout detail (PRs tile + starred PR set).
async function pastPRs() {
  const full = (w, sets, vol) => Object.assign(w, { sets, totalVolume: vol, duration: '31:00' });
  const build = () => {
    const w1 = full(wk('2026-09-01', [ex('Incline Chest Press (Machine)', [[140, 8], [140, 6]]), ex('Chest Fly (Machine)', [[145, 10]]), ex('Overhead Triceps Extension (Cable)', [[150, 10]]), ex('Lateral Raise (Dumbbell)', [[30, 12]]), ex('Triceps Pressdown', [[100, 12]])]), 6, 9000);
    const w2 = full(wk('2026-09-08', [ex('Incline Chest Press (Machine)', [[140, 8]]), ex('Squat', [[185, 5]]), ex('Run', [[1, 9]], 'distance')]), 3, 4000);
    const w3 = full(wk('2026-09-22', [
      ex('Incline Chest Press (Machine)', [[90, 15], [160, 7], [140, 8], [140, 6], [140, 6]]),
      ex('Overhead Triceps Extension (Cable)', [[140, 10], [140, 10], [140, 10], [140, 10]]),
      ex('Chest Fly (Machine)', [[145, 10], [145, 8], [145, 4], [145, 5]]),
      ex('Lateral Raise (Dumbbell)', [[25, 12], [25, 12]]),
      ex('Triceps Pressdown', [[90, 12], [90, 12]]),
      ex('Run', [[1, 8.5]], 'distance')]), 21, 10600);
    w3.name = 'Chest/Tris/Shoulders';
    const w4 = full(wk('2026-09-10', [ex('Incline Chest Press (Machine)', [[100, 5]])]), 1, 500);   // lighter than before: no PR
    Object.assign(w1, { prCount: 5 }); Object.assign(w2, { prCount: 2 }); Object.assign(w3, { prCount: 2 }); Object.assign(w4, { prCount: 0 });   // as commitPRs would have stored them
    return [w1, w2, w3, w4];
  };
  const [w1, w2, w3, w4] = build();
  const { page, ctx, errors } = await phone({ seed: { hist: [w3, w4, w1, w2], bw: 180 / LB }, now: SEP15 });   // deliberately unsorted
  await condensed(page);
  const rep = await page.evaluate(() => [...prReplay().entries()].map(([id, v]) => ({ id, n: v.n, names: v.list.map(p => p.name), si: v.list.map(p => p.si) })));
  const by = id => rep.find(r => r.id === id);
  check('prs: first workout: every exercise is a PR (5)', by(w1.id).n === 5, JSON.stringify(by(w1.id)));
  check('prs: equal e1RM is not a PR; new lift + first run are', by(w2.id).n === 2 && !by(w2.id).names.includes('Incline Chest Press (Machine)'), JSON.stringify(by(w2.id)));
  check('prs: replay sorts by date not array order; PR set index is the best set', by(w3.id).n === 2 && by(w3.id).names.join() === 'Incline Chest Press (Machine),Run' && by(w3.id).si[0] === 1, JSON.stringify(by(w3.id)));
  // Same rule as commitPRs: run commitPRs over the same workouts oldest -> newest and compare counts.
  const live = await page.evaluate(({ ws }) => { S.s('prs', {}); S.s('cardioPR', {}); return ws.map(w => commitPRs(w).length); }, { ws: [w1, w2, w3] });
  check('prs: replay counts match commitPRs run in date order', JSON.stringify(live) === JSON.stringify([by(w1.id).n, by(w2.id).n, by(w3.id).n]), JSON.stringify(live));
  await page.evaluate(() => { S.s('prs', {}); S.s('cardioPR', {}); });
  // Memoized: same Map until history changes.
  const memo = await page.evaluate(() => { const a = prReplay(), b = prReplay(); return a === b; });
  check('prs: replay memoized between renders', memo);
  const perf = await page.evaluate(() => {
    const h = []; for (let i = 0; i < 3000; i++) h.push({ id: 'p' + i, date: new Date(2020, 0, 1 + i).toISOString(), exercises: [{ exId: 'x' + (i % 30), name: 'X', tracking: 'weight_reps', sets: [{ weight: 50 + (i % 40), reps: 5, done: true }] }] });
    S.s('hist', h); const t0 = performance.now(); prReplay(); const cold = performance.now() - t0;
    const t1 = performance.now(); for (let i = 0; i < 100; i++) prsOf(h[i]); const warm = performance.now() - t1; return { cold, warm };
  });
  check('prs: 3000-workout replay is fast; 100 lookups near-free', perf.cold < 300 && perf.warm < 50, JSON.stringify(perf));
  await page.evaluate(h => S.s('hist', h), [w3, w4, w1, w2]);

  // Day sheet.
  await page.evaluate(() => sp('home'));
  await page.evaluate(() => openDay('2026-09-22')); await page.waitForTimeout(250);
  const day = await page.evaluate(() => {
    const c = document.getElementById('dayContent');
    const rows = [...c.querySelectorAll('.card-dark > div:nth-of-type(2) > div')];
    return { rows: rows.length, pills: c.querySelectorAll('.badge').length, hdr: c.querySelector('.card-dark').innerText.includes('★ 2 PRs'),
      gold: rows.map(r => r.firstElementChild.style.color === 'rgb(255, 215, 0)'), texts: rows.map(r => r.innerText.replace(/\s+/g, ' ')) };
  });
  check('day sheet: one row per exercise, no wrapped pills', day.rows === 6 && day.pills === 0, JSON.stringify(day));
  check('day sheet: PR exercises starred/gold, others not', JSON.stringify(day.gold) === '[true,false,false,false,false,true]' && day.texts[0].startsWith('★') && !day.texts[1].startsWith('★'), JSON.stringify(day.texts));
  check('day sheet: header shows gold "★ 2 PRs"; PR row shows the PR set', day.hdr && day.texts[0].includes('160lb × 7'), JSON.stringify(day.texts[0]));
  check('day sheet: non-PR row shows set count', day.texts[1].includes('4 sets'), day.texts[1]);
  const over = await page.evaluate(() => { const c = document.getElementById('dayContent'); return [...c.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).length; });
  check('day sheet: nothing overflows the 390px screen', over === 0, String(over));
  await page.screenshot({ path: `${SHOTS}/pr-1-day-sheet.png` });
  await page.evaluate(() => { cm('dayModal'); openDay('2026-09-08'); }); await page.waitForTimeout(200);
  const day2 = await page.evaluate(() => document.getElementById('dayContent').innerText);
  check('day sheet: Sep 8 shows "★ 2 PRs"', day2.includes('★ 2 PRs'), day2.slice(0, 80));
  await page.evaluate(() => { cm('dayModal'); openDay('2026-09-10'); });
  const day4 = await page.evaluate(() => document.getElementById('dayContent').innerText);
  check('day sheet: workout without PRs has no star or PR header', !day4.includes('★') && !day4.includes('PR'), day4.slice(0, 80));
  await page.evaluate(id => { cm('dayModal'); openWD(id); }, w4.id);
  const wd4 = await page.evaluate(() => [...document.querySelectorAll('#wdContent .sc')].length + ':' + document.getElementById('wdContent').innerText.includes('★'));
  check('detail: workout without PRs keeps the 3-tile row, no star', wd4 === '3:false', wd4);

  // Workout detail.
  await page.evaluate(id => { cm('dayModal'); openWD(id); }, w3.id); await page.waitForTimeout(250);
  const wd = await page.evaluate(() => {
    const c = document.getElementById('wdContent');
    const tiles = [...c.querySelectorAll('.sc')].map(t => t.innerText.replace(/\s+/g, ' ').trim());
    const sets = [...c.querySelectorAll('.card-dark')].map(cd => [...cd.querySelectorAll('div[style*="justify-content:space-between"]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
    return { tiles, stars: sets.flat().filter(t => t.includes('★')), sets: sets[0], over: [...c.querySelectorAll('.sc')].filter(t => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > innerWidth - 8 || [...t.children].some(k => k.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5 || k.getBoundingClientRect().left < t.getBoundingClientRect().left - 0.5)).length };
  });
  check('detail: PRs tile next to Sets/Vol/Exercises', wd.tiles.length === 4 && wd.tiles[3].startsWith('2') && /PRs/i.test(wd.tiles[3]), JSON.stringify(wd.tiles));
  check('detail: only the PR sets carry a star', wd.stars.length === 2 && wd.stars[0].includes('Set 2') && wd.stars[0].includes('160lb × 7 reps'), JSON.stringify(wd.stars));
  check('detail: stat tiles do not clip their text', wd.over === 0, String(wd.over));
  await page.screenshot({ path: `${SHOTS}/pr-2-workout-detail.png` });
  await page.evaluate(id => { cm('wdModal'); openWD(id); }, w2.id);
  const wd2 = await page.evaluate(() => [...document.querySelectorAll('#wdContent .sc')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  check('detail: PRs tile shows for any workout with PRs (2 in Sep 8)', wd2.length === 4 && wd2[3].startsWith('2'), JSON.stringify(wd2));

  // Delete a past workout -> later workouts recompute (from history, not stored flags).
  await page.evaluate(id => S.s('hist', gH().filter(w => w.id !== id)), w1.id);
  const after = await page.evaluate(() => [...prReplay().values()].map(v => v.n));
  check('prs: deleting Sep 1 recomputes later workouts', JSON.stringify(after) === '[3,0,6]', JSON.stringify(after));

  // Finish stores prSets; prCount-driven features unchanged.
  await page.evaluate(() => { S.s('hist', []); S.s('prs', {}); S.s('cardioPR', {}); });
  await page.evaluate(() => {
    aw = { id: 'wfin', name: 'Push', date: new Date().toISOString(), exercises: [{ exId: 'bench', name: 'Bench', tracking: 'weight_reps', sets: [{ weight: 60, reps: 5, done: true }, { weight: 80, reps: 5, done: true }] }] };
    awStart = Date.now() - 60000; cm('restModal'); finishW(true);
  });
  await page.waitForTimeout(300);
  const rec = await page.evaluate(() => { const h = gH()[0]; return { prCount: h.prCount, prSets: h.prSets, replay: prsOf(h) }; });
  check('finish: prSets stored beside prCount, agrees with replay', rec.prCount === 1 && rec.prSets.length === 1 && rec.prSets[0].si === 1 && rec.prSets[0].exId === 'bench' && rec.replay.n === 1 && rec.replay.list[0].si === 1, JSON.stringify(rec));
  check('prs: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // Narrow phone: 4 stat tiles + day rows still fit.
  const n = await phone({ width: 320, height: 640, seed: { hist: [w3, w4, w1, w2], bw: 180 / LB }, now: SEP15 });
  await condensed(n.page);
  await n.page.evaluate(id => openWD(id), w3.id); await n.page.waitForTimeout(250);
  const nw = await n.page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, clip: [...document.querySelectorAll('#wdContent .sc')].filter(t => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > innerWidth - 8 || [...t.children].some(k => k.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5 || k.getBoundingClientRect().left < t.getBoundingClientRect().left - 0.5)).length }));
  check('narrow 320px: detail with PRs tile has no overflow/clipping', nw.doc <= 0 && nw.clip === 0, JSON.stringify(nw));
  await n.page.screenshot({ path: `${SHOTS}/pr-3-detail-320.png` });
  await n.page.evaluate(() => { cm('wdModal'); openDay('2026-09-22'); }); await n.page.waitForTimeout(250);
  const nd = await n.page.evaluate(() => [...document.getElementById('dayContent').querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 0.5).length);
  check('narrow 320px: day sheet rows fit', nd === 0, String(nd));
  await n.page.screenshot({ path: `${SHOTS}/pr-4-day-320.png` });
  await n.ctx.close();
}

// Reconciling replay vs stored prCount: importer rule for imported ids, live rule otherwise, cardio
// counted, and a guard so nothing visible ever disagrees with the stored count.
async function prReconcile() {
  const W = (d, id, exs, prCount, extra = {}) => Object.assign(wk(d, exs), { id, prCount, sets: exs.length, totalVolume: 1000 }, extra);
  const undone = e => { e.sets.forEach(s => { s.done = false; }); return e; };
  const I1 = W('2026-08-01', 'w1785000000000_0', [ex('Bench', [[100, 10]])], 1);                    // imported: first ever -> PR
  const I2 = W('2026-08-08', 'w1785600000000_0', [undone(ex('Bench', [[110, 1]]))], 1);             // imported: heavier raw weight, NOT done, lower e1RM -> importer PR
  const L1 = W('2026-08-15', 'wlive1', [ex('Bench', [[112, 1]]), ex('Squat', [[100, 5]]), ex('Run', [[1, 9]], 'distance')], 3);   // live: bench 112>110 e1RM, squat first, first run
  const C1 = W('2026-08-20', 'wcardio1', [ex('Run', [[1, 8]], 'distance')], 1);                     // cardio PR (faster)
  const C2 = W('2026-08-22', 'wcardio2', [ex('Run', [[1, 9]], 'distance')], 0);                     // slower: none
  const M2 = W('2026-08-25', 'wmis2', [ex('Bench', [[200, 5]])], 2);                                // stored 2, replay 1 -> guard
  const M0 = W('2026-08-26', 'wmis0', [ex('Squat', [[300, 5]])], 0);                                // stored 0, replay 1 -> guard
  const PS = W('2026-08-27', 'wprsets', [ex('Deadlift', [[150, 3], [160, 3]])], 1, { prSets: [{ exId: 'deadlift', ei: 0, si: 0, weight: 150, reps: 3 }] });   // prSets trusted over replay (si 1)
  const NC = W('2026-08-28', 'wnocount', [ex('Overhead Press', [[50, 5]])], undefined); delete NC.prCount;   // no stored count -> replay shown
  const hist = [NC, PS, M0, M2, C2, C1, L1, I2, I1];                                                // unsorted
  const { page, ctx, errors } = await phone({ seed: { hist, bw: 180 / LB }, now: SEP15 });
  await condensed(page);
  const rep = await page.evaluate(() => Object.fromEntries([...prReplay().entries()].map(([id, v]) => [id, { n: v.n, si: v.list.map(p => p.si), names: v.list.map(p => p.name) }])));
  check('reconcile: imported rule: heaviest raw weight PR even when undone / lower e1RM', rep[I2.id].n === 1 && rep[I2.id].si[0] === 0, JSON.stringify(rep[I2.id]));
  check('reconcile: live rule after an imported record: e1RM beats {110,1}', rep[L1.id].n === 3 && rep[L1.id].names.join() === 'Bench,Squat,Run', JSON.stringify(rep[L1.id]));
  check('reconcile: cardio PRs counted (faster run yes, slower no)', rep[C1.id].n === 1 && rep[C2.id].n === 0, JSON.stringify([rep[C1.id], rep[C2.id]]));
  const audit = await page.evaluate(() => prAudit());
  check('audit: total counts only workouts with a stored prCount', audit.total === 8, JSON.stringify(audit));
  check('audit: match count and mismatch list ({id,date,stored,replay})', audit.match === 6 && audit.mismatches.length === 2
    && audit.mismatches.every(m => m.date && ((m.id === M2.id && m.stored === 2 && m.replay === 1) || (m.id === M0.id && m.stored === 0 && m.replay === 1))), JSON.stringify(audit));
  const so = await page.evaluate(() => Object.fromEntries(gH().map(w => { const p = prsOf(w); return [w.id, { n: p.n, stars: p.list.length, at: [...p.at] }]; })));
  check('guard: mismatch shows stored count (2) with no stars', so[M2.id].n === 2 && so[M2.id].stars === 0 && so[M2.id].at.length === 0, JSON.stringify(so[M2.id]));
  check('guard: stored 0 vs replay 1 shows nothing', so[M0.id].n === 0 && so[M0.id].stars === 0, JSON.stringify(so[M0.id]));
  check('guard: matching workouts keep replay stars', so[I2.id].n === 1 && so[I2.id].stars === 1 && so[L1.id].n === 3 && so[C1.id].n === 1 && so[C2.id].n === 0, JSON.stringify(so));
  check('guard: absent prCount -> replay shown', so[NC.id].n === 1 && so[NC.id].stars === 1, JSON.stringify(so[NC.id]));
  check('guard: prSets trusted over replay for stars', so[PS.id].n === 1 && so[PS.id].at.join() === '0:0', JSON.stringify(so[PS.id]));
  // prSets that do not resolve against the exercises -> stored count, no stars.
  const bad = await page.evaluate(() => { const w = { ...gH().find(x => x.id === 'wprsets'), prSets: [{ exId: 'nope', ei: 0, si: 0, weight: 1, reps: 1 }] }; const p = prsOf(w); return { n: p.n, stars: p.list.length }; });
  check('guard: unresolvable prSets -> stored count, no stars', bad.n === 1 && bad.stars === 0, JSON.stringify(bad));

  // Rendered: day sheet + detail.
  const day = async ds => { await page.evaluate(ds => { cm('dayModal'); openDay(ds); }, ds); await page.waitForTimeout(150); return page.evaluate(() => document.getElementById('dayContent').innerText); };
  const dM2 = await day('2026-08-25');
  check('day sheet: mismatch header shows stored "★ 2 PRs", no row stars', dM2.includes('★ 2 PRs') && dM2.split('★').length === 2, dM2.replace(/\s+/g, ' '));
  const dM0 = await day('2026-08-26');
  check('day sheet: stored 0 vs replay 1 shows no PR header or star', !dM0.includes('★') && !dM0.includes('PR'), dM0.replace(/\s+/g, ' '));
  const dI2 = await day('2026-08-08');
  check('day sheet: imported workout shows its 1 PR row', dI2.includes('★ 1 PR') && dI2.split('★').length === 3, dI2.replace(/\s+/g, ' '));
  const dC1 = await day('2026-08-20');
  check('day sheet: cardio PR shown with pace row', dC1.includes('★ 1 PR') && /mi/.test(dC1), dC1.replace(/\s+/g, ' '));
  const det = async id => { await page.evaluate(id => { cm('dayModal'); cm('wdModal'); openWD(id); }, id); await page.waitForTimeout(150);
    return page.evaluate(() => ({ tiles: [...document.querySelectorAll('#wdContent .sc')].map(t => t.innerText.replace(/\s+/g, ' ').trim()), stars: [...document.querySelectorAll('#wdContent .card-dark div[style*="justify-content:space-between"]')].filter(r => r.innerText.includes('★')).map(r => r.innerText.replace(/\s+/g, ' ').trim()) })); };
  const dtM2 = await det(M2.id);
  check('detail: mismatch shows PRs tile = stored 2, no starred sets', dtM2.tiles.length === 4 && dtM2.tiles[3].startsWith('2') && dtM2.stars.length === 0, JSON.stringify(dtM2));
  const dtM0 = await det(M0.id);
  check('detail: stored 0 vs replay 1 keeps 3 tiles, no stars', dtM0.tiles.length === 3 && dtM0.stars.length === 0, JSON.stringify(dtM0));
  const dtPS = await det(PS.id);
  check('detail: prSets star lands on the stored set (Set 1)', dtPS.stars.length === 1 && dtPS.stars[0].includes('Set 1'), JSON.stringify(dtPS));
  check('reconcile: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Landscape "fake portrait lock" (2026-09-24). On a phone turned sideways the app frame (body) is counter-rotated so the UI
// stays upright relative to the phone body. angle 90 = phone turned counter-clockwise (its top on the screen's LEFT),
// 270 = clockwise (top on the RIGHT). Portrait, keyboard-shrunk portrait, tablet/desktop must be untouched.
const inVp = (b, w, h) => b.left >= -1 && b.top >= -1 && b.right <= w + 1 && b.bottom <= h + 1;
const R = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel), b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height }; }, sel);
const st = page => page.evaluate(() => ({ rot: document.documentElement.getAttribute('data-rot'), tf: getComputedStyle(document.body).transform, guard: getComputedStyle(document.getElementById('rotateGuard')).display, pos: getComputedStyle(document.body).position, navDisp: getComputedStyle(document.querySelector('nav')).display }));
async function portraitLock() {
  for (const [W, H] of [[844, 390], [932, 430], [667, 375]]) for (const a of [90, 270]) {
    const tag = `lock ${W}x${H} @${a}`;
    const { page, ctx, errors } = await phone({ width: W, height: H, angle: a, seed: { hist: [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]])])] }, now: SEP15 });
    const s = await st(page);
    check(`${tag}: data-rot=${a}, guard hidden, body counter-rotated`, s.rot === String(a) && s.guard === 'none' && s.pos === 'fixed' && s.tf === (a === 90 ? `matrix(0, -1, 1, 0, 0, ${H})` : `matrix(0, 1, -1, 0, ${W}, 0)`), JSON.stringify(s));
    const body = await R(page, 'body'), nav = await R(page, 'nav');
    check(`${tag}: body exactly fills the viewport`, Math.abs(body.left) < 1 && Math.abs(body.top) < 1 && Math.abs(body.w - W) < 1 && Math.abs(body.h - H) < 1, JSON.stringify(body));
    // Nav is the app's bottom: a tall narrow pill on the screen's right (90) / left (270), fully on screen.
    check(`${tag}: bottom nav on the ${a === 90 ? 'right' : 'left'} edge, upright-to-phone (tall, narrow), on screen`, nav.h > nav.w * 3 && inVp(nav, W, H) && (a === 90 ? nav.right > W - 30 : nav.left < 30), JSON.stringify(nav));
    const ph = await R(page, '#page-home .ph');
    check(`${tag}: page header (app top) sits on the ${a === 90 ? 'left' : 'right'} edge`, a === 90 ? ph.left < 2 : ph.right > W - 2, JSON.stringify(ph));
    check(`${tag}: home page fits the short axis (no clipping)`, (await R(page, '#page-home')).h <= H + 1 && (await page.evaluate(() => document.getElementById('jkRoot').scrollWidth <= document.getElementById('jkRoot').clientWidth + 1)));
    // Text really is rotated: the "JACKED." wordmark reads along the screen's long axis.
    const title = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#page-home .pt')); const b = r.getBoundingClientRect(); return { w: b.width, h: b.height }; });
    check(`${tag}: title text runs vertically on screen (rotated)`, title.h > title.w, JSON.stringify(title));
    // Bottom sheet, toast: fixed layers rotate with the frame and stay on screen.
    await page.evaluate(() => om('cardOrderModal')); await page.waitForTimeout(150);
    const md = await R(page, '#cardOrderModal .md');
    check(`${tag}: bottom sheet hugs the ${a === 90 ? 'right' : 'left'} edge, on screen`, inVp(md, W, H) && (a === 90 ? md.right > W - 2 : md.left < 2) && md.w < W, JSON.stringify(md));
    await page.screenshot({ path: `${SHOTS}/lock-${W}x${H}-${a}-sheet.png` });
    await page.evaluate(() => cm('cardOrderModal'));
    await page.evaluate(() => toast('Saved', 'ok')); await page.waitForTimeout(150);
    const tb = await R(page, '#tc > *');
    check(`${tag}: toast rotates with the app, on screen, at the app top`, inVp(tb, W, H) && tb.h > tb.w && (a === 90 ? tb.left < 60 : tb.right > W - 60), JSON.stringify(tb));
    await page.screenshot({ path: `${SHOTS}/lock-${W}x${H}-${a}-home.png` });
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // Every tab and the live workout fit the frame width in the rotated frame (no sideways overflow), on the narrowest phone.
  { const cex = [{ id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }];
    const { page, ctx, errors } = await phone({ width: 667, height: 375, angle: 90, now: SEP15, seed: { cex, routines: [{ id: 'r1', name: 'Push', desc: '', exercises: ['cex1'] }], hist: [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]])])] } });
    const overflow = () => page.evaluate(() => { const r = document.getElementById('jkRoot'); return r.scrollWidth - r.clientWidth; });
    for (const t of ['home', 'routines', 'exercises', 'metrics', 'leaderboard']) {
      await page.evaluate(t => sp(t), t); await page.waitForTimeout(200);
      check(`lock @90 667x375: ${t} tab has no sideways overflow`, (await overflow()) <= 1, String(await overflow()));
      if (t === 'metrics') await page.screenshot({ path: `${SHOTS}/lock-667x375-90-metrics.png` });
    }
    await page.evaluate(() => startRW('r1')); await page.waitForTimeout(300);
    check('lock @90 667x375: live workout has no sideways overflow and the top bar sits at the app top', (await overflow()) <= 1 && (await R(page, '.ab')).left < 2, JSON.stringify(await R(page, '.ab')));
    await page.screenshot({ path: `${SHOTS}/lock-667x375-90-workout.png` });
    check('lock @90 667x375: no page errors browsing tabs + workout', errors.length === 0, errors.join(' | '));
    await ctx.close(); }
  // Native touch scroll follows the APP's vertical axis (the screen's horizontal axis) in the rotated frame.
  for (const a of [90, 270]) {
    const { page, ctx } = await phone({ width: 844, height: 390, angle: a, now: SEP15 });
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '3000px'; d.id = 'spacer'; document.getElementById('page-home').appendChild(d); });
    const cdp = await ctx.newCDPSession(page);
    const tp = (t, x, y) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: t === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const swipe = async (x, y, dx, dy) => { await tp('touchStart', x, y); for (let i = 1; i <= 15; i++) { await tp('touchMove', x + dx * i / 15, y + dy * i / 15); await page.waitForTimeout(20); } await tp('touchEnd'); await page.waitForTimeout(700); };
    const top = () => page.evaluate(() => document.getElementById('jkRoot').scrollTop);
    // App down (content up) = finger toward the phone-top edge: left for 90, right for 270.
    await swipe(400, 200, a === 90 ? -220 : 220, 0);
    const t1 = await top();
    check(`lock @${a}: touch swipe along the screen's horizontal axis scrolls the app`, t1 > 50, String(t1));
    await swipe(400, 200, a === 90 ? 220 : -220, 0);
    const t2 = await top();
    check(`lock @${a}: swiping back scrolls up again`, t2 < t1 - 50, `${t2} < ${t1}`);
    await swipe(400, 200, a === 90 ? -220 : 220, 0);
    { const n = await R(page, 'nav'), h = await R(page, '#page-home .ph');
      check(`lock @${a}: sticky header + fixed nav stay put while scrolled`, inVp(n, 844, 390) && (a === 90 ? n.right > 814 && h.left < 2 : n.left < 30 && h.right > 842), JSON.stringify({ n, h })); }
    check(`lock @${a}: the window itself never scrolls`, await page.evaluate(() => scrollX === 0 && scrollY === 0));
    await ctx.close();
  }
  // Drag-to-reorder uses the app's vertical axis. Move the first card down past the second by dragging along screen-X.
  for (const a of [90, 270]) {
    const { page, ctx, errors } = await phone({ width: 844, height: 390, angle: a, now: SEP15 });
    await page.evaluate(() => openCardOrder()); await page.waitForTimeout(200);
    const ids0 = await page.evaluate(() => [...document.querySelectorAll('#cardOrderList [data-id]')].map(e => e.dataset.id));
    const h = await page.locator('#cardOrderList .cdrag').first().boundingBox();
    const rows = await page.evaluate(() => [...document.querySelectorAll('#cardOrderList [data-id]')].slice(0, 2).map(e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right }; }));
    const step = Math.abs(rows[1].l - rows[0].l);   // one row, along screen-X
    const dir = a === 90 ? 1 : -1;                   // app-down = screen-right for 90, screen-left for 270
    const cx = h.x + h.width / 2, cy = h.y + h.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + dir * step * 0.6, cy, { steps: 4 }); await page.mouse.move(cx + dir * step * 1.3, cy, { steps: 4 });
    await page.mouse.up(); await page.waitForTimeout(250);
    const ids1 = await page.evaluate(() => (gSet().cardOrder || []).slice());
    check(`lock @${a}: drag-to-reorder moves card ${ids0[0]} below ${ids0[1]} (app-axis mapping)`, ids1[0] === ids0[1] && ids1[1] === ids0[0], JSON.stringify({ ids0, ids1 }));
    check(`lock @${a}: reorder no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // Typing works in the rotated frame and the field is not hidden (keyboard bug must not regress).
  { const { page, ctx } = await phone({ width: 844, height: 390, angle: 90 });
    await page.evaluate(() => om('loginModal')); await page.waitForTimeout(150);
    const inp = page.locator('#loginModal input').first();
    await inp.tap(); await page.keyboard.type('abc');
    check('lock @90: focused input stays visible, keeps focus, accepts typing', (await inp.inputValue()) === 'abc' && (await inp.isVisible()) && (await page.evaluate(() => document.body.classList.contains('kb'))));
    check('lock @90: modal input is on screen', inVp(await R(page, '#loginModal input'), 844, 390));
    await page.screenshot({ path: `${SHOTS}/lock-844x390-90-login.png` });
    await ctx.close(); }
  // Unchanged: portrait, keyboard-shrunk portrait, tablet, desktop.
  { const { page, ctx } = await phone({ width: 390, height: 844, angle: 0 });
    const s = await st(page), nav = await R(page, 'nav');
    check('portrait: no data-rot, no transform, guard hidden', s.rot === null && s.tf === 'none' && s.guard === 'none' && s.pos !== 'fixed', JSON.stringify(s));
    check('portrait: nav is a wide pill at the bottom', nav.w > nav.h * 3 && nav.bottom > 800 && nav.bottom <= 844, JSON.stringify(nav));
    check('portrait: #jkRoot is layout-transparent (display:contents)', await page.evaluate(() => getComputedStyle(document.getElementById('jkRoot')).display === 'contents'));
    await page.screenshot({ path: `${SHOTS}/lock-portrait-unchanged.png` }); await ctx.close(); }
  { // keyboard-shrunk portrait (~360x300 layout viewport reads as landscape); worst case: device reports angle 90 anyway.
    for (const a of [0, 90]) {
      const { page, ctx } = await phone({ width: 390, height: 300, angle: a });
      const s = await st(page);
      check(`keyboard-shrunk 390x300 (angle ${a}): app NOT rotated and NOT hidden`, s.tf === 'none' && s.guard === 'none' && s.navDisp === 'flex' && await page.evaluate(() => document.getElementById('page-home').offsetHeight > 0), JSON.stringify(s));
      await ctx.close(); } }
  { const { page, ctx } = await phone({ width: 1024, height: 768, angle: 90 });
    const s = await st(page);
    check('tablet landscape 1024x768 (portrait-natural, angle 90): untouched', s.tf === 'none' && s.guard === 'none' && s.pos !== 'fixed', JSON.stringify(s));
    await ctx.close(); }
  { const { page, ctx } = await phone({ width: 1000, height: 500, angle: 0 });
    const s = await st(page);
    check('short desktop window (angle 0): old rotate prompt, app hidden, NOT rotated', s.tf === 'none' && s.guard === 'flex' && s.navDisp === 'none', JSON.stringify(s));
    await ctx.close(); }
  // Fallbacks: no orientation info -> rotate prompt; screen.orientation-only browsers still lock.
  { const { page, ctx } = await phone({ width: 844, height: 390, angle: 'none' });
    const s = await st(page);
    check('no orientation API at all: falls back to the rotate prompt', s.rot === null && s.tf === 'none' && s.guard === 'flex' && s.navDisp === 'none', JSON.stringify(s));
    await page.screenshot({ path: `${SHOTS}/lock-fallback-guard.png` }); await ctx.close(); }
  for (const a of [90, 270]) {
    const { page, ctx } = await phone({ width: 844, height: 390, angle: a, via: 'so' });
    const s = await st(page);
    check(`screen.orientation.angle-only (${a}): locks in the same direction`, s.rot === String(a) && s.tf === (a === 90 ? 'matrix(0, -1, 1, 0, 0, 390)' : 'matrix(0, 1, -1, 0, 844, 0)') && s.guard === 'none', JSON.stringify(s));
    await ctx.close(); }
  // Live rotation via real CDP emulation: portrait -> landscape both ways -> portrait.
  { const { page, ctx, errors } = await phone({ width: 390, height: 844 });
    const cdp = await ctx.newCDPSession(page);
    const rot = async (w, h, angle, type) => { await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { angle, type } }); await page.waitForTimeout(250); return st(page); };
    const l90 = await rot(844, 390, 90, 'landscapePrimary'), l270 = await rot(844, 390, 270, 'landscapeSecondary'), p = await rot(390, 844, 0, 'portraitPrimary');
    check('live rotate: portrait -> 90 -> 270 -> portrait updates the lock each time', l90.rot === '90' && l90.tf.startsWith('matrix(0, -1') && l270.rot === '270' && l270.tf.startsWith('matrix(0, 1') && p.rot === null && p.tf === 'none', JSON.stringify([l90, l270, p]));
    check('live rotate: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }
}

await startServer();
await launch();
try {
  for (const s of [regression, workoutFlow, tapToClear, coward, consistency, jacked, monthly, narrowAndShots, pastPRs, prReconcile, portraitLock]) {
    try { await s(); } catch (e) { check(`${s.name}: suite crashed`, false, e.stack.split('\n').slice(0, 3).join(' ')); }
  }
} finally { await close(); stopServer(); }
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
