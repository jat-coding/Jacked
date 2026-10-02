// Jacked PWA browser suite: regression checks for the core flows plus the
// 2026-09-24 changes (tap-to-clear set inputs, monthly Coward-Maxing,
// Consistency-Maxing, Jacked). Screenshots go to $SHOTS (default /tmp/jk16/shots).
import fs from 'fs';
import { startServer, stopServer, launch, close, phone, check, results, wk, ex, days, LB, URL, pngPixel } from './harness.mjs';
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
  await run('3-month reset: streak back in June (over 3 months ago), nothing since -> not earned', [...days('2026-06-01', 7), '2026-09-14'].map(d => wk(d)), false);
  await run('3-month reset: streak in July (inside 3 months) -> earned', [...days('2026-07-01', 7), '2026-09-14'].map(d => wk(d)), true);
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
    check('jacked: needs 10 (6 tiered + PR + Consistency + Challenge + Comeback), permanent ones not counted', /10 \/ 10 badges · 6 \/ 6 at Gold/.test(j.detail) && !/\d+ \/ \d+/.test(j.desc), j.detail + ' | ' + j.desc);
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
    // Permanent badges are not required: only the Monthly-reset and 3-month-reset badges gate Jacked (PR and Consistency are 3-month now).
    const h = [...days('2026-09-01', 7).map(d => wk(d, [], { pr: true })), wk('2026-09-12', [ex('Barbell Bench Press', [[315, 1]]), ex('Barbell Squat', [[400, 5]]), ex('Barbell Overhead Press', [[185, 5]]), ex('Pull-up', [[0, 20]], 'bodyweight_reps'), ex('Push-up', [[0, 80]], 'bodyweight_reps'), ex('Run', [[1, 6]], 'distance')])];
    const { page, ctx } = await phone({ seed: { hist: h, bw: 180 / LB, monthBadges: MB_SEP }, now: SEP15 });
    const bs = await badges(page);
    const perm = ['1000lb Club', 'Variety-Maxing'].map(n => bs.find(b => b.name === n).earned);
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
    // mYm: numbers published this month by a v1.10.58+ build (monthOf ignores unstamped totals).
    const friends = [{ id: '@bob', code: '@bob', name: 'Bob', username: '@bob', pmVol: 50000, mYm: '2026-09' }, { id: '@amy', code: '@amy', name: 'Amy', username: '@amy', pmVol: 20000, mYm: '2026-09' }];
    const { page, ctx, errors } = await phone({ seed: { hist: [aug], friends }, now: SEP15 });
    await page.evaluate(() => { sp('leaderboard'); renderLB(); });
    await page.waitForTimeout(200);
    const crowned = await page.evaluate(() => [...crownCodes()]);
    check('crown: last month top lifter (Bob, 50000) wears it', crowned.length === 1 && crowned[0] === '@bob', JSON.stringify(crowned));
    const sub = await page.evaluate(() => [...crownCodes([yourStats(), { code: '@amy', pmVol: 20000, mYm: '2026-09' }])]);
    check('crown: a board crowns its own top lifter (Amy wins a board without Bob)', sub.length === 1 && sub[0] === '@amy', JSON.stringify(sub));
    const bobRow = page.locator('#page-leaderboard .fc, #page-leaderboard .lbi', { hasText: 'Bob' }).first();
    check('crown: winner shows the crown icon and NO gold glow (glow is for Jacked only)', (await bobRow.locator('svg').count()) >= 1 && (await page.locator('#page-leaderboard .gilded').count()) === 0, '');
    const ord = await bobRow.evaluate(r => { const n = [...r.querySelectorAll('div')].find(d => d.querySelector('svg') && /Bob/.test(d.textContent) && d.children.length >= 1 && d.firstElementChild.tagName === 'SPAN'); return n ? { crownFirst: !!n.firstElementChild.querySelector('svg'), txt: n.innerText.trim() } : null; });
    check('crown: sits before the name, not after', !!ord && ord.crownFirst && /^Bob/.test(ord.txt), JSON.stringify(ord));
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
    // Streak box only shows while a streak is live; at 0 days the calendar is the first thing on Home.
    const top = () => { const pg = document.getElementById('page-home'); const vis = [...pg.children].filter(e => e.offsetHeight > 0 && !e.classList.contains('ph')); return { streakShown: document.getElementById('streakBanner').offsetHeight > 0, first: vis[0] && (vis[0].className || vis[0].id) }; };
    const dead = await phone({ seed: { hist: [wk('2026-09-05'), wk('2026-09-06')] }, now: SEP15 });
    await dead.page.evaluate(() => renderHome());
    const d = await dead.page.evaluate(top);
    check('streak: hidden at 0 days even with a past best', !d.streakShown, JSON.stringify(d));
    check('streak: calendar is the top block on Home at 0 days', /cw/.test(d.first || ''), JSON.stringify(d));
    await dead.ctx.close();
    const live = await phone({ seed: { hist: [wk('2026-09-14'), wk('2026-09-15')] }, now: SEP15 });
    await live.page.evaluate(() => renderHome());
    const l = await live.page.evaluate(() => ({ ...(({ streakShown }) => ({ streakShown }))({ streakShown: document.getElementById('streakBanner').offsetHeight > 0 }), txt: document.getElementById('streakBanner').innerText }));
    check('streak: shows once a streak is live', l.streakShown && /2 days/.test(l.txt), JSON.stringify(l));
    await live.ctx.close();
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
    await page.evaluate(() => { sp('metrics'); openAch(); }); await page.waitForTimeout(300);
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
    await page.evaluate(() => { sp('metrics'); openAch(); }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const h = document.querySelector('#achFullBody .jh'); const rc = h.getBoundingClientRect(); return { has: true, cnt: document.querySelectorAll('#achFullBody [onclick="badgeInfo(\'Jacked\')"]').length, ht: rc.height, txt: h.innerText.trim(), icon: !!h.querySelector('svg') }; });
    check('hero: unlocked Jacked is a short crown + name box at the top, once, no description', r.cnt === 1 && r.ht < 70 && /^JACKED$/i.test(r.txt) && r.icon, JSON.stringify(r));
    const tx = await page.evaluate(() => { sp('metrics'); const m = document.querySelector('#page-metrics .pt').getBoundingClientRect(); const a = document.querySelector('#achFull .pt').getBoundingClientRect(); return { mx: m.left, ax: a.left, my: m.top, ay: a.top }; });
    check('title: Achievements is indented and level exactly like the Metrics title', Math.abs(tx.mx - tx.ax) < 0.5 && Math.abs(tx.my - tx.ay) < 0.5, JSON.stringify(tx));
    await page.screenshot({ path: `${SHOTS}/hero.png` });
    await ctx.close();
    const l = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await l.page.evaluate(() => { sp('metrics'); openAch(); }); await l.page.waitForTimeout(300);
    check('hero: locked Jacked still has its own box at the top (greyed, no shimmer), once, not in the list', await l.page.evaluate(() => { const h = document.querySelector('#achFullBody .jh'); return !!h && h.classList.contains('lock') && document.querySelector('#achFullBody').firstElementChild === h && getComputedStyle(h, '::after').display === 'none' && getComputedStyle(h.querySelector('.jh-t')).animationName === 'none' && document.querySelectorAll('#achFullBody [onclick="badgeInfo(\'Jacked\')"]').length === 1; }));
    await l.ctx.close();
  }
  {
    // Bodyweight moves (push-ups) log your own body weight; they must not win "Best lift" (Mr. Roni, 2026-09-25).
    const hist = [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]]), { ...ex('Pushups (bodyweight)', [[229, 50]]), equip: 'body only' }, ex('Pushups (bodyweight)', [[229, 60]], 'weight_reps', 'imported-push')])];
    const { page, ctx } = await phone({ seed: { hist, bw: 229 / LB }, now: new Date('2026-10-03T12:00:00-06:00') });
    const r = await page.evaluate(() => recapData(2026, 8).best);
    check('recap: bodyweight push-ups never count as the best lift', r && /bench/i.test(r.name), JSON.stringify(r));
    const sb = await page.evaluate(() => ['recapFull', 'badgeFull', 'achFull', 'qsModal'].map(id => { const e = document.getElementById(id); return getComputedStyle(e, '::-webkit-scrollbar').display + '/' + getComputedStyle(e).scrollbarWidth; }));
    check('popups: no visible scrollbar on recap, badge, achievements or sheets', sb.every(x => x === 'none/none'), JSON.stringify(sb));
    await ctx.close();
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
    await page.evaluate(() => { sp('metrics'); openAch(); }); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const out = []; document.querySelectorAll('#achFullBody .bgrp, #achFullBody [onclick^="badgeInfo("]').forEach(el => out.push(el.classList.contains('bgrp') ? '#' + el.textContent : el.getAttribute('onclick').slice(11, -2))); return out; });
    const idx = n => g.indexOf(n), lab = ['#Monthly reset', '#3-month reset', '#Permanent'].map(idx);
    check('groups: three grey labels in order (Monthly, 3-month, Permanent)', lab[0] >= 0 && lab[0] < lab[1] && lab[1] < lab[2], JSON.stringify(g));
    check('groups: Challenge/Comeback under Monthly (Coward hidden), tiered + PR + Consistency under 3-month, 1000lb/Variety under Permanent',
      ['Challenge-Maxing', 'Comeback-Maxing'].every(n => idx(n) > lab[0] && idx(n) < lab[1]) && idx('Coward-Maxing') < 0 &&
      ['Bench-Maxing', 'Shoulder-Maxing', 'Leg-Maxing', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing', 'PR-Maxing', 'Consistency-Maxing'].every(n => idx(n) > lab[1] && idx(n) < lab[2]) &&
      ['1000lb Club', 'Variety-Maxing'].every(n => idx(n) > lab[2]), JSON.stringify(g));
    await ctx.close();
    const l = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await l.page.evaluate(() => { sp('metrics'); openAch(); }); await l.page.waitForTimeout(300);
    const gl = await l.page.evaluate(() => [...document.querySelectorAll('#achFullBody .bgrp, #achFullBody [onclick^="badgeInfo("]')].map(el => el.classList.contains('bgrp') ? '#' + el.textContent : el.getAttribute('onclick').slice(11, -2)));
    const jt = await l.page.evaluate(() => { const j = computeBadges().find(b => b.name === 'Jacked'); badgeInfo('Jacked'); return [j.desc, document.getElementById('badgeFullBody').innerText]; });
    check('teaser: locked Jacked promises something special (list + popup)', /something special/i.test(jt[0]) && /reward/i.test(jt[1]) && /something special/i.test(jt[1]), JSON.stringify(jt));
    const ju = await phone({ seed: seed(), now: SEP15 });
    check('teaser: unlocked Jacked shows no reward teaser', await ju.page.evaluate(() => { badgeInfo('Jacked'); return !/something special/i.test(document.getElementById('badgeFullBody').innerText); }));
    await ju.ctx.close();
    check('groups: locked Jacked sits above every group, first on the page', gl[0] === 'Jacked' && gl.indexOf('#Monthly reset') === 1, JSON.stringify(gl));
    await l.ctx.close();
  }
  {
    // Shimmering tab titles while Jacked is held; plain when it is not.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => { renderHome(); sp('metrics'); openAch(); });
    const on = await page.evaluate(() => { const t = document.querySelector('#page-metrics .pt'); const cs = getComputedStyle(t); return { attr: document.documentElement.hasAttribute('data-jacked'), anim: cs.animationName, clip: cs.webkitBackgroundClip || cs.backgroundClip, ht: getComputedStyle(document.querySelector('#achFullBody .jh-t')).animationName }; });
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
    const has = async (o, now) => { const { page, ctx } = await phone({ seed: o, now }); await page.evaluate(() => { sp('metrics'); openAch(); }); await page.waitForTimeout(250); const r = await page.evaluate(() => !!document.querySelector('#achFullBody [onclick="badgeInfo(\'Coward-Maxing\')"]')); await ctx.close(); return r; };
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

async function achievementsPage() {
  const seed = (o) => ({ hist: allGoldHistory(o), bw: 180 / LB, monthBadges: MB_SEP });
  {
    // Metrics card is a short summary; the full list lives on its own page (Mr. Roni, 2026-09-24).
    const { page, ctx } = await phone({ seed: seed({ pullReps: 15 }), now: SEP15 });
    await page.evaluate(() => sp('metrics')); await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ rows: document.querySelectorAll('#page-metrics .agrow').length, txt: document.querySelector('#page-metrics .agrow').innerText.replace(/\s+/g, ' ').trim(), list: document.querySelectorAll('#page-metrics .bgrp').length, btn: !!document.querySelector('#page-metrics [onclick="openAch()"].btn'), n: computeBadges().filter(b => b.name !== 'Coward-Maxing' && !(b.name === 'Coward-Maxing')).length }));
    check('achievements card: a single tappable "N / M" bar, no group rows, no button, no list', m.rows === 1 && /^badges earned \d+ \/ \d+/i.test(m.txt) && m.list === 0 && !m.btn, JSON.stringify(m));
    await page.evaluate(() => document.querySelector('#page-metrics .agrow').click()); await page.waitForTimeout(300);
    const o = await page.evaluate(() => ({ open: document.getElementById('achFull').classList.contains('open'), rows: document.querySelectorAll('#achFullBody [onclick^="badgeInfo("]').length }));
    check('achievements: tapping the bar opens the full-screen page with every badge', o.open && o.rows === 13, JSON.stringify(o));
    await page.evaluate(() => badgeInfo('Bench-Maxing')); await page.waitForTimeout(200);
    const z = await page.evaluate(() => { const b = document.getElementById('badgeFull'), a = document.getElementById('achFull'); return +getComputedStyle(b).zIndex > +getComputedStyle(a).zIndex && b.classList.contains('open'); });
    check('achievements: badge popup opens on top of the full page', z);
    await page.evaluate(() => { closeBadgeFull(); closeAch(); });
    check('achievements: closing hides the page', await page.evaluate(() => !document.getElementById('achFull').classList.contains('open')));
    await ctx.close();
  }
  {
    // "Take me to the workout" button in the badge popup.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => sp('metrics')); await page.waitForTimeout(200);
    await page.evaluate(() => badgeInfo('Bench-Maxing')); await page.waitForTimeout(150);
    const lab = await page.evaluate(() => { const b = document.getElementById('badgeStartBtn'); return [b.style.display, b.textContent]; });
    check('badge button: bench popup shows a start-workout button', lab[0] !== 'none' && /bench/i.test(lab[1]), JSON.stringify(lab));
    await page.evaluate(() => badgeStart()); await page.waitForTimeout(400);
    const w = await page.evaluate(() => ({ aw: !!aw, ex: aw ? aw.exercises.map(e => e.name) : [], pop: document.getElementById('badgeFull').classList.contains('open') }));
    check('badge button: starts a workout with a barbell bench press, popup closed', w.aw && w.ex.some(n => /bench/i.test(n)) && !w.pop, JSON.stringify(w));
    await page.evaluate(() => badgeInfo('Variety-Maxing')); await page.waitForTimeout(150);
    const v = await page.evaluate(() => document.getElementById('badgeStartBtn').textContent);
    check('badge button: Variety opens the library', /library/i.test(v), v);
    const none = await page.evaluate(() => ['PR-Maxing', 'Consistency-Maxing', 'Coward-Maxing', 'Jacked', 'Comeback-Maxing'].map(n => { badgeInfo(n); return [n, document.getElementById('badgeStartBtn').style.display]; }));
    check('badge button: hidden on badges with no specific workout', none.every(x => x[1] === 'none'), JSON.stringify(none));
    const jr = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = achRow(computeBadges().find(b => b.name === 'Jacked')); document.body.appendChild(d); const t = d.innerText; const n = d.querySelector('div[style*="font-size:22px"]'); d.remove(); return { t, big: !!n }; });
    check('Jacked row: just the word, larger, no message under it', /Jacked/.test(jr.t) && !/something special/i.test(jr.t) && jr.big, JSON.stringify(jr));
    const jk = await page.evaluate(() => { badgeInfo('Jacked'); return document.getElementById('badgeFullBody').innerText; });
    check('Jacked popup: generic wording, no lift/cardio list', /every tiered badge at Gold/.test(jk) && !/six lift/.test(jk), jk);
    await ctx.close();
  }
  {
    // Comeback popup: two clear sections instead of a wall of maths.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => badgeInfo('Comeback-Maxing')); await page.waitForTimeout(150);
    const t = await page.locator('#badgeFullBody').innerText();
    check('comeback popup: Steady and Bounce back sections with this-month / last-month rows', /Steady/.test(t) && /Bounce back/.test(t) && /Sessions this month/.test(t) && /Sessions last month/.test(t) && /Days trained this month/.test(t), t);
    const pr = await page.evaluate(() => { badgeInfo('PR-Maxing'); return document.getElementById('badgeFullBody').innerText; });
    check('PR-Maxing popup: 3-month reset note + highest ever', /Resets every 3 months/.test(pr) && /Highest ever/i.test(pr) && /days? in a row/.test(pr), pr);
    await ctx.close();
  }
  {
    // Closed sections are added back from the Reorder popup, not the bottom of the page.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => { sp('metrics'); toggleCard('lifetime'); }); await page.waitForTimeout(200);
    const n0 = await page.evaluate(() => ({ bar: !!document.getElementById('hiddenCardsBar'), cards: document.querySelectorAll('#metricsCards .metric-card').length }));
    await page.evaluate(() => openCardOrder()); await page.waitForTimeout(150);
    const chip = await page.evaluate(() => [...document.querySelectorAll('#cardHiddenList .chip')].map(e => e.textContent));
    check('reorder popup: a closed section is listed there, nothing at the bottom of the page', !n0.bar && chip.length === 1 && /Lifetime/i.test(chip[0]), JSON.stringify([n0, chip]));
    await page.locator('#cardHiddenList .chip').first().click(); await page.waitForTimeout(150);
    const n1 = await page.evaluate(() => ({ cards: document.querySelectorAll('#metricsCards .metric-card').length, left: document.querySelectorAll('#cardHiddenList .chip').length, listed: document.querySelectorAll('#cardOrderList [data-id]').length }));
    check('reorder popup: tapping it adds the section back and it joins the order list', n1.cards === n0.cards + 1 && n1.left === 0 && n1.listed === n1.cards, JSON.stringify(n1));
    await ctx.close();
  }
  {
    // Leaderboards title carries a small crown key at the far right.
    const { page, ctx } = await phone({ seed: seed(), now: SEP15 });
    await page.evaluate(() => { sp('leaderboard'); renderLB(); }); await page.waitForTimeout(250);
    const n = await page.evaluate(() => { const st = document.querySelector('#compareBoard .blk-head'), k = st.lastElementChild, a = st.getBoundingClientRect(), b = k.getBoundingClientRect(), t = st.firstElementChild.getBoundingClientRect(); return { txt: k.textContent.trim(), svg: !!k.querySelector('svg'), right: Math.abs(a.right - b.right) < 2, after: b.left > t.right, inside: b.right <= document.documentElement.clientWidth }; });
    check('leaderboards: crown + "Last month\'s winner" note at the far right of the title', /Last month's winner/.test(n.txt) && n.svg && n.right && n.after && n.inside, JSON.stringify(n));
    await page.evaluate(() => document.querySelector('#compareBoard .blk-head').lastElementChild.click()); await page.waitForTimeout(200);
    const pop = await page.evaluate(() => ({ open: document.getElementById('confirmModal').classList.contains('open'), t: document.getElementById('cfMsg').textContent, cancel: getComputedStyle(document.getElementById('cfCancel')).display }));
    check('leaderboards: tapping the crown key opens a description popup (last month\'s weight lifted)', pop.open && /last month/i.test(pop.t) && /weight lifted/i.test(pop.t) && pop.cancel === 'none', JSON.stringify(pop));
    await page.evaluate(() => _cfDone(null));
    const jm = await page.evaluate(() => [hasJacked({ badgeList: [{ n: 'Jacked', t: '', e: 'crown|#ffd700' }] }), hasJacked({ badgeList: [{ n: 'Bench-Maxing', t: 'gold', e: 'dumbbell|#ffd700' }] }), hasJacked({})]);
    check('leaderboards: hasJacked true only for a friend holding the badge', jm[0] === true && jm[1] === false && jm[2] === false, JSON.stringify(jm));
    await page.evaluate(() => { const f = [{ id: '@bob', code: '@bob', name: 'Bob', username: '@bob', pmVol: 0, badgeList: [{ n: 'Jacked', t: '', e: 'crown|#ffd700' }] }, { id: '@dan', code: '@dan', name: 'Dan', username: '@dan', pmVol: 0, badgeList: [] }]; window.friendSrc = () => f; renderLB(); });
    await page.waitForTimeout(150);
    const gl = await page.evaluate(() => ({ glow: [...document.querySelectorAll('#page-leaderboard .gilded')].map(e => e.innerText.slice(0, 20)), pill: /JACKED/.test(document.getElementById('page-leaderboard').innerText) }));
    check('leaderboards: Jacked friend gets the glow row, no JACKED pill', gl.glow.length === 1 && /Bob/.test(gl.glow[0]) && !gl.pill, JSON.stringify(gl));
    const tile = await page.evaluate(() => { openFriend('@bob'); const t1 = document.body.innerText; const gold = [...document.querySelectorAll('div')].some(d => d.children.length === 0 && d.textContent === 'Jacked' && getComputedStyle(d).color === 'rgb(255, 215, 0)'); openFriend('@dan'); return { bob: !/Certified/i.test(t1) && gold }; });
    check('friend page: Jacked friend shows a "Jacked" tile (not "Certified")', tile.bob === true, JSON.stringify(tile));
    await ctx.close();
  }
}

async function narrowAndShots() {
  const h = allGoldHistory({ pullReps: 15 });   // Consistency earned, Jacked locked -> both visible
  for (const width of [320, 390]) {
    const { page, ctx } = await phone({ width, height: width === 320 ? 640 : 844, seed: { hist: h, bw: 180 / LB }, now: SEP15 });
    await page.evaluate(() => sp('metrics'));
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`narrow ${width}px: no horizontal overflow`, over <= 0, 'overflow px=' + over);
    await page.evaluate(() => openAch()); await page.waitForTimeout(250);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#achFullBody [onclick^="badgeInfo("]')].map(el => { const r = el.getBoundingClientRect(); return { r: r.right, w: el.scrollWidth - el.clientWidth }; }));
    check(`narrow ${width}px: every badge row fits the screen`, rows.length === 13 && rows.every(x => x.r <= width + 0.5 && x.w <= 0), JSON.stringify(rows.filter(x => x.r > width || x.w > 0)));
    if (width === 390) {
      await page.locator('#achFullBody [onclick="badgeInfo(\'Consistency-Maxing\')"]').evaluate(el => el.scrollIntoView({ block: 'center' }));
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
  // Routine sections (2026-09-29): grouping, alphabetical default, section CRUD,
  // and the extended drag machinery -- section headers reorder, routines reorder
  // within their own section, cross-section drag is not attempted (not required).
  { const cex = [
      { id: 'cexChest', name: 'Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
      { id: 'cexBack', name: 'Row', muscle: 'back', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
    ];
    const routines = [
      { id: 'rA', name: 'Push Day', desc: '', exercises: ['cexChest'] },
      { id: 'rB', name: 'Bench Day', desc: '', exercises: ['cexChest'] },
      { id: 'rC', name: 'Pull Day', desc: '', exercises: ['cexBack'] },
      { id: 'rD', name: 'Row Day', desc: '', exercises: ['cexBack'] },
    ];
    const { page, ctx, errors } = await phone({ seed: { cex, routines } });
    // Force the migration synchronously instead of waiting on the app's own DB-load-gated
    // boot timer -- these are custom exercises, so classification doesn't depend on the DB.
    await page.evaluate(() => migrateRoutineSections());
    await page.evaluate(() => sp('routines')); await page.waitForTimeout(150);

    const secNames0 = await page.evaluate(() => [...document.querySelectorAll('#routinesList .rsec')].map(e => e.querySelector('.blk-t').textContent.trim()));
    check('sections: auto-suggest grouped routines into Chest and Back', JSON.stringify(secNames0) === JSON.stringify(['Chest', 'Back']), JSON.stringify(secNames0));
    const mainOrder0 = await page.evaluate(() => [...document.querySelectorAll('#routinesList .rc .rn')].map(e => e.textContent.trim()));
    check('sections: routines list alphabetical within each section by default', JSON.stringify(mainOrder0) === JSON.stringify(['Bench Day', 'Push Day', 'Pull Day', 'Row Day']), JSON.stringify(mainOrder0));
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/routine-sections.png`, fullPage: true });

    await page.evaluate(() => openRoutineOrder()); await page.waitForTimeout(150);
    const secNamesM0 = await page.evaluate(() => [...document.querySelectorAll('#routineOrderList > [data-id]')].map(e => e.querySelector('.rosec-name').textContent.trim()));
    check('routine reorder modal: sections listed Chest then Back (creation order)', JSON.stringify(secNamesM0) === JSON.stringify(['Chest', 'Back']), JSON.stringify(secNamesM0));
    const chestSecId = await page.evaluate(() => gRS()[0].id), backSecId = await page.evaluate(() => gRS()[1].id);
    const chestIds0 = await page.evaluate(id => [...document.querySelectorAll(`#secROList-${id} [data-id]`)].map(e => e.dataset.id), chestSecId);
    check('routine reorder modal: Chest routines alphabetical (Bench Day, Push Day)', JSON.stringify(chestIds0) === JSON.stringify(['rB', 'rA']), JSON.stringify(chestIds0));
    const backIds0 = await page.evaluate(id => [...document.querySelectorAll(`#secROList-${id} [data-id]`)].map(e => e.dataset.id), backSecId);
    check('routine reorder modal: Back routines alphabetical (Pull Day, Row Day)', JSON.stringify(backIds0) === JSON.stringify(['rC', 'rD']), JSON.stringify(backIds0));

    // Drag within the Chest section: swap Bench Day / Push Day.
    const h = await page.locator(`#secROList-${chestSecId} .cdrag`).first().boundingBox();
    const rows = await page.evaluate(id => [...document.querySelectorAll(`#secROList-${id} [data-id]`)].slice(0, 2).map(e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; }), chestSecId);
    const step = rows[1].t - rows[0].t;
    const cx = h.x + h.width / 2, cy = h.y + h.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx, cy + step * 0.6, { steps: 4 }); await page.mouse.move(cx, cy + step * 1.3, { steps: 4 });
    await page.mouse.up(); await page.waitForTimeout(200);
    const chestIds1 = await page.evaluate(id => [...document.querySelectorAll(`#secROList-${id} [data-id]`)].map(e => e.dataset.id), chestSecId);
    check('routine reorder modal: drag moves Push Day above Bench Day within Chest', JSON.stringify(chestIds1) === JSON.stringify(['rA', 'rB']), JSON.stringify(chestIds1));
    const chestOrderSaved = await page.evaluate(id => gRS().find(s => s.id === id).order, chestSecId);
    check('routine reorder modal: manual within-section order persisted', JSON.stringify(chestOrderSaved) === JSON.stringify(['rA', 'rB']), JSON.stringify(chestOrderSaved));
    const backOrderUntouched = await page.evaluate(id => gRS().find(s => s.id === id).order, backSecId);
    check('routine reorder modal: dragging one section does not touch another', backOrderUntouched === null, JSON.stringify(backOrderUntouched));

    // Drag the Chest section header below Back.
    const h2 = await page.locator('#routineOrderList .sec-cdrag').first().boundingBox();
    const secBoxes = await page.evaluate(() => [...document.querySelectorAll('#routineOrderList > [data-id]')].map(e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom }; }));
    const stepSec = secBoxes[1].t - secBoxes[0].t;
    const cx2 = h2.x + h2.width / 2, cy2 = h2.y + h2.height / 2;
    await page.mouse.move(cx2, cy2); await page.mouse.down();
    await page.mouse.move(cx2, cy2 + stepSec * 0.6, { steps: 4 }); await page.mouse.move(cx2, cy2 + stepSec * 1.3, { steps: 4 });
    await page.mouse.up(); await page.waitForTimeout(250);
    const secNamesM1 = await page.evaluate(() => [...document.querySelectorAll('#routineOrderList > [data-id]')].map(e => e.querySelector('.rosec-name').textContent.trim()));
    check('routine reorder modal: drag moves Back above Chest', JSON.stringify(secNamesM1) === JSON.stringify(['Back', 'Chest']), JSON.stringify(secNamesM1));
    const secOrderSaved = await page.evaluate(() => gRS().map(s => s.name));
    check('routine reorder modal: section order persisted to storage', JSON.stringify(secOrderSaved) === JSON.stringify(['Back', 'Chest']), JSON.stringify(secOrderSaved));

    await page.evaluate(() => cm('routineOrderModal'));
    // textContent, not innerText: .blk-t renders section names UPPERCASE via CSS, textContent doesn't.
    const secNamesMain = () => page.evaluate(() => [...document.querySelectorAll('#routinesList .rsec .blk-t')].map(e => e.textContent.trim()));
    const routineNamesMain = () => page.evaluate(() => [...document.querySelectorAll('#routinesList .rc .rn')].map(e => e.textContent.trim()));
    check('sections: My routines list reflects the new section order', JSON.stringify(await secNamesMain()) === JSON.stringify(['Back', 'Chest']), JSON.stringify(await secNamesMain()));
    const routineOrderNames = await routineNamesMain();
    check('sections: My routines list reflects the new in-section order', routineOrderNames.indexOf('Push Day') < routineOrderNames.indexOf('Bench Day'), JSON.stringify(routineOrderNames));

    // Inline rename + add section.
    await page.evaluate(id => renameSection(id, 'Push/Pull'), backSecId);
    const secNamesRenamed = await secNamesMain();
    check('sections: inline rename persists and re-renders', secNamesRenamed.includes('Push/Pull') && !secNamesRenamed.includes('Back'), JSON.stringify(secNamesRenamed));
    await page.evaluate(() => addSectionPrompt());
    await page.waitForTimeout(100);
    await page.fill('#cfInput', 'Cardio');
    await page.click('#cfOk');
    await page.waitForTimeout(100);
    const cardioExists = await page.evaluate(() => gRS().some(s => s.name === 'Cardio'));
    check('sections: "+ Section" creates a new (empty) section', cardioExists);

    // "+ Section" lives inside the Reorder popup (moved out of the My routines header,
    // Mr. Roni 2026-09-30) -- creating one there must show up in the drag list live,
    // without closing/reopening the modal.
    await page.evaluate(() => openRoutineOrder()); await page.waitForTimeout(150);
    const secCountBefore = await page.evaluate(() => document.querySelectorAll('#routineOrderList > [data-id]').length);
    await page.evaluate(() => addSectionPrompt());
    await page.waitForTimeout(100);
    await page.fill('#cfInput', 'Mobility');
    await page.click('#cfOk');
    await page.waitForTimeout(100);
    const modalStillOpen = await page.evaluate(() => document.getElementById('routineOrderModal').classList.contains('open'));
    check('routine reorder modal: stays open after adding a section from inside it', modalStillOpen);
    const secNamesAfterAdd = await page.evaluate(() => [...document.querySelectorAll('#routineOrderList > [data-id]')].map(e => e.querySelector('.rosec-name').textContent.trim()));
    check('routine reorder modal: "+ Section" adds the new section to the live drag list without reopening', secNamesAfterAdd.length === secCountBefore + 1 && secNamesAfterAdd.includes('Mobility'), JSON.stringify(secNamesAfterAdd));
    await page.evaluate(() => cm('routineOrderModal'));

    check('sections: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }

  // Routine sections collapsible (2026-09-30): whole header row toggles, chevron rotates,
  // collapsed state hides the section's routine cards and persists across a reload; renaming
  // a section (contenteditable title, onblur) still works -- a click landing on the title
  // itself must not be swallowed as a collapse toggle.
  { const cex = [{ id: 'cexChestC', name: 'Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }];
    const routines = [{ id: 'rC1', name: 'Push Day', desc: '', exercises: ['cexChestC'] }];
    const { page, ctx, errors } = await phone({ seed: { cex, routines } });
    await page.evaluate(() => migrateRoutineSections());
    await page.evaluate(() => sp('routines')); await page.waitForTimeout(150);

    const secId = await page.evaluate(() => gRS()[0].id);
    const cardCount0 = await page.evaluate(() => document.querySelectorAll('#routinesList .rsec .rc').length);
    check('collapsible: section starts expanded with its routine card visible', cardCount0 === 1, cardCount0);
    const chevRot0 = await page.evaluate(() => getComputedStyle(document.querySelector('#routinesList .rsec .blk-chev')).transform);

    // Tap the header row itself (not the title) to collapse.
    await page.evaluate(() => document.querySelector('#routinesList .rsec .blk-head').click());
    await page.waitForTimeout(50);
    const collapsedNow = await page.evaluate(() => document.querySelector('#routinesList .rsec').classList.contains('collapsed'));
    const cardsHidden = await page.evaluate(() => document.querySelectorAll('#routinesList .rsec .rc').length);
    check('collapsible: tapping the header row collapses the section and hides its routine card', collapsedNow && cardsHidden === 0, JSON.stringify({ collapsedNow, cardsHidden }));
    const chevRot1 = await page.evaluate(() => getComputedStyle(document.querySelector('#routinesList .rsec .blk-chev')).transform);
    check('collapsible: chevron glyph rotates to show the collapsed state', chevRot1 !== chevRot0, JSON.stringify({ chevRot0, chevRot1 }));
    const storedCollapsed = await page.evaluate(() => S.g('collapsedSections'));
    check('collapsible: collapsed section id saved under collapsedSections', Array.isArray(storedCollapsed) && storedCollapsed.length === 1, JSON.stringify(storedCollapsed));

    // Reload the page (simulates a later visit) -- collapsed state must persist.
    await page.reload();
    await page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex');
    await page.evaluate(() => sp('routines')); await page.waitForTimeout(150);
    const collapsedAfterReload = await page.evaluate(() => document.querySelector('#routinesList .rsec').classList.contains('collapsed'));
    const cardsAfterReload = await page.evaluate(() => document.querySelectorAll('#routinesList .rsec .rc').length);
    check('collapsible: collapsed state persists across a reload', collapsedAfterReload && cardsAfterReload === 0, JSON.stringify({ collapsedAfterReload, cardsAfterReload }));

    // Tap again to expand.
    await page.evaluate(() => document.querySelector('#routinesList .rsec .blk-head').click());
    await page.waitForTimeout(50);
    const expandedAgain = await page.evaluate(() => !document.querySelector('#routinesList .rsec').classList.contains('collapsed'));
    const cardsExpanded = await page.evaluate(() => document.querySelectorAll('#routinesList .rsec .rc').length);
    check('collapsible: tapping the header row again expands the section', expandedAgain && cardsExpanded === 1, JSON.stringify({ expandedAgain, cardsExpanded }));

    // Renaming the section must still work post-change.
    await page.evaluate(id => renameSection(id, 'Chest Renamed'), secId);
    const nameAfterRename = await page.evaluate(() => document.querySelector('#routinesList .rsec .blk-t').textContent.trim());
    const stillExpandedAfterRename = await page.evaluate(() => !document.querySelector('#routinesList .rsec').classList.contains('collapsed'));
    check('collapsible: renaming a section still works and does not toggle collapse', nameAfterRename === 'Chest Renamed' && stillExpandedAfterRename, JSON.stringify({ nameAfterRename, stillExpandedAfterRename }));

    // A click landing directly on the editable title (not the row background) must not
    // collapse the section -- it has to reach the contenteditable for focus/editing instead.
    await page.evaluate(() => document.querySelector('#routinesList .rsec .blk-t').click());
    await page.waitForTimeout(50);
    const stillExpandedAfterTitleClick = await page.evaluate(() => !document.querySelector('#routinesList .rsec').classList.contains('collapsed'));
    check('collapsible: clicking the editable title itself does not collapse the section', stillExpandedAfterTitleClick);

    check('collapsible: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }

  // Routine sections: auto-suggest at save time, section-picker override, and the
  // one-time migration of legacy routines saved before sections existed.
  { const cexLegs = { id: 'cexLegs', name: 'Squat', muscle: 'legs', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true };
    const { page, ctx, errors } = await phone({ seed: { cex: [cexLegs] } });
    await page.evaluate(() => { openCR(); document.getElementById('rName').value = 'Squat Day'; rExs.push('cexLegs'); });
    const defaultSel = await page.evaluate(() => document.getElementById('rSection').value);
    check('routine picker: new routine defaults to Auto-suggest', defaultSel === '', defaultSel);
    await page.evaluate(() => saveR());
    const savedLegs = await page.evaluate(() => gR().find(r => r.name === 'Squat Day'));
    const legsSecName = await page.evaluate(id => (gRS().find(s => s.id === id) || {}).name, savedLegs.sectionId);
    check('saveR(): auto-suggests the Legs section from the routine\'s exercises', legsSecName === 'Legs', legsSecName);

    const chestId = await page.evaluate(() => findOrCreateSection('Chest'));
    await page.evaluate(() => { openCR(); document.getElementById('rName').value = 'Odd One'; rExs.push('cexLegs'); });
    await page.evaluate(id => { document.getElementById('rSection').value = id; }, chestId);
    await page.evaluate(() => saveR());
    const savedOdd = await page.evaluate(() => gR().find(r => r.name === 'Odd One'));
    check('routine picker: explicit section choice overrides the auto-suggestion', savedOdd.sectionId === chestId, savedOdd.sectionId);

    // "+ New section..." from inside the edit-routine modal.
    await page.evaluate(() => { openCR(); document.getElementById('rName').value = 'New Sec Day'; });
    await page.evaluate(() => { document.getElementById('rSection').value = '__new__'; document.getElementById('rSection').dispatchEvent(new Event('change')); });
    await page.waitForTimeout(100);
    await page.fill('#cfInput', 'Cardio Blast');
    await page.click('#cfOk');
    await page.waitForTimeout(100);
    const pickedNewTxt = await page.evaluate(() => document.getElementById('rSection').selectedOptions[0].textContent);
    check('routine picker: "+ New section" creates and selects it', pickedNewTxt === 'Cardio Blast', pickedNewTxt);
    await page.evaluate(() => saveR());
    const savedNew = await page.evaluate(() => gR().find(r => r.name === 'New Sec Day'));
    const newSecName = await page.evaluate(id => (gRS().find(s => s.id === id) || {}).name, savedNew.sectionId);
    check('routine picker: routine saved into the section created via the picker', newSecName === 'Cardio Blast', newSecName);

    // Editing an already-sectioned routine defaults the picker to its current section
    // (does not silently re-suggest and move it).
    await page.evaluate(() => editR(gR().find(r => r.name === 'Squat Day').id));
    const editSel = await page.evaluate(() => document.getElementById('rSection').value);
    check('routine picker: editing preselects the routine\'s current section', editSel === savedLegs.sectionId, editSel);
    await page.evaluate(() => saveR());
    const reSaved = await page.evaluate(() => gR().find(r => r.name === 'Squat Day'));
    check('saveR(): re-saving without touching the picker keeps the same section', reSaved.sectionId === savedLegs.sectionId);
    check('routine picker: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }

  { // Migration: routines saved before this feature (no sectionId at all) get filed
    // into a sane section on first load, with no crash and no data loss.
    const routines = [{ id: 'legacy1', name: 'Legacy A', desc: '', exercises: [] }, { id: 'legacy2', name: 'Legacy B', desc: '', exercises: [] }];
    const { page, ctx, errors } = await phone({ seed: { routines } });
    for (let i = 0; i < 50; i++) { if (await page.evaluate(() => gR().every(r => r.sectionId))) break; await page.waitForTimeout(100); }
    const migrated = await page.evaluate(() => gR().map(r => ({ name: r.name, sectionId: r.sectionId })));
    check('migration: every legacy routine gets a sectionId', migrated.every(r => r.sectionId), JSON.stringify(migrated));
    const resolves = await page.evaluate(ids => { const s = gRS(); return ids.every(id => s.some(x => x.id === id)); }, migrated.map(r => r.sectionId));
    check('migration: assigned sectionIds resolve to real sections', resolves);
    const names = await page.evaluate(() => gR().map(r => r.name).sort());
    check('migration: no data loss -- both legacy routines still present', JSON.stringify(names) === JSON.stringify(['Legacy A', 'Legacy B']), JSON.stringify(names));
    await page.evaluate(() => sp('routines'));
    check('migration: routines tab renders with no crash', await page.locator('#page-routines').isVisible());
    check('migration: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }

  { // Routines added via "Add to Routines" (Trusted Programs) must get a real
    // sectionId immediately, not fall into the orphan bucket until next reload.
    const { page, ctx, errors } = await phone({});
    await page.evaluate(() => addCurated(0));
    await page.waitForTimeout(150);
    const added = await page.evaluate(() => gR());
    check('addCurated(): adds at least one routine', added.length > 0, String(added.length));
    const bad = await page.evaluate(() => gR().filter(r => !r.sectionId || !gRS().some(s => s.id === r.sectionId)));
    check('addCurated(): every added routine gets a real sectionId immediately', bad.length === 0, JSON.stringify(bad));
    check('addCurated(): no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close(); }
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

async function suggestions() {
  // "Suggested today" ranks by days since last trained: what he did yesterday must not appear,
  // and every button must match its row (no "Start Chest" under Arms).
  const m = (name, muscle, id) => ({ ...ex(name, [[100, 8]], 'weight_reps', id), muscle });
  const hist = [
    wk('2026-09-24', [m('Bench', 'chest', 'e-bench'), m('Curl', 'biceps', 'e-curl')]),
    wk('2026-09-22', [m('Core A', 'abdominals', 'e-core')]),
    wk('2026-09-21', [m('Row', 'lats', 'e-row')]),
    wk('2026-09-20', [m('Hip thrust', 'glutes', 'e-hip')]),
    wk('2026-09-18', [m('Press', 'shoulders', 'e-ohp')]),
    wk('2026-09-15', [m('Squat', 'quadriceps', 'e-squat'), m('Leg press', 'quadriceps', 'e-lp')]),
  ];
  const routines = [{ id: 'r1', name: 'Chest 2', desc: '', exercises: ['e-bench'] }, { id: 'r2', name: 'Push', desc: '', exercises: ['e-bench', 'e-ohp', 'e-curl'] }];
  const { page, ctx, errors } = await phone({ seed: { hist, routines }, now: new Date('2026-09-25T19:14:00-06:00') });
  await page.evaluate(() => { S.s('suggestDismiss', ''); renderSuggest(); });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#suggestCard > div > div[style*="border-top"]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()).filter(t => !/Trusted pick/i.test(t)));
  const txt = rows.join(' | ');
  check('suggestions: top 3 are the longest gaps (legs, shoulders, glutes)', /^Legs/.test(rows[0]) && /^Shoulders/.test(rows[1]) && /^Glutes/.test(rows[2]), txt);
  check('suggestions: chest/arms trained yesterday are not suggested', !/Chest|Arms/.test(txt.replace(/Chest 2/g, '')) , txt);
  check('suggestions: never a mismatched routine button (no routine covers legs)', !/Start (Chest|Push)/.test(txt), txt);
  await page.locator('#suggestCard button', { hasText: /^Start$/ }).first().click();
  const w = await page.evaluate(() => aw && { name: aw.name, ex: aw.exercises.map(e => e.exId) });
  check('suggestions: no-routine Start seeds the group\'s own most-done exercises', w && w.name === 'Legs' && w.ex.includes('e-squat') && w.ex.includes('e-lp'), JSON.stringify(w));
  check('suggestions: starting it saved no routine', (await page.evaluate(() => gR().length)) === 2);
  check('suggestions: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function suggestTrained() {
  // "Suggested today" must know what a workout trained even when the stored muscle is the
  // primary only (squat = quads) or blank. Mr. Roni 2026-09-25: Glutes showed 134d while he
  // leg-pressed/squatted every week. Leg day logged 9/19 at 10:30pm Denver = 9/20 UTC.
  const lift = (id, name, muscle) => ({ ...ex(name, [[135, 8]], 'weight_reps', id), muscle });
  const at = (d, h, exs, extra = {}) => ({ ...wk(d, exs), date: new Date(`${d}T${h}:00-06:00`).toISOString(), ...extra });
  const cex = [{ id: 'cexAb', name: 'Torso Machine', muscle: 'abdominals', equip: 'machine', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }];
  const hist = [
    at('2026-09-24', '18:00', [lift('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press', 'chest'), lift('Barbell_Curl', 'Curl', 'biceps')]),
    at('2026-09-23', '18:00', [lift('Pullups', 'Pullups', 'lats'), lift('Side_Lateral_Raise', 'Lateral Raise', 'shoulders')]),
    at('2026-09-22', '18:00', [{ ...lift('cexAb', '', ''), name: '' }]),                  // blank stored muscle AND name
    at('2026-09-19', '22:30', [lift('Barbell_Full_Squat', 'Full Squat (barbell)', 'quadriceps'), lift('Romanian_Deadlift', 'Romanian Deadlift (barbell)', 'hamstrings')]),
    at('2026-05-14', '14:00', [lift('imp_hip_abduction_machine_', 'Hip Abduction (Machine)', 'glutes')]),
  ];
  const routines = [{ id: 'rLegs', name: 'Legs', desc: '', exercises: ['Barbell_Full_Squat'] }];
  const { page, ctx, errors } = await phone({ seed: { hist, cex, routines }, now: new Date('2026-09-25T23:38:00-06:00') });
  const rowsNow = async () => { await page.evaluate(() => { S.s('suggestDismiss', ''); renderSuggest(); });
    return page.evaluate(() => [...document.querySelectorAll('#suggestCard > div > div[style*="border-top"]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()).filter(t => !/Trusted pick/i.test(t))); };
  // Without the exercise library (offline / still loading): names alone must carry squat + RDL.
  await page.evaluate(async () => { for (let i = 0; i < 100 && dbLoading; i++) await new Promise(r => setTimeout(r, 100)); window._db = allDB; allDB = []; });
  let rows = await rowsNow(), txt = rows.join(' | ');
  check('suggest-trained: squat + RDL day marks Legs trained (6d, not the UTC day)', rows.some(r => /^Legs · 6d since last/.test(r)), txt);
  check('suggest-trained: squat + RDL day marks Glutes trained too (6d, not 134d)', rows.some(r => /^Glutes · 6d since last/.test(r)), txt);
  check('suggest-trained: blank stored muscle still counts via the library (Core 3d)', rows.some(r => /^Core · 3d since last/.test(r)), txt);
  // With the exercise-db entry: secondary glutes on a lift whose NAME says nothing about glutes.
  await page.evaluate(() => { allDB = [...window._db.filter(e => e.id !== 'Zz_Hinge'), { id: 'Zz_Hinge', name: 'Zz Hinge', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'lower back'], equipment: 'barbell', images: [] },
    { id: 'Zz_Core', name: 'Zz Brace', primaryMuscles: ['abdominals'], secondaryMuscles: [], equipment: 'body only', images: [] }]; });
  const g = await page.evaluate(() => ({
    hinge: [...exGroups({ exId: 'Zz_Hinge', name: 'Zz Hinge', muscle: 'hamstrings' })].sort(),
    blankDb: [...exGroups({ exId: 'Zz_Core', name: '', muscle: '' })],
    chest: [...exGroups({ exId: 'Dips_-_Chest_Version', name: 'Dips', muscle: 'chest' })],
    calf: [...exGroups({ exId: 'x', name: 'Calf Press On The Leg Press Machine', muscle: 'calves' })].sort(),
    routine: [...exGroups({ exId: 'mystery', name: 'Thing', muscle: '' }, { routineId: 'rLegs', name: 'Quick Workout' })],
    cardio: [...exGroups({ exId: 'cexRun', name: 'Run', muscle: 'Cardio', tracking: 'distance' }, { routineId: 'rLegs' })],
  }));
  check('suggest-trained: exercise-db secondary glutes count', JSON.stringify(g.hinge) === '["glutes","legs"]', JSON.stringify(g.hinge));
  check('suggest-trained: blank stored muscle resolves from exercise-db primary', JSON.stringify(g.blankDb) === '["core"]', JSON.stringify(g.blankDb));
  check('suggest-trained: chest secondaries do not mark arms/shoulders', JSON.stringify(g.chest) === '["chest"]', JSON.stringify(g.chest));
  check('suggest-trained: calf press on the leg press is legs, not glutes', JSON.stringify(g.calf) === '["legs"]', JSON.stringify(g.calf));
  check('suggest-trained: unknown exercise falls back to its routine (Legs)', JSON.stringify(g.routine) === '["legs"]', JSON.stringify(g.routine));
  check('suggest-trained: cardio in a leg routine is not counted as legs', g.cardio.length === 0, JSON.stringify(g.cardio));
  // Calendar days, both sides local: a date-only key is that local day, 11:38pm is still "today".
  const k = await page.evaluate(() => ({ d: dayKey('2026-09-19'), iso: dayKey('2026-09-20T04:30:00.000Z'), today: dayKey(new Date()), n: calDays('2026-11-02', '2026-10-31') }));
  check('suggest-trained: day keys are local calendar days across the UTC boundary', k.d === '2026-09-19' && k.iso === '2026-09-19' && k.today === '2026-09-25', JSON.stringify(k));
  check('suggest-trained: day count ignores the DST change', k.n === 2, JSON.stringify(k));
  check('suggest-trained: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function badgeLadders() {
  // Badge ladders scale with profile sex and age; the male 18-39 (and no-birthday) ladders never move.
  const ladders = async prof => {
    const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', ...prof }, hist: [] }, now: new Date('2026-09-25T19:14:00-06:00') });
    const r = await page.evaluate(() => { const T = badgeT(); return { T, how: BADGE_HOW['Pull-up-Maxing'], det: BADGE_DETAIL['Bench-Maxing'] }; });
    await ctx.close(); return { ...r, errors };
  };
  const j = a => JSON.stringify(a);
  const m = await ladders({ sex: 'male', birthday: '1995-01-01' });
  check('badge ladders: male 30 keeps the original ladders', j(m.T.bench) === '[135,225,315]' && j(m.T.ohpFrac) === '[0.25,0.5,1]' && j(m.T.squatFrac) === '[1,1.5,2]' && j(m.T.pullup) === '[10,15,20]' && j(m.T.pushup) === '[30,50,80]' && j(m.T.cardio) === '[9,8,6.5]', j(m.T));
  const none = await ladders({});
  check('badge ladders: no sex or birthday set = male ladders', j(none.T) === j(m.T), j(none.T));
  const f = await ladders({ sex: 'female', birthday: '1995-01-01' });
  check('badge ladders: female 30 is lower on every hand-set strength ladder', f.T.ohpFrac.every((x, i) => x < m.T.ohpFrac[i]) && f.T.squatFrac.every((x, i) => x < m.T.squatFrac[i]) && f.T.pullup.every((x, i) => x < m.T.pullup[i]) && f.T.pushup.every((x, i) => x < m.T.pushup[i]), j(f.T));
  check('badge ladders: female 30 mile ladder is slower', f.T.cardio.every((x, i) => x > m.T.cardio[i]), j(f.T.cardio));
  check('badge ladders: female with no body weight gets the standard bench ladder', j(f.T.bench) === '[135,225,315]', j(f.T.bench));
  check('badge ladders: female ladders still ascend', f.T.pullup[0] < f.T.pullup[1] && f.T.pullup[1] < f.T.pullup[2], j(f.T));
  const old = await ladders({ sex: 'male', birthday: '1960-01-01' });
  check('badge ladders: male 65 is lower than male 30 (strength) and slower (mile)', old.T.bench.every((x, i) => x < m.T.bench[i]) && old.T.cardio.every((x, i) => x > m.T.cardio[i]), j(old.T));
  const teen = await ladders({ sex: 'male', birthday: '2010-01-01' });
  check('badge ladders: a 16-year-old is scaled down on the hand-set ladders', teen.T.pullup[2] < m.T.pullup[2], j(teen.T));
  check('badge ladders: bench has no youth factor (Foster skipped)', j(teen.T.bench) === j(m.T.bench), j(teen.T.bench));
  check('badge ladders: description text follows the ladder and says it is adjusted', /Bronze 5, Silver 8, Gold 10/.test(f.how) && /Adjusted for your profile/.test(f.how) && f.det.tiers[2][1] === f.T.bench[2] + ' lb', f.how + ' | ' + j(f.det));
  check('badge ladders: bench popup says it is the standard ladder when body weight is missing', /1 rep\..*Standard numbers: set your sex and body weight in Profile/.test(f.det.how), f.det.how);
  check('badge ladders: male description has no adjusted note', !/Adjusted/.test(m.how), m.how);
  check('badge ladders: no page errors', [m, none, f, old, teen].every(x => x.errors.length === 0), '');
}

// Bench-Maxing from the IPF GOODLIFT formula (Mr. Roni approved "Option A", 2026-09-25): 30 / 50 / 70 points at the
// lifter's sex and body weight, McCulloch age factor from 41, flat 135 / 225 / 315 without sex or body weight, and no
// tier taken away from a lift logged before the switch. Expected numbers are the research worked tables.
async function benchGoodlift() {
  const OCT15 = new Date('2026-10-15T12:00:00-06:00');
  const run = async ({ prof = {}, lb = 0, hist = [], now = new Date('2026-09-25T19:14:00-06:00') }) => {
    const seed = { prof: { name: 'T', username: '@t', code: '@t', ...prof }, hist };
    if (lb) seed.bw = lb / LB;
    const { page, ctx, errors } = await phone({ seed, now });
    const r = await page.evaluate(() => { const b = computeBadges().find(x => x.name === 'Bench-Maxing'); return { T: badgeT().bench, det: BADGE_DETAIL['Bench-Maxing'], how: BADGE_HOW['Bench-Maxing'], tier: b.tier || null, desc: b.desc, all: b.all && b.all.tier, live: badgeTierForKey('bench', gH()).tier, ohp: badgeT().ohpFrac }; });
    return { ...r, page, ctx, errors };
  };
  const j = a => JSON.stringify(a), errs = [];
  const want = [['female', 114, null, [70, 115, 160]], ['female', 148, null, [80, 135, 190]], ['female', 198, null, [90, 150, 210]],
    ['male', 198, null, [135, 230, 320]], ['male', 198, '1981-01-01', [130, 215, 305]], ['male', 198, '1966-01-01', [100, 170, 240]],
    ['female', 148, '1981-01-01', [80, 130, 180]], ['male', 198, '1986-01-01', [135, 230, 320]]];
  for (const [sex, lb, birthday, T] of want) {
    const r = await run({ prof: birthday ? { sex, birthday } : { sex }, lb });
    check(`bench goodlift: ${sex} ${lb} lb${birthday ? ' born ' + birthday.slice(0, 4) : ''} = ${T.join('/')}`, j(r.T) === j(T), j(r.T));
    errs.push(...r.errors); await r.ctx.close();
  }
  const f = await run({ prof: { sex: 'female', birthday: '1981-01-01' }, lb: 148 });
  check('bench goodlift: popup says how it was worked out', /^Barbell flat bench press .*1 rep\..* Set for your sex and 148 lb body weight, eased for age 45\.$/.test(f.det.how) && !/GOODLIFT|points/i.test(f.det.how), f.det.how);
  check('bench goodlift: tap text says the same (no GOODLIFT points shown, 2026-09-30)', /Set for your sex and 148 lb body weight/.test(f.how) && !/GOODLIFT|points/i.test(f.how) && !/Adjusted for your profile/.test(f.how), f.how);
  const bf = await f.page.evaluate(() => JSON.stringify(BADGE_FEMALE));
  check('bench goodlift: bench factor gone from BADGE_FEMALE, the others unchanged', bf === '{"ohp":0.6,"squat":0.6,"pullup":0.5,"pushup":0.6,"cardio":1.11}', bf);
  await f.page.evaluate(() => badgeInfo('Bench-Maxing')); await f.page.waitForTimeout(250);
  const txt = await f.page.evaluate(() => document.getElementById('badgeFullBody').innerText);
  check('bench goodlift: the popup on screen shows the line and the tiers', /Set for your sex and 148 lb body weight/.test(txt) && !/GOODLIFT|points/i.test(txt) && /180 lb/.test(txt) && /130 lb/.test(txt), txt.replace(/\s+/g, ' '));
  await f.page.screenshot({ path: SHOTS + '/bench-goodlift-popup.png' });
  errs.push(...f.errors); await f.ctx.close();
  // Fallback: sex or body weight missing.
  for (const [nm, o] of [['no body weight', { prof: { sex: 'male' } }], ['no sex', { lb: 250 }]]) {
    const r = await run(o);
    check(`bench goodlift: ${nm} falls back to 135/225/315`, j(r.T) === '[135,225,315]', j(r.T));
    check(`bench goodlift: ${nm} says so on the badge`, /^Standard 1-rep bench/.test(r.desc) && /Standard numbers/.test(r.det.how), r.desc + ' | ' + r.det.how);
    errs.push(...r.errors); await r.ctx.close();
  }
  const s = await run({ prof: { sex: 'male' }, lb: 198 });
  check('bench goodlift: with sex and body weight the badge line is not marked standard', /^1-rep bench/.test(s.desc), s.desc);
  errs.push(...s.errors); await s.ctx.close();
  // No revoke. A 250 lb man benched 230 on Sep 20: Silver under the old 225, only Bronze under the new 255.
  const bench = (d, lbs) => wk(d, [ex('Barbell Bench Press', [[lbs, 1]])]);
  const k = await run({ prof: { sex: 'male' }, lb: 250, hist: [bench('2026-09-20', 230)], now: OCT15 });
  check('bench goodlift: 250 lb man thresholds rise to 155/255/355', j(k.T) === '[155,255,355]', j(k.T));
  check('bench goodlift: a Silver earned before the switch is kept', k.tier === 'silver' && k.all === 'silver' && k.live === 'silver', j([k.tier, k.all, k.live]));
  check('bench goodlift: a kept tier says so', /kept from the old numbers/.test(k.desc), k.desc);
  errs.push(...k.errors); await k.ctx.close();
  const n = await run({ prof: { sex: 'male' }, lb: 250, hist: [bench('2026-10-01', 230)], now: OCT15 });
  check('bench goodlift: the same lift after the switch is judged on the new numbers', n.tier === 'bronze' && n.live === 'bronze' && !/kept/.test(n.desc), j([n.tier, n.live, n.desc]));
  errs.push(...n.errors); await n.ctx.close();
  const w = await run({ prof: { sex: 'female' }, lb: 198, hist: [bench('2026-09-24', 190)], now: OCT15 });
  check('bench goodlift: a 198 lb woman keeps the Gold her 190 earned under the old x0.6', w.tier === 'gold', j([w.T, w.tier]));
  errs.push(...w.errors); await w.ctx.close();
  const x = await run({ prof: { sex: 'male' }, lb: 250, hist: [bench('2026-09-20', 230)], now: new Date('2027-01-05T12:00:00-06:00') });
  check('bench goodlift: a kept tier still ages out after 3 months', x.tier === null && x.all === 'silver', j([x.tier, x.all]));
  errs.push(...x.errors); await x.ctx.close();
  const l = await run({ prof: { sex: 'male' }, lb: 165, hist: [bench('2026-10-01', 215)], now: OCT15 });
  check('bench goodlift: a lighter man reaches Silver at a lower weight than 225', l.tier === 'silver', j([l.T, l.tier]));
  errs.push(...l.errors); await l.ctx.close();
  check('bench goodlift: no page errors', errs.length === 0, errs.join(' | '));
}

// Single-button confirms ("Got it") sit centered at the bottom of the dialog (Mr. Roni, 2026-09-25).
async function confirmCentered() {
  for (const w of [390, 360]) {
    const { page, ctx } = await phone({ width: w, height: 780, seed: {}, now: SEP15 });
    await page.evaluate(() => crownInfo());
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const d = document.querySelector('#confirmModal .md').getBoundingClientRect(), b = document.getElementById('cfOk').getBoundingClientRect();
      return { dc: d.left + d.width / 2, bc: b.left + b.width / 2, cancel: getComputedStyle(document.getElementById('cfCancel')).display, bottomGap: d.bottom - b.bottom };
    });
    check(`confirm: Got it is centered at ${w}px`, Math.abs(m.dc - m.bc) <= 1.5 && m.cancel === 'none', JSON.stringify(m));
    await ctx.close();
  }
}

// Cardio tier ladder reads like the others: lowest tier (slowest pace) left, best (fastest) right
// (Mr. Roni, 2026-09-25 7:46pm; v1.10.28 printed 6:30 / 8:00 / 9:00).
async function cardioOrder() {
  const { page, ctx, errors } = await phone({ width: 393, height: 852, seed: { hist: [wk('2026-09-05', [ex('Run', [[1, 7.5]], 'distance')])], bw: 80 }, now: SEP15 });
  const b = await badge(page, 'Cardio-Maxing');
  const paces = (b.desc.split('—')[1] || '').replace(/<[^>]+>/g, '').split('/').map(x => x.trim());
  const sec = t => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  check('cardio order: list line is slowest to fastest, left to right', paces.length === 3 && sec(paces[0]) > sec(paces[1]) && sec(paces[1]) > sec(paces[2]), b.desc);
  const bench = await badge(page, 'Bench-Maxing');
  const lifts = (bench.desc.split(':')[1] || '').replace(/<[^>]+>/g, '').split('/').map(x => Number(x.trim()));
  check('cardio order: bench line still lowest to highest, left to right', lifts[0] < lifts[1] && lifts[1] < lifts[2], bench.desc);
  await page.evaluate(() => badgeInfo('Cardio-Maxing'));
  await page.waitForTimeout(250);
  const tiers = await page.evaluate(() => [...document.querySelectorAll('#badgeFullBody .bf-tiers')][0].innerText.split('\n').map(x => x.trim()).filter(x => /Bronze|Silver|Gold/.test(x)));
  check('cardio order: popup tiers run Bronze, Silver, Gold', tiers.join(',') === 'Bronze,Silver,Gold', tiers.join(','));
  await page.screenshot({ path: SHOTS + '/cardio-order-393.png' });
  check('cardio order: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Type and spacing rulebook (Mr. Roni, 2026-09-25; Home is the standard, artifacts/jacked-type-and-spacing-rules.md):
// one block-title style everywhere, 22px between any two blocks, cards 18px padding / 20px corners / 16px side margin,
// title 18px from the card top and 12px above its content. Fails if any page or popup has a second title style or card gap.
async function typeRulebook() {
  const H = []; for (let i = 1; i <= 14; i++) { const d = new Date(SEP15 - i * 86400000).toISOString().slice(0, 10); H.push(wk(d, [ex('Barbell Bench Press', [[60, 8], [60, 8]]), ex('Run', [[1, 8]], 'distance')])); }
  const measure = () => {
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const root = document.querySelector('.mo.open .md') || document.querySelector('#achFull.open') || document.querySelector('.page.active');
    const legacy = document.querySelectorAll('.st,.sec-t,.mc-title,.mc-head,.sec-head').length;
    const titles = [...root.querySelectorAll('.blk-t')].filter(vis).map(t => {
      const c = getComputedStyle(t), tr = t.getBoundingClientRect();
      const row = t.parentElement.classList.contains('blk-head') ? t.parentElement : t;
      let n = row.nextElementSibling; while (n && !vis(n)) n = n.nextElementSibling;
      let nTop = null; if (n) { const kids = [n, ...n.querySelectorAll('*')].filter(vis); nTop = Math.min(...kids.map(k => k.getBoundingClientRect().top)); }
      const card = t.closest('.sec,.metric-card,.cw');
      return { txt: t.textContent.trim().slice(0, 20), style: [c.fontFamily.split(',')[0], c.fontSize, c.fontWeight, c.letterSpacing, c.textTransform, c.lineHeight].join(' '),
        toContent: nTop === null ? null : Math.round(nTop - row.getBoundingClientRect().bottom), fromCardTop: card && card.firstElementChild === row ? Math.round(tr.top - card.getBoundingClientRect().top) : null };
    });
    const blocks = []; const collect = el => { for (const c of el.children) { if (!vis(c)) continue; const cs = getComputedStyle(c); if (cs.position === 'sticky' || cs.position === 'fixed') continue; if (c.id === 'metricsCards' || c.id === 'compareBoard') { collect(c); continue; } blocks.push(c); } };
    if (root.classList.contains('page')) collect(root);
    const gaps = blocks.slice(1).map((b, i) => ({ a: blocks[i].id || blocks[i].className, b: b.id || b.className, gap: Math.round(b.getBoundingClientRect().top - blocks[i].getBoundingClientRect().bottom) }));
    const cards = [...root.querySelectorAll('.sec,.metric-card,.cw')].filter(vis).map(e => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return [cs.padding, cs.borderTopLeftRadius, Math.round(r.left), Math.round(innerWidth - r.right)].join(' '); });
    const bottoms = [...root.querySelectorAll('.sec,.metric-card,.cw')].filter(vis).map(e => { const kids = [...e.children].filter(vis); return { id: e.id || e.className, space: kids.length ? Math.round(e.getBoundingClientRect().bottom - Math.max(...kids.map(k => k.getBoundingClientRect().bottom))) : 18 }; }).filter(x => x.space !== 18);
    // every titled card opens with the one title style (the calendar keeps its month switcher; the recap row is 10% smaller by his 9/24 call)
    const untitled = [...root.querySelectorAll('.sec,.metric-card,#suggestCard')].filter(vis).filter(e => e.id !== 'recapCard').filter(e => { const f = [...e.children].find(vis); return !f || !(f.classList.contains('blk-t') || f.classList.contains('blk-head')); }).map(e => e.id || e.className);
    return { legacy, titles, gaps, cards, bottoms, untitled };
  };
  const all = {};
  for (const pg of ['home', 'routines', 'exercises', 'metrics', 'leaderboard']) {
    const { page, ctx, errors } = await phone({ width: 393, height: 852, seed: { hist: H, bw: 80 }, now: SEP15 });
    await page.evaluate(p => sp(p), pg); await page.waitForTimeout(300);
    all[pg] = await page.evaluate(measure);
    if (pg === 'home' || pg === 'metrics') await page.screenshot({ path: `${SHOTS}/rulebook-${pg}-393.png`, fullPage: false });
    if (pg === 'metrics') { await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/rulebook-metrics-scrolled-393.png` }); }
    if (pg === 'leaderboard') await page.screenshot({ path: `${SHOTS}/rulebook-friends-393.png` });
    check(`rulebook: ${pg} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  for (const [name, open] of [['profile', () => openProf()], ['exercise info', () => openExInfo(allEx()[0].id)], ['workout detail', () => openWD(gH()[gH().length - 1].id)], ['achievements', () => openAch()]]) {
    const { page, ctx, errors } = await phone({ width: 393, height: 852, seed: { hist: H, bw: 80 }, now: SEP15 });
    await page.evaluate(open); await page.waitForTimeout(350);
    all[name] = await page.evaluate(measure);
    await page.screenshot({ path: `${SHOTS}/rulebook-${name.replace(' ', '-')}-393.png` });
    check(`rulebook: ${name} popup no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  const styles = new Set(), bad = [];
  for (const [pg, m] of Object.entries(all)) {
    check(`rulebook: ${pg} has no old title classes`, m.legacy === 0, String(m.legacy));
    m.titles.forEach(t => styles.add(t.style));
    const off = m.titles.filter(t => (t.toContent !== null && t.toContent !== 12) || (t.fromCardTop !== null && t.fromCardTop !== 18));
    check(`rulebook: ${pg} titles sit 18px into the card and 12px above content`, off.length === 0, JSON.stringify(off));
    const g = m.gaps.filter(x => x.gap !== 22); if (g.length) bad.push([pg, g]);
    check(`rulebook: ${pg} every gap between blocks is 22px`, g.length === 0, JSON.stringify(g));
    check(`rulebook: ${pg} every card starts with the standard block title`, m.untitled.length === 0, JSON.stringify(m.untitled));
    check(`rulebook: ${pg} cards end 18px below their last item`, m.bottoms.length === 0, JSON.stringify(m.bottoms));
    check(`rulebook: ${pg} cards are 18px padding, 20px corners, 16px side margins`, m.cards.every(c => c === '18px 20px 16 16'), JSON.stringify([...new Set(m.cards)]));
  }
  check('rulebook: exactly one block-title style across every page and popup', styles.size === 1, JSON.stringify([...styles]));
  const need = ['home', 'routines', 'exercises', 'metrics', 'leaderboard', 'profile', 'exercise info'];
  check('rulebook: every page and titled popup was measured', need.every(k => all[k] && all[k].titles.length), Object.entries(all).map(([k, m]) => k + ':' + m.titles.length).join(' '));
  const css = await (await fetch(URL)).text();
  check('rulebook: stylesheet has no old title classes left', !/\.(st|sec-t|mc-title|mc-head|sec-head)\b[\s{,:]/.test(css.split('</style>')[0]), '');
}

// Haptics (Mr. Roni, 2026-09-25): one haptic() for the tab bar and page-changing buttons. Web = navigator.vibrate
// (Android; iPhone Safari ignores it), native shell = Capacitor Haptics. Programmatic page changes stay silent.
async function haptics() {
  const { page, ctx, errors } = await phone({ width: 393, height: 852, seed: { hist: [wk('2026-09-10', [ex('Barbell Bench Press', [[185, 5]])])] }, now: SEP15 });
  await page.evaluate(() => { window._vib = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: p => { window._vib.push(p); return true; } }); });
  const vib = () => page.evaluate(() => { const v = window._vib; window._vib = []; return JSON.stringify(v); });
  // Playwright's evaluate() counts as a user gesture, so "no tap" is simulated through the activation flag haptic() reads.
  await page.evaluate(() => { const ua = navigator.userActivation; Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false, hasBeenActive: true } }); sp('metrics'); Object.defineProperty(navigator, 'userActivation', { configurable: true, value: ua }); });
  await page.waitForTimeout(100);
  check('haptics: a page change from code (no tap) does not buzz', await vib() === '[]');
  await page.evaluate(() => { Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } }); haptic('success', false); delete navigator.userActivation; });
  check('haptics: the rest-timer buzz still fires without a tap', await vib() === '[[120,60,120]]');
  for (const t of ['routines', 'exercises', 'home', 'leaderboard', 'metrics']) {
    await page.locator('#nav-' + t).click(); await page.waitForTimeout(80);
    check(`haptics: tab bar ${t} tap buzzes once, light`, await vib() === '[10]');
  }
  await page.locator('#nav-metrics').click(); await page.waitForTimeout(80);
  check('haptics: tapping the tab you are already on does not buzz', await vib() === '[]');
  await page.locator('#metricsCards [onclick="openAch()"]').first().click(); await page.waitForTimeout(150);
  check('haptics: opening the full Achievements page buzzes', await vib() === '[10]');
  await page.evaluate(() => closeAch());
  await page.locator('#nav-home').click(); await page.waitForTimeout(80); await vib();
  await page.locator('#page-home button', { hasText: 'Start Workout' }).click(); await page.waitForTimeout(150); await vib();
  await page.locator('#qsModal button', { hasText: /Empty/ }).first().click(); await page.waitForTimeout(200);
  check('haptics: starting a workout (opens the workout page) buzzes', await vib() === '[10]', String(await page.evaluate(() => !!aw)));
  await page.evaluate(() => { const c = { id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }; S.s('cex', [c]); addExToWorkout ? addExToWorkout('cex1') : null; });
  await page.waitForTimeout(150); await vib();
  const sd = page.locator('#wSession .sd').first();
  if (await sd.count()) { await sd.click(); await page.waitForTimeout(80); check('haptics: ticking a set done buzzes medium', (await vib()).startsWith('[15')); }
  await page.evaluate(() => { window._imp = []; window.Capacitor = { Plugins: { Haptics: { impact: o => window._imp.push(o.style), notification: o => window._imp.push(o.type) } } }; });
  await page.locator('#nav-routines').click(); await page.waitForTimeout(80);
  const imp = await page.evaluate(() => JSON.stringify(window._imp));
  check('haptics: inside the native shell it uses Capacitor Haptics, not vibrate', imp === '["LIGHT"]' && await vib() === '[]', imp);
  const src = await (await fetch(URL)).text();
  check('haptics: navigator.vibrate is called in exactly one place (haptic())', (src.match(/navigator\.vibrate\(/g) || []).length === 1);
  check('haptics: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function tricepsTier() {
  // Mr. Roni 2026-09-25 11:46pm: "I don't think my triceps need work at all". His real history: bench 225x12,
  // pushdowns 70x14, one-arm cable extensions 70x8; the old code averaged only the isolation moves (x1.98) and
  // showed Needs Work. Triceps now takes its strongest evidence, each lift on its own sourced ladder.
  const BW = 229 / LB, NOW = new Date('2026-09-26T00:10:00-06:00');
  const lift = (id, name, muscle, sets, extra = {}) => ({ ...ex(name, sets, 'weight_reps', id), muscle, ...extra });
  const bench = lift('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell, med grip)', 'chest', [[225, 8]]);
  const pushdown = lift('Triceps_Pushdown', 'Triceps Pushdown (cable)', 'triceps', [[60, 12]]);
  const kickback = lift('Tricep_Dumbbell_Kickback', 'Tricep Dumbbell Kickback', 'triceps', [[10, 10]]);
  const crunch = lift('Ab_Crunch_Machine', 'Ab Crunch (machine)', 'core', [[210, 14]]);
  const kneeRaise = lift('Knee_Hip_Raise_On_Parallel_Bars', 'Knee/Hip Raise On Parallel Bars', 'core', [[10, 20]]);
  const pushups = lift('Pushups', 'Pushups (bodyweight)', 'chest', [[229, 50]]);
  const prof = { name: 'T', username: '@t', code: '@t', sex: 'male', birthday: '2000-07-10' };
  const { page, ctx, errors } = await phone({ seed: { hist: [wk('2026-09-20', [bench, pushdown])], bw: BW, prof }, now: NOW });
  await page.evaluate(async () => { for (let i = 0; i < 150 && (dbLoading || !dbLoaded); i++) await new Promise(r => setTimeout(r, 100)); });
  const run = hist => page.evaluate(h => { S.s('hist', h); const p = musclePerf(), t = triStrength(), c = creditStrength().triceps;   // presses credit triceps through exCredits since 2026-09-27
    return { tri: strengthLabel(p.score.triceps).l, triScore: p.score.triceps, core: p.score.core, coreL: strengthLabel(p.score.core).l, best: c && c.score >= t.score ? c.key : t.best && t.best.key }; }, hist);
  let r = await run([wk('2026-09-20', [bench, pushdown])]);
  check('triceps-tier: solid bench + moderate pushdowns is not Needs Work (Strong)', r.tri === 'Strong', JSON.stringify(r));
  check('triceps-tier: the bench is the evidence that carries it', r.best === 'Barbell_Bench_Press_-_Medium_Grip', JSON.stringify(r));
  const withWeak = await run([wk('2026-09-20', [bench, pushdown, kickback])]);
  check('triceps-tier: a light kickback cannot lower triceps below its best evidence', Math.abs(withWeak.triScore - r.triScore) < 1e-9, JSON.stringify([r, withWeak]));
  const onlyIso = await run([wk('2026-09-20', [pushdown])]), both = await run([wk('2026-09-20', [pushdown, kickback])]);
  check('triceps-tier: pushdowns alone are scored on the pushdown ladder, not averaged down', onlyIso.triScore > 0 && Math.abs(both.triScore - onlyIso.triScore) < 1e-9, JSON.stringify([onlyIso, both]));
  const c1 = await run([wk('2026-09-20', [crunch])]), c2 = await run([wk('2026-09-20', [crunch, kneeRaise])]);
  check('triceps-tier: core is not averaged down by a light knee raise (Strong)', c2.coreL === 'Strong' && Math.abs(c2.core - c1.core) < 1e-9, JSON.stringify([c1, c2]));
  const blank = await run([wk('2026-09-20', [{ ...pushdown, muscle: '' }])]);
  check('triceps-tier: a pushdown saved with a blank muscle still counts (via the library)', blank.triScore > 0 && blank.best === 'Triceps_Pushdown', JSON.stringify(blank));
  const cexBlank = await page.evaluate(() => { S.s('cex', [{ id: 'cexTri', name: 'Rope Thing', muscle: 'triceps', equip: 'cable', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }]);
    return strGroup({ exId: 'cexTri', name: 'Rope Thing', muscle: '' }); });
  check('triceps-tier: a blank-muscle custom exercise resolves from its library entry', cexBlank === 'triceps', cexBlank);
  const pu = await run([wk('2026-09-20', [pushups])]);
  check('triceps-tier: plain push-ups at bodyweight are not counted as a 229 lb press', pu.triScore === 0, JSON.stringify(pu));
  const old = await run([wk('2026-05-01', [bench])]);
  check('triceps-tier: evidence older than 90 days drops off', old.triScore === 0, JSON.stringify(old));
  // The Muscle Map row shows the same tier as the score.
  await run([wk('2026-09-20', [bench, pushdown])]);
  const row = await page.evaluate(() => { const c = cardBody(), d = document.createElement('div'); d.innerHTML = c.html;
    return [...d.querySelectorAll('.mr-item')].map(e => e.innerText.replace(/\s+/g, ' ')).find(t => /Triceps/.test(t)) || ''; });
  check('triceps-tier: Muscle Map row reads Strong', /Strong/.test(row), row);
  check('triceps-tier: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function lifetimeAvgMin() {
  // Mr. Roni 2026-09-26: Lifetime Stats showed "3485" Avg min/session. duration is "MM:SS"; it was read as HH:MM (seconds).
  const mk = (d, dur) => ({ ...wk(d, [ex('Barbell Bench Press', [[185, 5]])]), duration: dur });
  const { page, ctx, errors } = await phone({ seed: { hist: [mk('2026-09-10', '45:00'), mk('2026-09-11', '60:30'), mk('2026-09-12', '\u2014')] }, now: SEP15 });
  const avg = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = cardLifetime().html; return [...d.querySelectorAll('.sc')].map(c => [c.querySelector('.sl').textContent, c.querySelector('.sv').textContent]).find(x => /min\/session/i.test(x[0]))[1]; });
  check('lifetime: avg min/session is minutes (45:00 + 60:30, unrecorded ignored = 53)', avg === '53', avg);
  check('lifetime: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Wait for the real exercise-db to load inside a test page.
const dbReady = page => page.evaluate(async () => { loadDB(); for (let i = 0; i < 200 && (dbLoading || !dbLoaded); i++) await new Promise(r => setTimeout(r, 100)); return dbLoaded; });

async function crunchRegex() {
  // Mr. Roni 2026-09-27: "fix that crunch regex bug". The import muscle guesser tested /run/ as a substring, so every
  // crunch it had to guess ("Cable Crunch", "Reverse Crunch"...) was saved as Cardio; same class: /chin/ in "machine",
  // /lat/ in "Flat Bench", /ab/ in "Cable Day".
  const imp = (n, sets) => ({ exId: 'imp_' + n.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: n, muscle: 'cardio', tracking: 'weight_reps', sets: sets.map(([lb, r]) => ({ weight: lb / LB, reps: r, done: true })) });
  const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', sex: 'male' }, bw: 80,
    hist: [wk('2026-09-10', [imp('Cable Crunch', [[120, 10]])])] }, now: SEP15 });
  await dbReady(page);
  const g = await page.evaluate(() => Object.fromEntries(['Cable Crunch', 'Reverse Crunch', 'Weighted Crunches', 'Crunch (Machine)', 'Bicycle Crunch', 'Running', 'Treadmill Run', 'Cycling', 'Walking',
    'Walking Lunge', "Farmer's Walk", 'Air Bike', 'Preacher Curl (Machine)', 'Lateral Raise Machine', 'Tricep Kickback', 'Narrow Stance Squat', 'Rear Delt Fly (Machine)', 'Strap Row',
    'Leg Raise', 'Close Grip Bench Press', 'Pallof Press', 'Floor Press'].map(n => [n, guessMuscle(n)])));
  for (const n of ['Cable Crunch', 'Reverse Crunch', 'Weighted Crunches', 'Crunch (Machine)', 'Bicycle Crunch', 'Leg Raise', 'Pallof Press']) check(`crunch: "${n}" guessed as abs, not cardio`, g[n] === 'abdominals', g[n]);
  for (const n of ['Running', 'Treadmill Run', 'Cycling', 'Walking']) check(`crunch: "${n}" still guessed as cardio`, g[n] === 'cardio', g[n]);
  for (const [n, m] of [['Walking Lunge', 'quadriceps'], ['Preacher Curl (Machine)', 'biceps'], ['Lateral Raise Machine', 'shoulders'], ['Tricep Kickback', 'triceps'], ['Narrow Stance Squat', 'quadriceps'],
    ['Rear Delt Fly (Machine)', 'shoulders'], ['Strap Row', 'lats'], ['Close Grip Bench Press', 'triceps'], ['Floor Press', 'chest']]) check(`crunch: "${n}" guessed ${m}`, g[n] === m, g[n]);
  check("crunch: Farmer's Walk / Air Bike are not cardio", g["Farmer's Walk"] !== 'cardio' && g['Air Bike'] !== 'cardio', g["Farmer's Walk"] + ' ' + g['Air Bike']);
  const dbCardio = await page.evaluate(() => allDB.filter(e => e.name !== 'Wind Sprints' && (guessMuscle(e.name) === 'cardio' || guessMuscle(prettyDB(e.name, e.equipment)) === 'cardio')).map(e => e.name));   // exercise-db files a hanging ab move as "Wind Sprints"
  check('crunch: no exercise-db strength lift is guessed as cardio by name', dbCardio.length === 0, dbCardio.join(', '));
  // Both directions against the real dataset (876 entries, fetched raw so the excluded cardio category is included).
  const both = await page.evaluate(async () => { const raw = await (await fetch(DB_URL)).json();
    return { total: raw.length, crunch: raw.filter(e => /crunch/i.test(e.name)).filter(e => guessMuscle(e.name) === 'cardio').map(e => e.name), nCrunch: raw.filter(e => /crunch/i.test(e.name)).length,
      cardio: raw.filter(e => e.category === 'cardio').filter(e => guessMuscle(e.name) !== 'cardio').map(e => e.name), nCardio: raw.filter(e => e.category === 'cardio').length }; });
  check(`crunch: none of the dataset's ${both.nCrunch} crunches guessed cardio`, both.nCrunch >= 17 && both.crunch.length === 0, both.crunch.join(', '));
  check(`crunch: all ${both.nCardio} of the dataset's cardio exercises (Jogging, Treadmill, Stairmaster...) still guessed cardio`, both.nCardio > 10 && both.cardio.length === 0, both.cardio.join(', '));
  const crunchChip = await page.evaluate(() => allEx().filter(e => /crunch/i.test(e.name) && isCardioCat(e)).map(e => e.name));
  check('crunch: no crunch shows under the Cardio chip', crunchChip.length === 0, crunchChip.join(', '));
  const mg = await page.evaluate(() => Object.fromEntries(['Flat Bench', 'Cable Day', 'Tabata', 'Lateral Raise', 'Kickbacks', 'lats', 'middle back', 'lower back', 'abdominals', 'abductors', 'Leg Day', 'Back & Biceps', 'Abs', 'Pecs'].map(n => [n, muscleGroup(n)])));
  check('crunch: routine names "Flat Bench" / "Cable Day" / "Tabata" / "Kickbacks" are not Back/Core', !mg['Flat Bench'] && !mg['Cable Day'] && !mg['Tabata'] && !mg['Kickbacks'], JSON.stringify(mg));
  check('crunch: real muscle names still group right', mg.lats === 'back' && mg['middle back'] === 'back' && mg['lower back'] === 'back' && mg.abdominals === 'core' && mg.abductors === 'legs' && mg['Leg Day'] === 'legs' && mg['Back & Biceps'] === 'back' && mg.Abs === 'core' && mg.Pecs === 'chest', JSON.stringify(mg));
  // A crunch imported before the fix (saved as cardio) now counts as core.
  const old = await page.evaluate(() => { const e = gH()[0].exercises[0]; return { g: strGroup(e), sug: [...exGroups(e, gH()[0])], core: muscleStrengthRatio().core }; });
  check('crunch: old imported "Cable Crunch" saved as cardio now counts for Core strength', old.g === 'core' && old.core > 0, JSON.stringify(old));
  check('crunch: ...and for Suggested today', old.sug.includes('core'), old.sug.join('/'));
  check('crunch: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function builtinMachines() {
  // Mr. Roni 2026-09-27: "add those and we'll do icon only" -- Lateral Raise, Hip Thrust, Assisted Pull-Up and Assisted Dip machines.
  const IDS = ['bi_lateral_raise_machine', 'bi_hip_thrust_machine', 'bi_assisted_pullup_machine', 'bi_assisted_dip_machine'];
  const lg = (exId, sets, extra = {}) => ({ exId, name: '', muscle: '', tracking: 'weight_reps', ...extra, sets: sets.map(([lb, r]) => ({ weight: lb / LB, reps: r, done: true })) });
  const named = (exId, sets, extra) => { const e = lg(exId, sets, extra); return e; };
  const hist = [wk('2026-09-12', [named('bi_lateral_raise_machine', [[100, 10]]), named('bi_hip_thrust_machine', [[300, 8]]),
    named('bi_assisted_pullup_machine', [[40, 8], [20, 8]], { assist: true }), named('bi_assisted_dip_machine', [[250, 10]], { assist: true })])];
  const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', sex: 'male' }, bw: 80, hist }, now: SEP15 });
  await dbReady(page);
  // give the logs their library names/muscles, the way the app saves them
  await page.evaluate(() => { const h = gH(); h[0].exercises.forEach(e => { const b = byId(e.exId); e.name = b.name; e.muscle = b.muscle; e.equip = b.equip; }); S.s('hist', h); });
  const lib = await page.evaluate(ids => ids.map(id => { const e = byId(id); return { id, name: e.name, muscle: e.muscle, assist: !!e.assist, img: imgUrl(e), thumb: thumbH(e), col: mc(e.muscle), instr: (e.instructions || []).length,
    inAll: allEx().filter(x => x.id === id).length, custom: isCustomEx(id) }; }), IDS);
  check('machines: all 4 are in the library exactly once', lib.every(e => e.inAll === 1), JSON.stringify(lib.map(e => e.inAll)));
  check('machines: names', lib.map(e => e.name).join('|') === 'Lateral Raise (machine)|Hip Thrust (machine)|Assisted Pull-Up (machine)|Assisted Dip (machine)', lib.map(e => e.name).join('|'));
  check('machines: muscles shoulders / glutes / lats / triceps', lib.map(e => e.muscle).join() === 'shoulders,glutes,lats,triceps', lib.map(e => e.muscle).join());
  check('machines: icon only (no photo), line icon in the muscle color', lib.every(e => e.img === null && /<svg/.test(e.thumb) && !/<img/.test(e.thumb) && e.thumb.includes(e.col)));
  check('machines: instructions present', lib.every(e => e.instr >= 3));
  check('machines: built-in, not custom (Delete hides them)', lib.every(e => !e.custom));
  check('machines: assisted ones carry assist, the others do not', lib.map(e => e.assist).join() === 'false,false,true,true');
  const search = await page.evaluate(() => Object.fromEntries(['lat raise', 'lateral raise machine', 'hip thrust machine', 'assisted pull up', 'assisted pullup', 'assisted dip'].map(q => [q, allEx().filter(e => exSearchMatch(q, e)).map(e => e.id)])));
  check('machines: search "lat raise" finds Lateral Raise (machine)', search['lat raise'].includes('bi_lateral_raise_machine'));
  check('machines: search finds each one', search['lateral raise machine'].includes('bi_lateral_raise_machine') && search['hip thrust machine'].includes('bi_hip_thrust_machine') && search['assisted pull up'].includes('bi_assisted_pullup_machine') && search['assisted pullup'].includes('bi_assisted_pullup_machine') && search['assisted dip'].includes('bi_assisted_dip_machine'), JSON.stringify(search));
  // Library chips (real DOM)
  for (const [chip, id] of [['shoulders', 'bi_lateral_raise_machine'], ['glutes', 'bi_hip_thrust_machine'], ['lats', 'bi_assisted_pullup_machine'], ['triceps', 'bi_assisted_dip_machine']]) {
    const shown = await page.evaluate(([chip, id]) => { sp('exercises'); mFlt = chip; document.getElementById('exSearch').value = byId(id).name.split(' (')[0]; renderEx(); return document.getElementById('exList').innerHTML.includes(`openExInfo('${id}')`); }, [chip, id]);
    check(`machines: ${id} listed under the ${chip} chip`, shown);
  }
  const cardio = await page.evaluate(ids => ids.filter(id => isCardioCat(byId(id))), IDS);
  check('machines: none under Cardio', cardio.length === 0, cardio.join());
  // Mid-workout Add-Exercise picker renders them with the icon tile (no photo).
  await page.evaluate(() => { startEmpty(); openAEModal ? openAEModal('workout') : null; });
  await page.waitForTimeout(250);
  await page.fill('#aeSearch', 'machine');
  await page.waitForTimeout(250);
  const ae = await page.evaluate(ids => ids.map(id => { const row = [...document.querySelectorAll('#aeList > *')].find(r => r.outerHTML.includes(`'${id}'`)); return !row ? 'missing' : row.querySelector('svg') && !row.querySelector('img') ? 'icon' : 'photo'; }), IDS);
  check('machines: all 4 render in the Add-Exercise picker with the icon tile', ae.every(x => x === 'icon'), ae.join());
  await page.screenshot({ path: SHOTS + '/machines-picker.png' });
  await page.evaluate(() => { cm('aeModal'); aw = null; });
  const r = await page.evaluate(() => {
    const h = gH()[0], ex = h.exercises, bw = gBW();
    return { groups: ex.map(e => [...exGroups(e, h)].join('/')), str: ex.map(e => strGroup(e)), f: ex.map(e => +exStrengthFactor(e.exId, strGroup(e)).toFixed(2)),
      eff: ex[2].sets.map(s => +effWeight(ex[2], s).toFixed(2)), bw, ratio: muscleStrengthRatio(), tri: triStrength(), plain: ex.map(e => isPlainBW(e)),
      pr: prBest(ex[2]), keys: ex.map(e => exerciseBadgeKey(e)), big: computeBadges().find(b => b.name === 'Pull-up-Maxing') };
  });
  check('machines: Suggested today credits shoulders / glutes (not legs) / back / triceps', r.groups.join('|') === 'shoulders|glutes|back|triceps', r.groups.join('|'));
  check('machines: strength groups', r.str.join() === 'shoulders,glutes,back,triceps', r.str.join());
  check('machines: lateral raise scaled as a machine isolation lift (0.9 x 1.8), hip thrust as a machine (0.9), assisted as body weight (1)', r.f.join() === '1.62,0.9,1,1', r.f.join());
  check('machines: assisted pull-up load = body weight minus counterweight', Math.abs(r.eff[0] - (r.bw - 40 / LB)) < 0.01 && Math.abs(r.eff[1] - (r.bw - 20 / LB)) < 0.01, r.eff.join());
  check('machines: less assistance is the better (PR) set', r.pr && r.pr.si === 1, JSON.stringify(r.pr));
  check('machines: assisted dip with counterweight over body weight = 0 load, never negative', r.ratio.triceps >= 0 && !isNaN(r.ratio.back), JSON.stringify(r.ratio));
  check('machines: shoulders / glutes / back tiers fed', r.ratio.shoulders > 0 && r.ratio.glutes > 0 && r.ratio.back > 0, JSON.stringify(r.ratio));
  check('machines: assisted lifts are not "best lifts" (plain/assisted body weight rule)', r.plain.join() === 'false,false,true,true', r.plain.join());
  check('machines: assisted dip is not triceps tier evidence', !r.tri.best || r.tri.best.key !== 'bi_assisted_dip_machine', JSON.stringify(r.tri.best));
  check('machines: no machine feeds a Maxing ladder (assisted pull-ups are not pull-ups)', r.keys.every(k => k === null), r.keys.join());
  // 20 assisted reps must not earn Pull-up-Maxing; 12 real pull-ups do; 25 scapular pull-ups do not; -Assist toggle on a plain pull-up does not.
  const pb = await page.evaluate(() => {
    const mk = (id, name, reps, extra = {}) => ({ exId: id, name, muscle: 'lats', tracking: 'weight_reps', ...extra, sets: [{ weight: 0, reps, done: true }] });
    const d = new Date('2026-09-14T12:00:00-06:00').toISOString();
    const test = exs => { S.s('hist', [{ id: 'wx', name: 'W', date: d, exercises: exs, duration: '30:00', sets: 1, totalVolume: 0 }]); const b = computeBadges().find(b => b.name === 'Pull-up-Maxing'); return b.tier || null; };
    return { assisted: test([mk('bi_assisted_pullup_machine', 'Assisted Pull-Up (machine)', 20, { assist: true })]), band: test([mk('Band_Assisted_Pull-Up', 'Band Assisted Pull-Up', 20)]),
      scap: test([mk('wu_lats', 'Scapular Pull-Up', 25)]), toggle: test([mk('Pullups', 'Pullups', 20, { bwMode: 'assist' })]), real: test([mk('Pullups', 'Pullups', 12)]),
      live: [exerciseBadgeKey(mk('Band_Assisted_Pull-Up', 'Band Assisted Pull-Up', 1)), exerciseBadgeKey(mk('Pullups', 'Pullups', 1)), exerciseBadgeKey(mk('Pushups', 'Push-Up', 1))].join() };
  });
  check('machines: 20 assisted-machine reps earn no Pull-up-Maxing', pb.assisted === null, pb.assisted);
  check('machines: 20 band-assisted reps earn no Pull-up-Maxing', pb.band === null, pb.band);
  check('machines: 25 scapular pull-ups earn no Pull-up-Maxing', pb.scap === null, pb.scap);
  check('machines: pull-ups logged with the -Assist toggle earn no Pull-up-Maxing', pb.toggle === null, pb.toggle);
  check('machines: 12 real pull-ups still earn bronze', pb.real === 'bronze', pb.real);
  check('machines: live badge chip keys', pb.live === ',pullup,pushup', pb.live);
  // Add to a live workout: assist carried, icon thumb in the card, no page errors.
  await page.evaluate(() => { S.s('hist', []); startEmpty(); addExToWorkout('bi_assisted_pullup_machine'); });
  await page.waitForTimeout(200);
  const live = await page.evaluate(() => ({ assist: aw.exercises[0].assist, cap: bwCapable(aw.exercises[0]), mode: bwMode(aw.exercises[0]) }));
  check('machines: added to a workout it is assisted (-Assist mode)', live.assist === true && live.cap && live.mode === 'assist', JSON.stringify(live));
  check('machines: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function exerciseAudit() {
  // Mr. Roni 2026-09-27: audit how every exercise is categorized and follow it through the math. One check per bug class
  // the audit found, plus stress cases (blank muscle, custom, imported Hevy names, odd/unicode names, counterweight over
  // body weight, zero/negative weight, 0 and 100 reps).
  const set = (lb, r) => ({ weight: lb / LB, reps: r, done: true });
  const L = (exId, name, muscle, equip, sets, extra = {}) => ({ exId, name, muscle, equip, tracking: 'weight_reps', ...extra, sets });
  const cex = [
    { id: 'cexBack', name: 'Rack Chin Thing', muscle: 'Back', equip: 'machine', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexLegs', name: 'Sled Push', muscle: 'Legs', equip: 'other', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexFull', name: 'Burpee Thing', muscle: 'Full Body', equip: 'bodyweight', tracking: 'bodyweight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexKb', name: 'KB Press', muscle: 'Shoulders', equip: 'kettlebell', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexBand', name: 'Band Row', muscle: 'Back', equip: 'resistance_band', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexBlank', name: '', muscle: '', equip: '', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
    { id: 'cexOdd', name: '<b>Überkreuz</b> Curl ✨ "quoted"', muscle: 'Biceps', equip: 'dumbbell', tracking: 'weight_reps', category: 'strength', images: [], _c: true },
  ];
  const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', sex: 'male' }, bw: 80, cex }, now: SEP15 });
  await dbReady(page);
  // 1. Every library exercise is reachable from a filter chip (39 exercise-db lifts -- all "middle back" rows, neck, adductors, abductors -- were not).
  await page.evaluate(() => { sp('exercises'); buildMuscleChips('muscleChips', handleMFChip, null); });
  const chip = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#muscleChips .chip')].map(b => b.dataset.muscle);
    const inChip = (e, c) => c === 'warmup' ? (e.category || '').toLowerCase() === 'warmup' : c === 'cardio' ? isCardioCat(e) : (e.muscle || '').toLowerCase() === c;
    return { chips, orphans: allEx().filter(e => e.muscle && !chips.some(c => inChip(e, c))).map(e => e.name) };
  });
  check('audit: every library exercise with a muscle sits under a filter chip', chip.orphans.length === 0, chip.orphans.slice(0, 10).join(', '));
  check('audit: Middle Back / Neck / Adductors / Abductors chips exist', ['middle back', 'neck', 'adductors', 'abductors'].every(c => chip.chips.includes(c)), chip.chips.join());
  check('audit: custom Back / Legs / Full Body exercises get their chip', ['back', 'legs', 'full body'].every(c => chip.chips.includes(c)), chip.chips.join());
  const row = await page.evaluate(() => { mFlt = 'middle back'; document.getElementById('exSearch').value = 'bent over row'; renderEx(); return document.getElementById('exList').innerHTML.includes("openExInfo('Bent_Over_Barbell_Row')"); });
  check('audit: Bent Over Row (barbell) listed under Middle Back', row);
  const odd = await page.evaluate(() => { mFlt = 'biceps'; document.getElementById('exSearch').value = 'curl'; renderEx(); const h = document.getElementById('exList').innerHTML; return { esc: h.includes('&lt;b&gt;Überkreuz&lt;/b&gt;'), raw: h.includes('<b>Überkreuz</b>') }; });
  check('audit: odd/unicode custom name is listed and escaped', odd.esc && !odd.raw, JSON.stringify(odd));
  // 2. Strength math.
  const run = hist => page.evaluate(h => { S.s('hist', h); return muscleStrengthRatio(); }, hist);
  const d = '2026-09-12';
  let r = await run([wk(d, [L('Crunches', 'Crunches (bodyweight)', 'core', 'body only', [set(0, 15)])])]);
  check('audit: 15 bodyweight crunches do not score your body weight as a Core lift', r.core === 0, String(r.core));
  r = await run([wk(d, [L('Crunches', 'Crunches (bodyweight)', 'core', 'body only', [set(25, 10)], { bwMode: 'added' })])]);
  check('audit: weighted crunch (+25 lb) scores the 25 lb, not body weight + 25', Math.abs(r.core - 25 / LB * (1 + 10 / 30) / 80) < 0.001, String(r.core));
  r = await run([wk(d, [L('Glute_Kickback', 'Glute Kickback (bodyweight)', 'glutes', 'body only', [set(0, 20)])])]);
  check('audit: bodyweight glute kickbacks do not score a Glutes lift', r.glutes === 0, String(r.glutes));
  r = await run([wk(d, [L('Pullups', 'Pullups', 'lats', 'body only', [set(0, 10)])])]);
  check('audit: pull-ups still score body weight for Back', Math.abs(r.back - (1 + 10 / 30)) < 0.001, String(r.back));
  r = await run([wk(d, [L('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell, med grip)', 'chest', 'barbell', [set(225, 0)])])]);
  check('audit: a set with 0 reps is not a lift (no strength, 225 x 0)', r.chest === 0, String(r.chest));
  r = await run([wk(d, [L('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell, med grip)', 'chest', 'barbell', [set(95, 100)])])]);
  check('audit: 100 reps are capped at 10 for strength', Math.abs(r.chest - 95 / LB * (1 + 10 / 30) / 80) < 0.001, String(r.chest));
  r = await run([wk(d, [L('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell, med grip)', 'chest', 'barbell', [set(-135, 5)])])]);
  check('audit: negative weight scores nothing', r.chest === 0, String(r.chest));
  const ew = await page.evaluate(() => { const bw = gBW(), a = { name: 'Assisted Pull-Up (machine)', tracking: 'weight_reps', assist: true, equip: 'machine' }, n = { name: 'Bench Press', tracking: 'weight_reps', equip: 'barbell' };
    return { over: effWeight(a, { weight: bw + 30 }), negA: effWeight(a, { weight: -20 }), bw, negN: effWeight(n, { weight: -20 }), zero: effWeight(n, { weight: 0 }) }; });
  check('audit: counterweight over body weight = 0 load', ew.over === 0, String(ew.over));
  check('audit: negative counterweight never adds load above body weight', Math.abs(ew.negA - ew.bw) < 1e-9, JSON.stringify(ew));
  check('audit: negative weight on a normal lift = 0 load', ew.negN === 0 && ew.zero === 0, JSON.stringify(ew));
  const pr = await page.evaluate(() => { S.s('prs', {}); return [commitPRs({ exercises: [{ exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press', tracking: 'weight_reps', equip: 'barbell', sets: [{ weight: 100, reps: 0, done: true }] }] }).length,
    Object.keys(gPR()).length, e1rm(100, 0), e1rm(100, 1)]; });
  check('audit: 100 kg x 0 reps is not a PR and not a 1RM', pr[0] === 0 && pr[1] === 0 && pr[2] === 0 && pr[3] === 100, JSON.stringify(pr));
  const f = await page.evaluate(() => ({ kb: exStrengthFactor('cexKb', 'shoulders'), band: exStrengthFactor('cexBand', 'back'), incFly: exStrengthFactor('Incline_Dumbbell_Flyes', 'chest'), fly: exStrengthFactor('Dumbbell_Flyes', 'chest'),
    row: exStrengthFactor('Lying_Cambered_Barbell_Row', 'back'), ball: byId('Push-Ups_With_Feet_On_An_Exercise_Ball').equip, plyo: byId('Plyo_Kettlebell_Pushups').equip }));
  check('audit: custom kettlebell counts per hand (x2) like exercise-db kettlebells', f.kb === 2, String(f.kb));
  check('audit: custom resistance band uses the bands factor (1.5)', f.band === 1.5, String(f.band));
  check('audit: Incline Dumbbell Flyes scaled as isolation like flat Dumbbell Flyes', f.incFly === f.fly && f.fly > 3, JSON.stringify(f));
  check('audit: Lying Cambered Row scaled as a compound row', f.row === 1, String(f.row));
  check('audit: feet-on-ball / plyo kettlebell push-ups are bodyweight', f.ball === 'body only' && f.plyo === 'body only', JSON.stringify(f));
  // 3. Blank saved muscle still counts (usage chart, Challenge-Maxing).
  const u = await page.evaluate(() => { S.s('hist', [{ id: 'w1', name: 'Flat Bench', date: new Date('2026-09-12T12:00:00-06:00').toISOString(), exercises: [
      { exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press (barbell, med grip)', muscle: '', tracking: 'weight_reps', sets: [{ weight: 60, reps: 5, done: true }] },
      { exId: 'imp_cable_crunch', name: 'Cable Crunch', muscle: 'cardio', tracking: 'weight_reps', sets: [{ weight: 40, reps: 10, done: true }] },
      { exId: 'cexBlank', name: '', muscle: '', tracking: 'weight_reps', sets: [{ weight: 10, reps: 10, done: true }] }] }]);
    return { use: muscleUsage(), groups: gH()[0].exercises.map(e => logGroup(e)), sug: gH()[0].exercises.map(e => [...exGroups(e, gH()[0])].join('/')) }; });
  check('audit: blank saved muscle falls back to the library (bench -> chest usage)', u.use.chest === 1 && u.groups[0] === 'chest', JSON.stringify(u));
  check('audit: old imported crunch saved as cardio counts as Core usage', u.use.core === 1 && u.groups[1] === 'core', JSON.stringify(u));
  check('audit: blank custom exercise groups to nothing, no crash; routine name "Flat Bench" is not Back', u.groups[2] === '' && u.sug[2] === '', JSON.stringify(u));
  // 4. Imported Hevy names resolve to the right exercise and muscle.
  const csv = ['title,start_time,end_time,exercise_title,set_type,weight_lbs,reps',
    ...['Leg Raise', 'Leg Press (Machine)', 'Bench Press (Dumbbell)', 'Bench Press (Barbell)', 'Hip Thrust (Machine)', 'Lateral Raise (Machine)', 'Assisted Pull Up', 'Assisted Dip', 'Pull Up', 'Push Up',
      'Deadlift (Barbell)', 'Overhead Press (Barbell)', 'Cable Crunch', 'Walking', 'Décliné Préss', 'Überkreuz Curl', 'Seated Cable Row - V Grip (Cable)', 'Triceps Rope Pushdown'].map(n => `"Push","2026-09-11 18:00","2026-09-11 19:00","${n}","normal",50,10`),
    '"Push","2026-09-11 18:00","2026-09-11 19:00","","normal",50,10'].join('\n');
  const imp = await page.evaluate(async csv => { S.s('hist', []); await importWorkoutCsv(csv); const w = gH()[0]; return Object.fromEntries(w.exercises.map(e => [e.name, { id: e.exId, lib: byId(e.exId).name, muscle: e.muscle, g: logGroup(e) }])); }, csv);
  const I = n => imp[n] || {};
  check('audit: import "Leg Raise" is a core leg raise, not a calf raise', I('Leg Raise').g === 'core', JSON.stringify(I('Leg Raise')));
  check('audit: import "Leg Press (Machine)" is the leg press, not the calf press', I('Leg Press (Machine)').id === 'Leg_Press', JSON.stringify(I('Leg Press (Machine)')));
  check('audit: import "Bench Press (Dumbbell)" is a dumbbell bench, not the barbell one', /dumbbell/i.test(I('Bench Press (Dumbbell)').lib || '') && I('Bench Press (Dumbbell)').id !== I('Bench Press (Barbell)').id, JSON.stringify([I('Bench Press (Dumbbell)'), I('Bench Press (Barbell)')]));
  check('audit: import "Bench Press (Barbell)" is the plain barbell bench', I('Bench Press (Barbell)').id === 'Barbell_Bench_Press_-_Medium_Grip', JSON.stringify(I('Bench Press (Barbell)')));
  check('audit: import machine names land on the new built-ins', I('Hip Thrust (Machine)').id === 'bi_hip_thrust_machine' && I('Lateral Raise (Machine)').id === 'bi_lateral_raise_machine' && I('Assisted Pull Up').id === 'bi_assisted_pullup_machine' && I('Assisted Dip').id === 'bi_assisted_dip_machine', JSON.stringify([I('Hip Thrust (Machine)'), I('Lateral Raise (Machine)'), I('Assisted Pull Up'), I('Assisted Dip')]));
  check('audit: import "Pull Up" is a pull-up, not the band-assisted one', I('Pull Up').id === 'Pullups', JSON.stringify(I('Pull Up')));
  check('audit: import "Push Up" is a plain push-up', /^push.?ups?$/i.test((I('Push Up').lib || '').replace(/\s*\(.*\)$/, '')), JSON.stringify(I('Push Up')));
  check('audit: import "Deadlift (Barbell)" is the barbell deadlift', I('Deadlift (Barbell)').id === 'Barbell_Deadlift', JSON.stringify(I('Deadlift (Barbell)')));
  check('audit: import "Overhead Press (Barbell)" is not a Smith machine press', !/smith|machine/i.test(I('Overhead Press (Barbell)').lib || '') && I('Overhead Press (Barbell)').g === 'shoulders', JSON.stringify(I('Overhead Press (Barbell)')));
  check('audit: import "Cable Crunch" is Core', I('Cable Crunch').g === 'core', JSON.stringify(I('Cable Crunch')));
  check('audit: import "Walking" is not a walking lunge', !/lunge/i.test(I('Walking').lib || '') && I('Walking').muscle === 'cardio', JSON.stringify(I('Walking')));
  check('audit: import "Décliné Préss" (accents) is not matched to Incline', !/incline/i.test(I('Décliné Préss').lib || ''), JSON.stringify(I('Décliné Préss')));
  check('audit: import "Überkreuz Curl" (unicode) guessed biceps', I('Überkreuz Curl').g === 'biceps', JSON.stringify(I('Überkreuz Curl')));
  check('audit: import blank exercise name is skipped', !('' in imp), Object.keys(imp).join('|'));
  check('audit: every imported lift lands in a real group', Object.entries(imp).filter(([n, v]) => n !== 'Walking' && !v.g).length === 0, JSON.stringify(Object.entries(imp).filter(([n, v]) => !v.g)));
  // 5. Starter programs still resolve every keyword.
  const cur = await page.evaluate(() => CURATED.flatMap(p => p.routines.flatMap(r => r.exercises.map(k => [k, resolveExercise(k), (byId(resolveExercise(k)) || {}).name]))));
  check('audit: every starter-program keyword resolves', cur.every(c => c[1]), JSON.stringify(cur.filter(c => !c[1])));
  const cm = Object.fromEntries(cur.map(c => [c[0], c[1]]));
  check('audit: starter "barbell squat" / "deadlift" / "pullup" / "leg press" / "leg raise" resolve to the plain lifts', cm['barbell squat'] === 'Barbell_Squat' && cm['deadlift'] === 'Barbell_Deadlift' && cm['pullup'] === 'Pullups' && cm['leg press'] === 'Leg_Press' && /leg_raise/i.test(cm['leg raise'] || '') && !/calf/i.test(cm['leg raise'] || ''), JSON.stringify(cm));
  check('audit: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function multiMuscleCredit() {
  // Mr. Roni 2026-09-27: "Glutes say that they aren't worked out but squats ... incorporate glutes". A compound lift
  // now also credits the groups it works as a prime mover (exCredits), converted to that group's reference lift, and
  // a group scores the stronger of its direct and its credited evidence.
  const BW = 229 / LB, NOW = new Date('2026-09-27T20:30:00-06:00'), d = '2026-09-20';
  const lift = (id, name, muscle, sets, extra = {}) => ({ ...ex(name, sets, 'weight_reps', id), muscle, ...extra });
  const squat = lift('Barbell_Squat', 'Squat (barbell)', 'quadriceps', [[315, 5]]);
  const bench = lift('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell, med grip)', 'chest', [[225, 8]]);
  const ohp = lift('Standing_Military_Press', 'Standing Military Press (barbell)', 'shoulders', [[135, 6]]);
  const row = lift('Bent_Over_Barbell_Row', 'Bent Over Row (barbell)', 'middle back', [[185, 8]]);
  const curl = lift('Barbell_Curl', 'Curl (barbell)', 'biceps', [[95, 10]]);
  const thrust = lift('Barbell_Hip_Thrust', 'Hip Thrust (barbell)', 'glutes', [[405, 8]]);
  const thrustLight = lift('Barbell_Hip_Thrust', 'Hip Thrust (barbell)', 'glutes', [[95, 8]]);
  const pushups = lift('Pushups', 'Pushups (bodyweight)', 'chest', [[0, 40]], { equip: 'body only' });
  const pullups = lift('Pullups', 'Pullups', 'lats', [[0, 10]], { equip: 'body only' });
  const pullupsNoEquip = lift('Pullups', 'Pullups', 'lats', [[0, 10]]);
  const bwSquat = { exId: 'wu_quads', name: 'Bodyweight Squat', muscle: 'quadriceps', tracking: 'reps_only', sets: [{ weight: 0, reps: 20, done: true }] };
  const prof = { name: 'T', username: '@t', code: '@t', sex: 'male', birthday: '2000-07-10' };
  const { page, ctx, errors } = await phone({ seed: { hist: [], bw: BW, prof }, now: NOW });
  await dbReady(page);
  const run = exs => page.evaluate(h => { S.s('hist', h); const p = musclePerf(), r = muscleStrengthRatio(), c = creditStrength(), sc = p.score;
    const L = g => strengthLabel(sc[g]).l, std = g => STRENGTH_STD[g].male;
    return { sc, L: Object.fromEntries(MGROUPS.map(g => [g, L(g)])), r, c, glutesLadder: std('glutes'), mode: p.mode }; }, [wk(d, exs)]);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // 1. Squats only: Glutes gets the tier the hip-thrust ladder gives a squat converted at 309 / 289, capped at the squat's own Legs tier.
  let r = await run([squat]);
  const expG = await page.evaluate(ratio => Math.min(strengthScore('legs', ratio), strengthScore('glutes', ratio * 309 / 289)), r.r.legs);
  check('multi-credit: squats only -> Glutes has a real tier, not Untrained', r.L.glutes !== 'Untrained' && r.sc.glutes > 0, JSON.stringify(r.L));
  check('multi-credit: squats only -> Glutes score = squat on the hip-thrust ladder (x1.07), capped at the Legs tier', near(r.sc.glutes, expG), `${r.sc.glutes} vs ${expG}`);
  check('multi-credit: 315 x 5 squat at 229 lb -> Legs Strong, Glutes Strong', r.L.legs === 'Strong' && r.L.glutes === 'Strong', JSON.stringify(r.L));
  check('multi-credit: squats do not credit Back (lower back is a stabiliser)', r.sc.back === 0, String(r.sc.back));
  const map = await page.evaluate(() => { const c = cardBody(), el = document.createElement('div'); el.innerHTML = c.html;
    const row = [...el.querySelectorAll('.mr-item')].map(e => e.innerText.replace(/\s+/g, ' ')).find(t => /Glutes/.test(t)) || '';
    return { row, fill: heatColor(musclePerf().score.glutes), paths: c.html.includes(`fill="${heatColor(musclePerf().score.glutes)}"`) }; });
  check('multi-credit: Muscle Map row and body map agree on the Glutes tier', /Strong/.test(map.row) && map.fill === '#4da3ff' && map.paths, JSON.stringify(map));
  const sug = await page.evaluate(() => [...exGroups(gH()[0].exercises[0], gH()[0])].sort().join());
  check('multi-credit: Suggested today reads the squat as Legs + Glutes too', sug === 'glutes,legs', sug);
  // 2. Bench only: triceps as before (0.97 on the close-grip ladder), shoulders credited but never above the bench's own Chest tier.
  r = await run([bench]);
  const expT = await page.evaluate(ratio => [strengthScore('triceps', ratio * 206 / 212), strengthScore('triceps', ratio * 0.97)], r.r.chest);
  check('multi-credit: bench only -> Triceps = bench x 206/212 on the close-grip ladder (old press credit, unrounded)', near(r.sc.triceps, expT[0]) && r.sc.triceps >= expT[1] && r.L.triceps === 'Strong', `${r.sc.triceps} vs ${expT} ${r.L.triceps}`);
  check('multi-credit: bench only -> Shoulders credited, capped at the Chest tier', r.sc.shoulders > 0 && r.sc.shoulders <= r.sc.chest + 1e-12, JSON.stringify(r.sc));
  check('multi-credit: bench does not credit Back or Biceps', r.sc.back === 0 && r.sc.biceps === 0, JSON.stringify(r.sc));
  const sugB = await page.evaluate(() => [...exGroups(gH()[0].exercises[0], gH()[0])].join());
  check('multi-credit: Suggested today still does not count a chest day as Arms/Shoulders', sugB === 'chest', sugB);
  // Overhead press credits triceps at close-grip 206 / press 137 (was 0.97): never lower than the old number.
  r = await run([ohp]);
  const oldT = await page.evaluate(ratio => strengthScore('triceps', ratio * 0.97), r.r.shoulders);
  check('multi-credit: overhead press -> Triceps at least the old press credit', r.sc.triceps >= oldT - 1e-12 && r.sc.triceps > 0, `${r.sc.triceps} vs old ${oldT}`);
  // 3. Rows only: Biceps from the row converted to a barbell curl (99 / 192), capped at the row's Back tier.
  r = await run([row]);
  const expB = await page.evaluate(ratio => Math.min(strengthScore('back', ratio), strengthScore('biceps', ratio * 99 / 192)), r.r.back);
  check('multi-credit: rows only -> Biceps has a real tier', r.sc.biceps > 0 && r.L.biceps !== 'Untrained', JSON.stringify(r.L));
  check('multi-credit: rows only -> Biceps = row on the curl ladder (x0.52), capped at Back', near(r.sc.biceps, expB), `${r.sc.biceps} vs ${expB}`);
  // 4. Isolation credits nothing.
  r = await run([curl]);
  check('multi-credit: curls do not credit Chest or Back (or anything)', r.sc.chest === 0 && r.sc.back === 0 && MGROUPS_ok(r.sc, 'biceps'), JSON.stringify(r.sc));
  // 5. The audit's bodyweight rules still hold for credits.
  r = await run([pushups]);
  check('multi-credit: plain push-ups credit no Triceps / Shoulders (body weight is not the load)', r.sc.triceps === 0 && r.sc.shoulders === 0 && r.sc.chest === 0, JSON.stringify(r.sc));
  r = await run([bwSquat]);
  check('multi-credit: bodyweight squats credit no Glutes tier', r.sc.glutes === 0 && r.sc.legs === 0, JSON.stringify(r.sc));
  r = await run([pullups]);
  check('multi-credit: pull-ups (body weight is the load) credit Biceps', r.sc.biceps > 0 && r.sc.biceps <= r.sc.back + 1e-12, JSON.stringify(r.sc));
  r = await run([pullupsNoEquip]);
  check('multi-credit: an imported pull-up with no equipment saved scores Back from body weight and credits Biceps', r.sc.back > 0 && r.sc.biceps > 0, JSON.stringify(r.sc));
  // 6. Direct evidence stronger than the credit is never lowered, and a stronger credit lifts a weak direct score.
  const alone = await run([thrust]), both = await run([thrust, squat]);
  check('multi-credit: a strong hip thrust is not lowered by a squat credit', near(both.sc.glutes, alone.sc.glutes) && alone.sc.glutes > 0, `${both.sc.glutes} vs ${alone.sc.glutes}`);
  const weak = await run([thrustLight]), weakSq = await run([thrustLight, squat]);
  check('multi-credit: a light hip thrust does not drag the squat credit down (stronger wins, no average)', near(weakSq.sc.glutes, expG) && weakSq.sc.glutes > weak.sc.glutes, `${weakSq.sc.glutes} vs ${expG}, light ${weak.sc.glutes}`);
  // 7. Custom / imported names without exercise-db secondaries go by the name.
  const cr = await page.evaluate(() => { S.s('cex', [{ id: 'cexSq', name: 'Back Squat', muscle: 'quadriceps', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true },
    { id: 'cexCurl', name: 'Spider Curl', muscle: 'biceps', equip: 'dumbbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }]);
    const k = o => Object.entries(exCredits(o)).filter(([, c]) => c.f > 0).map(([g, c]) => g + ':' + c.f.toFixed(2)).join();
    return { sq: k({ exId: 'cexSq', name: 'Back Squat', muscle: 'quadriceps' }), curl: k({ exId: 'cexCurl', name: 'Spider Curl', muscle: 'biceps' }),
      imp: k({ exId: 'imp_row', name: 'Bent Over Row (Barbell)', muscle: 'middle back' }), tgu: k({ exId: 'Kettlebell_Turkish_Get-Up_Squat_style', name: 'Turkish Get-Up (Squat style)', muscle: 'shoulders' }) }; });
  check('multi-credit: custom "Back Squat" credits glutes at 1.07', cr.sq === 'glutes:1.07', cr.sq);
  check('multi-credit: custom curl credits nothing', cr.curl === '', cr.curl);
  check('multi-credit: imported "Bent Over Row" credits biceps', /^biceps:0\.52$/.test(cr.imp), cr.imp);
  check('multi-credit: a Turkish get-up is not scored as a loaded squat', !/glutes/.test(cr.tgu), cr.tgu);
  // 8. No body weight logged: the map ranks by sets, and a squat set counts half a set for glutes.
  await page.evaluate(() => S.s('bw', 0));
  r = await run([squat]);
  check('multi-credit: without body weight, squats still show Glutes (half a set each)', r.mode === 'volume' && r.sc.glutes === 0.5 && r.L.glutes !== 'Untrained', JSON.stringify(r.sc));
  check('multi-credit: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function profileTabs() {
  // 2026-09-29 his pick "folder A": the active tab and its fields are one card; Save inside, Data & Backup outside.
  const { page, ctx, errors } = await phone();
  await page.evaluate(() => openProf()); await page.waitForTimeout(300);
  const st = () => page.evaluate(() => { const w = document.getElementById('profTabs'), panel = w.querySelector('.ptabs-panel');
    const save = [...document.querySelectorAll('#profModal button')].find(b => /Save Profile/.test(b.textContent));
    const backup = [...document.querySelectorAll('#profModal .blk-t')].find(e => /Data & Backup/.test(e.textContent));
    return { tab: w.dataset.tab, pv: w.dataset.pv || null, main: getComputedStyle(document.getElementById('profTab-main')).display, body: getComputedStyle(document.getElementById('profTab-body')).display,
      saveIn: panel.contains(save), backupOut: !!backup && !w.contains(backup), fieldsIn: panel.contains(document.getElementById('profTab-main')) && panel.contains(document.getElementById('profTab-body')),
      activeOp: getComputedStyle(w.querySelector('.ptabs-tog button.active')).opacity, idleOp: getComputedStyle(w.querySelector('.ptabs-tog button:not(.active)')).opacity }; });
  let s = await st();
  check('profile tabs: opens on Profile, card attached to it', s.tab === 'main' && s.main === 'block' && s.body === 'none', JSON.stringify(s));
  check('profile tabs: both tabs\' fields live inside the card', s.fieldsIn);
  check('profile tabs: Save Profile is inside the card, Data & Backup is outside', s.saveIn && s.backupOut, JSON.stringify(s));
  check('profile tabs: inactive tab recedes (dimmer than the active one)', +s.idleOp < +s.activeOp, `${s.idleOp} vs ${s.activeOp}`);
  await page.locator('#profTabTog button[data-v=body]').click();
  s = await st();
  check('profile tabs: one tap switches to Body Metrics and the card follows', s.tab === 'body' && s.main === 'none' && s.body === 'block', JSON.stringify(s));
  const left = await page.evaluate(() => ({ html: document.documentElement.innerHTML.includes('jkui_ptv'), ls: localStorage.getItem('jkui_ptv') }));
  check('profile tabs: mockup switch (?ptv / jkui_ptv) and variant B/C are gone', !left.html && left.ls === null && s.pv === null, JSON.stringify(left));
  check('profile tabs: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function badgeStandard() {
  // One standard exercise per badge (Mr. Roni, 2026-09-29), pinned to exact library ids; customs never count; Hevy imports count
  // when they map to the same exercise. Real exercise-db loaded.
  const { page, ctx, errors } = await phone({ seed: { bw: 180 / LB, prof: { name: 'T', username: '@t', code: '@t', sex: 'male', birthday: '1995-01-01' } }, now: SEP15 });
  await page.evaluate(async () => { loadDB(); for (let i = 0; i < 100 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  const tiers = (exs, wid = 'wlive') => page.evaluate(([exs, wid]) => { S.s('hist', [{ id: wid, name: 'W', date: new Date('2026-09-12T12:00:00-06:00').toISOString(), exercises: exs, duration: '30:00', sets: 1, totalVolume: 0 }]);
    const o = {}; computeBadges().forEach(b => { o[b.name] = b.tier || (b.earned ? 'earned' : null); }); return o; }, [exs, wid]);
  const E = (exId, name, sets, tracking = 'weight_reps') => ({ exId, name, muscle: 'chest', tracking, sets: sets.map(([w, r]) => ({ weight: tracking === 'distance' ? w : w / LB, reps: r, done: true })) });
  let t;
  // Cardio-Maxing: running only.
  t = await tiers([E('cex1', 'Stationary Bike', [[6, 20]], 'distance')]);
  check('standard: a custom bike ride earns no Cardio-Maxing', t['Cardio-Maxing'] === null, JSON.stringify(t['Cardio-Maxing']));
  t = await tiers([E('cex2', 'Running', [[3, 18]], 'distance')]);
  check('standard: a run logged under a user-made "Running" exercise does not count', t['Cardio-Maxing'] === null, t['Cardio-Maxing']);
  t = await tiers([E('Walking_Treadmill', 'Walking, Treadmill', [[3, 18]], 'distance')]);
  check('standard: a treadmill walk does not count', t['Cardio-Maxing'] === null, t['Cardio-Maxing']);
  t = await tiers([E('bi_run_outdoor', 'Running (outdoor)', [[3, 21]], 'distance')]);
  check('standard: Running (outdoor) counts for Cardio-Maxing', !!t['Cardio-Maxing'], t['Cardio-Maxing']);
  t = await tiers([E('Running_Treadmill', 'Running (treadmill)', [[3, 21]], 'distance')]);
  check('standard: Running (treadmill) counts for Cardio-Maxing', !!t['Cardio-Maxing'], t['Cardio-Maxing']);
  // Pull-ups: strict only.
  t = await tiers([E('Chin-Up', 'Chin-Up', [[0, 25]], 'bodyweight_reps')]);
  check('standard: 25 chin-ups earn no Pull-up-Maxing', t['Pull-up-Maxing'] === null, t['Pull-up-Maxing']);
  t = await tiers([E('Pullups', 'Pullups', [[0, 20]], 'bodyweight_reps')]);
  check('standard: 20 strict pull-ups earn Gold', t['Pull-up-Maxing'] === 'gold', t['Pull-up-Maxing']);
  t = await tiers([E('cex3', 'Pull-up', [[0, 20]], 'bodyweight_reps')]);
  check('standard: a custom exercise named "Pull-up" earns nothing', t['Pull-up-Maxing'] === null, t['Pull-up-Maxing']);
  // Legs: barbell back squat only.
  t = await tiers([E('Front_Barbell_Squat', 'Front Squat (barbell)', [[400, 5]])]);
  check('standard: a front squat earns no Leg-Maxing', t['Leg-Maxing'] === null, t['Leg-Maxing']);
  t = await tiers([E('Smith_Machine_Squat', 'Smith Machine Squat', [[400, 5]])]);
  check('standard: a Smith machine squat earns no Leg-Maxing', t['Leg-Maxing'] === null, t['Leg-Maxing']);
  t = await tiers([E('Barbell_Squat', 'Squat (barbell)', [[360, 5]])]);
  check('standard: barbell back squat 2x body weight earns Gold', t['Leg-Maxing'] === 'gold', t['Leg-Maxing']);
  // Bench / OHP / push-ups.
  t = await tiers([E('cex4', 'Barbell Bench Press', [[405, 1]])]);
  check('standard: a custom "Barbell Bench Press" earns no Bench-Maxing', t['Bench-Maxing'] === null, t['Bench-Maxing']);
  t = await tiers([E('Barbell_Incline_Bench_Press_-_Medium_Grip', 'Incline Bench Press (barbell)', [[405, 1]])]);
  check('standard: incline bench earns no Bench-Maxing', t['Bench-Maxing'] === null, t['Bench-Maxing']);
  t = await tiers([E('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell)', [[405, 1]])]);
  check('standard: barbell flat bench earns Gold', t['Bench-Maxing'] === 'gold', t['Bench-Maxing']);
  t = await tiers([E('Seated_Barbell_Military_Press', 'Seated Military Press (barbell)', [[185, 5]]), E('Standing_Military_Press', 'Standing Military Press (barbell)', [[95, 5]])]);
  check('standard: seated press ignored, standing barbell press counts (95 x5 at 180 lb = Silver)', t['Shoulder-Maxing'] === 'silver', t['Shoulder-Maxing']);
  t = await tiers([E('Incline_Push-Up', 'Incline Push-Up', [[0, 90]], 'bodyweight_reps'), E('Pushups', 'Pushups', [[0, 35]], 'bodyweight_reps')]);
  check('standard: incline push-ups ignored, standard push-ups count (35 = Bronze)', t['Push-up-Maxing'] === 'bronze', t['Push-up-Maxing']);
  // 1000lb Club: the three standard barbell lifts only.
  const big = b => [E(b, 'bench', [[400, 1]]), E('Barbell_Squat', 'Squat (barbell)', [[400, 1]]), E('Barbell_Deadlift', 'Deadlift (barbell)', [[400, 1]])];
  t = await tiers(big('Smith_Machine_Bench_Press'));
  check('standard: Smith machine bench does not count toward the 1000lb Club', t['1000lb Club'] === null, t['1000lb Club']);
  t = await tiers(big('Dumbbell_Bench_Press'));
  check('standard: dumbbell bench does not count toward the 1000lb Club', t['1000lb Club'] === null, t['1000lb Club']);
  t = await tiers([...big('Barbell_Bench_Press_-_Medium_Grip').slice(0, 2), E('Sumo_Deadlift', 'Sumo Deadlift', [[400, 1]])]);
  check('standard: sumo deadlift does not count toward the 1000lb Club', t['1000lb Club'] === null, t['1000lb Club']);
  t = await tiers(big('Barbell_Bench_Press_-_Medium_Grip'));
  check('standard: barbell bench + back squat + deadlift = 1200 lb earns the 1000lb Club', t['1000lb Club'] === 'earned', t['1000lb Club']);
  // An old import filed under a custom id is judged by its real name; a live workout's custom never is.
  t = await tiers([E('cex9', 'Bench Press (Barbell)', [[405, 1]])], 'w1789000000000_0');
  check('standard: an imported "Bench Press (Barbell)" counts even if it was filed under a custom', t['Bench-Maxing'] === 'gold', t['Bench-Maxing']);
  t = await tiers([E('Pullups', 'Pull Up (Assisted)', [[0, 25]], 'bodyweight_reps'), E('Pullups', 'Pull Up (Band)', [[0, 25]], 'bodyweight_reps')], 'w1789000000000_0');
  check('standard: imported assisted / band pull-ups do not count even when filed under Pullups', t['Pull-up-Maxing'] === null, t['Pull-up-Maxing']);
  // Live chip in the workout logger.
  const live = await page.evaluate(() => [exerciseBadgeKey({ exId: 'cex4', name: 'Barbell Bench Press' }), exerciseBadgeKey({ exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press (barbell)' }),
    exerciseBadgeKey({ exId: 'Chin-Up', name: 'Chin-Up' }), exerciseBadgeKey({ exId: 'bi_run_outdoor', name: 'Running (outdoor)', tracking: 'distance' }), exerciseBadgeKey({ exId: 'cex1', name: 'Running', tracking: 'distance' })].join());
  check('standard: live badge chip only on the standard exercises', live === ',bench,,cardio,', live);
  // Popup button starts that exact exercise; the text names it.
  const plan = await page.evaluate(() => Object.fromEntries(['Bench-Maxing', 'Shoulder-Maxing', 'Leg-Maxing', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing', '1000lb Club'].map(n => [n, badgePlan({ name: n }).ids.join('+')])));
  check('standard: start-workout buttons start the exact standard exercises', JSON.stringify(plan) === JSON.stringify({ 'Bench-Maxing': 'Barbell_Bench_Press_-_Medium_Grip', 'Shoulder-Maxing': 'Standing_Military_Press', 'Leg-Maxing': 'Barbell_Squat',
    'Pull-up-Maxing': 'Pullups', 'Push-up-Maxing': 'Pushups', 'Cardio-Maxing': 'bi_run_outdoor', '1000lb Club': 'Barbell_Bench_Press_-_Medium_Grip+Barbell_Squat+Barbell_Deadlift' }), JSON.stringify(plan));
  const how = await page.evaluate(() => ['Bench-Maxing', 'Shoulder-Maxing', 'Leg-Maxing', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing', '1000lb Club'].map(n => BADGE_DETAIL[n].how + ' || ' + BADGE_HOW[n]));
  const want = [/barbell flat bench/i, /standing barbell overhead press/i, /barbell back squat/i, /strict pull-ups/i, /standard push-ups/i, /Running \(outdoor\) or Running \(treadmill\)/, /barbell flat bench press \+ barbell back squat \+ conventional barbell deadlift/i];
  check('standard: every badge\'s how-to text names its exercise (list and popup)', how.every((h, i) => h.split(' || ').every(x => want[i].test(x))), how.filter((h, i) => !h.split(' || ').every(x => want[i].test(x))).join(' ## '));
  const run = await page.evaluate(() => { const e = byId('bi_run_outdoor'), t = byId('Running_Treadmill'); return [e.name, e.tracking, isCardioCat(e), isCustomEx(e.id), t.name, t.tracking, !!imgUrl(t)]; });
  check('standard: the two runs are built into the library, distance-tracked, under Cardio, with the treadmill photo', JSON.stringify(run) === JSON.stringify(['Running (outdoor)', 'distance', true, false, 'Running (treadmill)', 'distance', true]), JSON.stringify(run));
  await page.evaluate(async () => { const b = computeBadges().find(x => x.name === 'Cardio-Maxing'); _badgeOpen = b; S.s('hist', []); await badgeStart(); });
  await page.waitForTimeout(300);
  const aw1 = await page.evaluate(() => aw && aw.exercises.map(e => e.exId + ':' + e.tracking).join());
  check('standard: Cardio-Maxing button opens a workout with Running (outdoor), distance-tracked', aw1 === 'bi_run_outdoor:distance', aw1);
  check('standard: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  // Hevy CSV import: the standard lifts count, the look-alikes don't.
  const imp = async rows => { const { page, ctx, errors } = await phone({ seed: { bw: 180 / LB, prof: { name: 'T', username: '@t', code: '@t', sex: 'male', birthday: '1995-01-01' } }, now: SEP15 });
    const csv = ['title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps,distance_km,duration_seconds', ...rows.map(r => `"Push","12 Sep 2026, 10:00","12 Sep 2026, 11:00",${r}`)].join('\n');
    await page.evaluate(async csv => { await importWorkoutCsv(csv); }, csv);
    const o = await page.evaluate(() => { const o = {}; computeBadges().forEach(b => { o[b.name] = b.tier || (b.earned ? 'earned' : null); }); o._ex = gH().flatMap(w => w.exercises.map(e => e.exId + ':' + e.tracking)); return o; });
    await ctx.close(); return { o, errors }; };
  let r = await imp(['"Bench Press (Barbell)",0,normal,405,1,,', '"Squat (Barbell)",0,normal,405,5,,', '"Deadlift (Barbell)",0,normal,405,1,,', '"Overhead Press (Barbell)",0,normal,185,5,,', '"Pull Up",0,normal,0,20,,', '"Push Up",0,normal,0,80,,', '"Running",0,normal,,,5,1200']);
  check('standard: Hevy "Bench Press (Barbell)" counts for Bench-Maxing', r.o['Bench-Maxing'] === 'gold', JSON.stringify(r.o));
  check('standard: Hevy "Squat (Barbell)" counts for Leg-Maxing', r.o['Leg-Maxing'] === 'gold', r.o['Leg-Maxing']);
  check('standard: Hevy "Overhead Press (Barbell)" counts for Shoulder-Maxing', r.o['Shoulder-Maxing'] === 'gold', r.o['Shoulder-Maxing']);
  check('standard: Hevy "Pull Up" and "Push Up" count', r.o['Pull-up-Maxing'] === 'gold' && r.o['Push-up-Maxing'] === 'gold', `${r.o['Pull-up-Maxing']} ${r.o['Push-up-Maxing']}`);
  check('standard: Hevy bench + squat + deadlift make the 1000lb Club', r.o['1000lb Club'] === 'earned', r.o['1000lb Club']);
  check('standard: a Hevy "Running" with distance and time imports as a run and counts for Cardio-Maxing', r.o._ex.includes('bi_run_outdoor:distance') && !!r.o['Cardio-Maxing'], JSON.stringify(r.o._ex) + ' ' + r.o['Cardio-Maxing']);
  check('standard: Hevy import has no page errors', r.errors.length === 0, r.errors.join(' | '));
  r = await imp(['"Bench Press (Smith Machine)",0,normal,405,1,,', '"Front Squat",0,normal,405,5,,', '"Sumo Deadlift",0,normal,405,1,,', '"Chin Up",0,normal,0,25,,', '"Pull Up (Assisted)",0,normal,0,25,,', '"Pull Up (Band)",0,normal,0,25,,', '"Knee Push Up",0,normal,0,90,,', '"Cycling",0,normal,,,30,1800']);
  check('standard: Hevy Smith bench, front squat, sumo, chin-ups, assisted/band pull-ups, knee push-ups and cycling earn nothing',
    ['Bench-Maxing', 'Leg-Maxing', '1000lb Club', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing'].every(n => r.o[n] === null), JSON.stringify(r.o));
}
async function benchSubstitutes() {
  // Bench-Maxing ONLY accepts a flat dumbbell bench too (Mr. Roni, 2026-09-30): pair / 0.83 (Saeterbakken 2011), logged per hand.
  // Each lift sits on the tier it reached; the badge takes the highest and names the lift. No GOODLIFT points in the popup.
  const { page, ctx, errors } = await phone({ seed: { bw: 180 / LB, prof: { name: 'T', username: '@t', code: '@t', sex: 'male', birthday: '1995-01-01' } }, now: SEP15 });
  await page.evaluate(async () => { loadDB(); for (let i = 0; i < 100 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  const E = (exId, name, lb, reps = 1) => ({ exId, name, muscle: 'chest', tracking: 'weight_reps', sets: [{ weight: lb / LB, reps, done: true }] });
  const run = (exs, wid = 'wlive') => page.evaluate(([exs, wid]) => { S.s('hist', [{ id: wid, name: 'W', date: new Date('2026-09-12T12:00:00-06:00').toISOString(), exercises: exs, duration: '30:00', sets: 1, totalVolume: 0 }]);
    const b = computeBadges().find(x => x.name === 'Bench-Maxing'); return { tier: b.tier || null, desc: b.desc, curV: b.curV, all: b.all && b.all.v, lifts: (b.lifts || []).map(l => [l.label, Math.round(l.v), l.tier || null]), T: badgeT().bench }; }, [exs, wid]);
  let r = await run([E('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell)', 185), E('Dumbbell_Bench_Press', 'Bench Press (dumbbell)', 100)]);
  const tierOf = (v, T) => v >= T[2] ? 'gold' : v >= T[1] ? 'silver' : v >= T[0] ? 'bronze' : null;
  check('bench subs: 100 lb dumbbells per hand convert to 241 lb (2 x 100 / 0.83)', JSON.stringify(r.lifts[1]) === JSON.stringify(['Dumbbell bench', 241, tierOf(200 / 0.83, r.T)]), JSON.stringify(r.lifts));
  check('bench subs: barbell 185 sits on its own tier', JSON.stringify(r.lifts[0]) === JSON.stringify(['Barbell bench', 185, tierOf(185, r.T)]), JSON.stringify(r.lifts) + ' ' + r.T);
  check('bench subs: the badge takes the higher tier (the dumbbell one)', r.tier === tierOf(241, r.T) && (r.tier !== tierOf(185, r.T)), `${r.tier} ladder ${r.T}`);
  check('bench subs: list row names the lift that reached it', /Dumbbell bench 241/.test(r.desc) && r.curV === '241 lb (Dumbbell bench)' && r.all === '241 lb (Dumbbell bench)', `${r.desc} | ${r.curV} | ${r.all}`);
  r = await run([E('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell)', 300), E('Dumbbell_Bench_Press', 'Bench Press (dumbbell)', 50)]);
  check('bench subs: a stronger barbell bench wins, and the row shows no substitute label', r.tier === tierOf(300, r.T) && r.curV === '300 lb' && !/Dumbbell/.test(r.desc), `${r.tier} ${r.curV} ${r.desc}`);
  r = await run([E('Smith_Machine_Bench_Press', 'Smith Machine Bench Press', 405)]);
  check('bench subs: Smith machine bench is not counted (sources contradict a discount; waiting on his call)', r.tier === null && !r.lifts.length, JSON.stringify(r));
  r = await run([E('Dumbbell_Bench_Press_with_Neutral_Grip', 'Neutral grip', 120), E('Hammer_Grip_Incline_DB_Bench_Press', 'Incline Dumbbell Press', 120), E('Decline_Dumbbell_Bench_Press', 'Decline Dumbbell Bench Press', 120), E('cex7', 'Dumbbell Bench Press', 120)]);
  check('bench subs: neutral-grip, incline, decline and custom "Dumbbell Bench Press" do not count', r.tier === null && !r.lifts.length, JSON.stringify(r.lifts));
  r = await run([E('cex8', 'Bench Press (Dumbbell)', 100)], 'w1789000000000_0');
  check('bench subs: a Hevy-imported "Bench Press (Dumbbell)" counts as the dumbbell substitute', JSON.stringify(r.lifts) === JSON.stringify([['Dumbbell bench', 241, tierOf(200 / 0.83, r.T)]]), JSON.stringify(r.lifts));
  const club = await page.evaluate(() => { S.s('hist', [{ id: 'wl', name: 'W', date: new Date('2026-09-12T12:00:00-06:00').toISOString(), exercises: [['Dumbbell_Bench_Press', 200], ['Barbell_Squat', 400], ['Barbell_Deadlift', 400]].map(([id, lb]) => ({ exId: id, name: id, tracking: 'weight_reps', sets: [{ weight: lb / 2.20462, reps: 1, done: true }] })), duration: '30:00', sets: 1, totalVolume: 0 }]);
    return computeBadges().find(b => b.name === '1000lb Club').earned; });
  check('bench subs: dumbbells never count toward the 1000lb Club', club === false);
  check('bench subs: live chip on the dumbbell bench is Bench-Maxing', await page.evaluate(() => exerciseBadgeKey({ exId: 'Dumbbell_Bench_Press', name: 'Bench Press (dumbbell)' })) === 'bench');
  // Popup: each lift on its tier, value + exercise; no GOODLIFT points; thresholds kept.
  await run([E('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press (barbell)', 120), E('Dumbbell_Bench_Press', 'Bench Press (dumbbell)', 100)]);
  await page.evaluate(() => { sp('metrics'); badgeInfo('Bench-Maxing'); }); await page.waitForTimeout(300);
  const pop = await page.evaluate(() => { const el = document.getElementById('badgeFullBody'); const rows = [...el.querySelectorAll('.bf-tier')].map(r => r.textContent.replace(/\s+/g, ' ').trim()); return { txt: el.textContent, rows }; });
  const T = r.T, dbT = tierOf(241, T);
  const dbRow = pop.rows.find(x => x.toLowerCase().startsWith(dbT)), belowRow = pop.rows.find(x => x.startsWith('Below Bronze'));
  check('bench popup: the dumbbell lift sits in its tier row with just exercise + value, no "from X" aside', !!dbRow && /Dumbbell bench\s*241 lb/.test(dbRow) && !/from/i.test(dbRow), JSON.stringify(pop.rows));
  check('bench popup: a barbell lift under Bronze shows as Below Bronze', !!belowRow && /Barbell bench\s*120 lb/.test(belowRow), JSON.stringify(pop.rows));
  check('bench popup: no tier row anywhere has a "from X" aside', pop.rows.every(x => !/\bfrom\b/i.test(x)), JSON.stringify(pop.rows));
  check('bench popup: the dumbbell conversion sourcing moved to the how-to-earn-it text, not the tier row', /÷\s*0\.83/.test(pop.txt) && /Saeterbakken/i.test(pop.txt), pop.txt.slice(0, 600));
  check('bench popup: shows a per-exercise section for the dumbbell substitute', /No barbell bench\? Dumbbell counts too/.test(pop.txt), pop.txt.slice(0, 600));
  check('bench popup: the tier thresholds are still there', T.every(x => pop.txt.includes(x + ' lb')), T.join());
  check('bench popup: no GOODLIFT points shown', !/GOODLIFT|points/i.test(pop.txt), pop.txt.slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/bench-subs-popup.png` });
  check('bench subs: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function badgePopupSections() {
  // Cardio-Maxing and 1000lb Club also split their "how to earn it" into per-exercise sections (Mr. Roni, 2026-09-30):
  // Cardio gets one section per run type (alternatives, no conversion needed); 1000lb Club gets one section per lift
  // plus the combined total (the three SUM together, they are not alternatives like the others).
  const hist = [
    wk('2026-09-05', [ex('Run', [[3, 21]], 'distance')]),
    wk('2026-09-06', [ex('Treadmill Run', [[3, 24]], 'distance', 'Running_Treadmill')]),
  ];
  const { page, ctx, errors } = await phone({ seed: { hist, bw: 180 / LB }, now: SEP15 });
  await page.evaluate(() => badgeInfo('Cardio-Maxing')); await page.waitForTimeout(200);
  const cardioPop = await page.evaluate(() => { const el = document.getElementById('badgeFullBody'); return { txt: el.textContent, rows: [...el.querySelectorAll('.bf-tier')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }; });
  check('cardio popup: has its own section for outdoor running', /Running \(outdoor\)/.test(cardioPop.txt), cardioPop.txt.slice(0, 500));
  check('cardio popup: has its own section for treadmill running', /Running \(treadmill\)/.test(cardioPop.txt), cardioPop.txt.slice(0, 500));
  check('cardio popup: outdoor run sits in a tier row with exercise + pace only', cardioPop.rows.some(x => /Running \(outdoor\)/.test(x) && /\d:\d\d\/mi/.test(x)), JSON.stringify(cardioPop.rows));
  check('cardio popup: treadmill run sits in its own tier row', cardioPop.rows.some(x => /Running \(treadmill\)/.test(x) && /\d:\d\d\/mi/.test(x)), JSON.stringify(cardioPop.rows));
  check('cardio popup: no tier row has a "from X" aside', cardioPop.rows.every(x => !/\bfrom\b/i.test(x)), JSON.stringify(cardioPop.rows));
  await page.evaluate(() => closeBadgeFull());
  check('badge popup sections: cardio no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // 1000lb Club: a qualifying single-session Big-3 -- popup shows each lift's own contribution, then the total.
  const club = [wk('2026-09-10', [ex('Barbell Bench Press', [[315, 1]]), ex('Barbell Squat', [[405, 1]]), ex('Barbell Deadlift', [[455, 1]])])];
  const c = await phone({ seed: { hist: club, bw: 180 / LB }, now: SEP15 });
  await c.page.evaluate(() => badgeInfo('1000lb Club')); await c.page.waitForTimeout(200);
  const clubPop = await c.page.evaluate(() => { const el = document.getElementById('badgeFullBody'); return { txt: el.textContent, rows: [...el.querySelectorAll('.bf-tier')].map(r => r.textContent.replace(/\s+/g, ' ').trim()) }; });
  check('1000lb club popup: shows a Bench section with its own contribution', /Bench/.test(clubPop.txt) && clubPop.rows.some(x => /315 lb/.test(x)), JSON.stringify(clubPop.rows));
  check('1000lb club popup: shows a Squat section with its own contribution', /Squat/.test(clubPop.txt) && clubPop.rows.some(x => /405 lb/.test(x)), JSON.stringify(clubPop.rows));
  check('1000lb club popup: shows a Deadlift section with its own contribution', /Deadlift/.test(clubPop.txt) && clubPop.rows.some(x => /455 lb/.test(x)), JSON.stringify(clubPop.rows));
  check('1000lb club popup: shows the combined total against 1000, marked met', clubPop.rows.some(x => /1175 lb \/ 1000/.test(x)), JSON.stringify(clubPop.rows));
  check('1000lb club popup: no section row has a "from X" aside', clubPop.rows.every(x => !/\bfrom\b/i.test(x)), JSON.stringify(clubPop.rows));
  check('badge popup sections: 1000lb club no page errors', c.errors.length === 0, c.errors.join(' | '));
  await c.ctx.close();
}
async function timedHolds() {
  // Planks and the other static holds are timed, not counted (Mr. Roni, 2026-09-29 7:42pm). Old rep-logged planks stay readable.
  const oldPlank = { ...wk('2026-09-01', [{ exId: 'Plank', name: 'Plank', muscle: 'abdominals', tracking: 'weight_reps', sets: [{ weight: 0, reps: 30, done: true }] }]), id: 'wold' };
  const { page, ctx, errors } = await phone({ seed: { hist: [oldPlank], prs: { Plank: { weight: 0, reps: 30, date: oldPlank.date } } }, now: SEP15 });
  await page.evaluate(async () => { loadDB(); for (let i = 0; i < 100 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  const HOLDS = ['Plank', 'Side_Bridge', 'Isometric_Neck_Exercise_-_Front_And_Back', 'Isometric_Neck_Exercise_-_Sides', 'Plate_Pinch', 'Crucifix', 'Downward_Facing_Balance'];
  const tr = await page.evaluate(ids => ids.map(id => byId(id).tracking + '|' + (allEx().find(e => e.id === id) || {}).tracking), [...HOLDS, 'Pushups', 'wu_core']);
  check('holds: every static hold in the library is duration-tracked (byId and the library list)', tr.slice(0, HOLDS.length).every(t => t === 'duration|duration'), tr.join());
  check('holds: a normal lift stays weight + reps; the warm-up plank was already timed', tr[HOLDS.length] === 'weight_reps|weight_reps' && tr[HOLDS.length + 1] === 'duration|duration', tr.slice(-2).join());
  // Logging: a new plank is a seconds box, not reps, and the old rep plank doesn't seed it.
  await page.evaluate(() => { startEmpty(); addExToWorkout('Plank'); });
  await page.waitForTimeout(200);
  const setup = await page.evaluate(() => ({ tr: aw.exercises[0].tracking, set: aw.exercises[0].sets[0], inputs: document.querySelectorAll('#wSession input.si').length, head: document.getElementById('wSession').textContent }));
  check('holds: adding a plank to a workout logs time (one Secs box, no reps box)', setup.tr === 'duration' && setup.inputs === 1 && /Secs/.test(setup.head), JSON.stringify({ tr: setup.tr, inputs: setup.inputs }));
  check('holds: the old rep-logged plank does not seed its reps as seconds', !(setup.set.pw > 0) && !(setup.set.pr > 0), JSON.stringify(setup.set));
  const box = page.locator('#wSession input.si').nth(0);
  await box.tap(); await page.keyboard.type('75');
  await page.locator('#wSession .sd').first().tap();
  const st = await page.evaluate(() => aw.exercises[0].sets[0]);
  check('holds: typed 75 is stored as 75 seconds', st.weight === 75 && !(st.reps > 0) && st.done, JSON.stringify(st));
  await page.evaluate(() => { cm('restModal'); finishW(true); }); await page.waitForTimeout(300);
  let r = await page.evaluate(() => { const w = gH().find(x => x.id !== 'wold'); return { tr: w.exercises[0].tracking, sec: w.exercises[0].sets[0].weight, prCount: w.prCount, hold: gHoldPR().Plank, oldPR: gPR().Plank, pr: prsOf(w).list.map(prSetText) }; });
  check('holds: history saves the plank as a timed set', r.tr === 'duration' && r.sec === 75, JSON.stringify(r));
  check('holds: first timed plank is a hold PR (1:15), old rep PR left alone', r.hold && r.hold.sec === 75 && r.prCount === 1 && r.pr.join() === '1:15 hold' && r.oldPR && r.oldPR.reps === 30, JSON.stringify(r));
  // A shorter hold is not a PR, a longer one is (commit rule and history replay agree).
  r = await page.evaluate(() => { const mk = sec => ({ exId: 'Plank', name: 'Plank', tracking: 'duration', sets: [{ weight: sec, reps: 0, done: true }] });
    const a = commitPRs({ exercises: [mk(60)] }).length, b = commitPRs({ exercises: [mk(95)] }).map(p => p.label).join();
    return { a, b, hold: gHoldPR().Plank.sec }; });
  check('holds: 60s after 75s is not a PR; 95s is (1:35 hold)', r.a === 0 && r.b === '1:35 hold' && r.hold === 95, JSON.stringify(r));
  // Old rep plank still reads as reps in history; the new one as time.
  await page.evaluate(() => openWD('wold')); await page.waitForTimeout(150);
  const oldTxt = await page.evaluate(() => document.getElementById('wdContent').textContent);
  await page.evaluate(() => { cm('wdModal'); openWD(gH().find(x => x.id !== 'wold').id); }); await page.waitForTimeout(150);
  const newTxt = await page.evaluate(() => document.getElementById('wdContent').textContent);
  check('holds: an old rep-logged plank still reads as reps in history', /× 30 reps/.test(oldTxt), oldTxt.replace(/\s+/g, ' ').slice(0, 200));
  check('holds: the new plank reads as seconds in history', /75s/.test(newTxt), newTxt.replace(/\s+/g, ' ').slice(0, 200));
  const lib = await page.evaluate(() => { sp('exercises'); document.getElementById('exSearch').value = 'plank'; renderEx(); const row = [...document.querySelectorAll('#exList .eli')].find(e => e.getAttribute('onclick').includes("'Plank'")); return row ? row.textContent.replace(/\s+/g, ' ') : ''; });
  check('holds: library row says Duration and shows the hold PR', /Duration/.test(lib) && /1:35\s*hold PR/.test(lib), lib);
  const info = await page.evaluate(() => { openExInfo('Plank'); return document.getElementById('exInfoContent').textContent.replace(/\s+/g, ' '); });
  check('holds: exercise chart shows longest holds only', /Recent longest hold/.test(info) && /1:15/.test(info), info.slice(0, 200));
  check('holds: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  // Hevy import: a plank with duration_seconds imports as a timed set with a hold PR.
  const p2 = await phone({ now: SEP15 });
  const csv = ['title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps,distance_km,duration_seconds',
    '"Core","12 Sep 2026, 10:00","12 Sep 2026, 10:30","Plank",0,normal,,,,90', '"Core","12 Sep 2026, 10:00","12 Sep 2026, 10:30","Plank",1,normal,,,,120'].join('\n');
  r = await p2.page.evaluate(async csv => { await importWorkoutCsv(csv); const w = gH()[0]; return { ex: w.exercises.map(e => e.exId + ':' + e.tracking + ':' + e.sets.map(s => s.weight).join('/')).join(), hold: gHoldPR().Plank, prCount: w.prCount, replay: prReplay().get(w.id).n, vol: w.totalVolume }; }, csv);
  check('holds: Hevy plank imports as timed sets (90s, 120s) with a 2:00 hold PR, no fake volume', r.ex === 'Plank:duration:90/120' && r.hold && r.hold.sec === 120 && r.prCount === 1 && r.replay === 1 && r.vol === 0, JSON.stringify(r));
  const sp2 = await p2.page.evaluate(async () => { loadDB(); for (let i = 0; i < 100 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); return [resolveExercise('Side Plank'), resolveExercise('Plank')].join(); });
  check('holds: Hevy "Side Plank" maps to the Side Bridge hold, "Plank" to Plank', sp2 === 'Side_Bridge,Plank', sp2);
  check('holds: import has no page errors', p2.errors.length === 0, p2.errors.join(' | '));
  await p2.ctx.close();
}
async function avatarLightbox() {
  // Friend avatar enlarge (Mr. Roni, 2026-09-30): tapping a friend's PHOTO in the profile popup
  // (fpAv only) opens it enlarged; initials-only avatars have nothing to enlarge and aren't clickable.
  const { page, ctx, errors } = await phone({ now: SEP15 });
  await page.evaluate(() => {
    window.friendSrc = () => [
      { code: '@bob', id: '@bob', name: 'Bob', username: '@bob', avatarUrl: 'x?v=1', days: [], recent: [], wd: [] },
      { code: '@dan', id: '@dan', name: 'Dan', username: '@dan', avatarUrl: '', days: [], recent: [], wd: [] },
    ];
  });
  const expectedUrl = await page.evaluate(() => cleanAvatar('x?v=1', '@bob'));
  check('avatar lightbox: test photo cleans to a real url', !!expectedUrl, expectedUrl);

  await page.evaluate(() => openFriend('@bob'));
  await page.waitForTimeout(150);
  const closedBefore = await page.evaluate(() => document.getElementById('avLightbox').classList.contains('open'));
  check('avatar lightbox: closed before any tap', !closedBefore);
  const cursor = await page.evaluate(() => getComputedStyle(document.querySelector('#fpAv .av')).cursor);
  check('avatar lightbox: a friend with a photo gets a pointer cursor on their avatar', cursor === 'pointer', cursor);
  await page.locator('#fpAv .av').tap();
  const opened = await page.evaluate(() => ({ open: document.getElementById('avLightbox').classList.contains('open'), src: document.getElementById('avLightboxImg').src }));
  check('avatar lightbox: tapping a friend\'s photo opens it enlarged', opened.open, JSON.stringify(opened));
  check('avatar lightbox: shows the same photo', opened.src === expectedUrl, `${opened.src} vs ${expectedUrl}`);

  // Backdrop tap closes it (tapping the image itself must not).
  await page.evaluate(() => document.getElementById('avLightboxImg').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const stillOpenAfterImgTap = await page.evaluate(() => document.getElementById('avLightbox').classList.contains('open'));
  check('avatar lightbox: tapping the photo itself does not close it', stillOpenAfterImgTap);
  await page.evaluate(() => document.getElementById('avLightbox').click());
  const closedByBackdrop = await page.evaluate(() => document.getElementById('avLightbox').classList.contains('open'));
  check('avatar lightbox: tapping the backdrop closes it', !closedByBackdrop);

  // X button closes it too.
  await page.locator('#fpAv .av').tap();
  await page.locator('#avLightbox .cb').tap();
  const closedByX = await page.evaluate(() => document.getElementById('avLightbox').classList.contains('open'));
  check('avatar lightbox: tapping the X closes it', !closedByX);

  // Initials-only avatar (Dan): no photo, not clickable, tapping it does nothing.
  await page.evaluate(() => { cm('fpModal'); openFriend('@dan'); });
  await page.waitForTimeout(150);
  const danBefore = await page.evaluate(() => { const el = document.querySelector('#fpAv .av'); return { hasImg: /url\(/.test(getComputedStyle(el).backgroundImage), cursor: getComputedStyle(el).cursor }; });
  check('avatar lightbox: initials-only avatar has no photo and no pointer cursor', !danBefore.hasImg && danBefore.cursor !== 'pointer', JSON.stringify(danBefore));
  await page.locator('#fpAv .av').tap();
  const danAfter = await page.evaluate(() => document.getElementById('avLightbox').classList.contains('open'));
  check('avatar lightbox: tapping an initials-only avatar opens nothing', !danAfter, String(danAfter));

  check('avatar lightbox: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function exercisePhoto() {
  // Custom exercises only (Mr. Roni, 2026-09-30 — tasks/2026-09-29-exercise-image.md):
  // an image field on Edit Exercise, native picker to change/remove it, resized/
  // compressed client-side, stored local-to-device (never jk_*, never synced or
  // exported), shown everywhere the exercise appears — library list, add-exercise
  // picker, exercise info, in-workout — and falling back to the icon-placeholder
  // (never a broken image or a blank tile) when there's no photo.
  const cex = [{ id: 'cex1', name: 'Barbell Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }];
  const { page, ctx, errors } = await phone({ seed: { cex } });

  // No photo yet: the library row shows the icon-placeholder, not a broken/blank tile.
  await page.evaluate(() => { sp('exercises'); document.getElementById('exSearch').value = 'Barbell Bench Press'; renderEx(); });
  let row = await page.evaluate(() => document.querySelector('#exList .eli').innerHTML);
  check('ex photo: no photo yet shows the icon-placeholder in the library (no img)', /class="etp"/.test(row) && !/<img/.test(row), row.slice(0, 150));

  // Attach a photo through the real Edit Exercise UI — a file input stands in for the native picker.
  await page.evaluate(() => openEditEx('cex1'));
  check('ex photo: photo control shown when editing a custom exercise', await page.locator('#cePhotoRow').isVisible());
  await page.locator('#cePhotoFile').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: pngPixel(255, 0, 0) });
  await page.waitForFunction(() => !!_cePhotoData);
  await page.locator('#ceSaveBtn').tap();
  await page.waitForTimeout(150);
  const stored1 = await page.evaluate(() => getExPhoto('cex1'));
  check('ex photo: saved photo is a resized/compressed local JPEG data URL', /^data:image\/jpeg;base64,/.test(stored1), String(stored1).slice(0, 40));

  // Shows in all four places the exercise appears.
  await page.evaluate(() => { document.getElementById('exSearch').value = 'Barbell Bench Press'; renderEx(); });
  row = await page.evaluate(() => document.querySelector('#exList .eli').innerHTML);
  check('ex photo: shows in the library list', row.includes(`src="${stored1}"`));

  await page.evaluate(() => openAEModal('workout'));
  const aeRowHtml = await page.evaluate(() => document.getElementById('esr-cex1').innerHTML);
  check('ex photo: shows in the add-exercise picker', aeRowHtml.includes(`src="${stored1}"`));
  await page.evaluate(() => cm('aeModal'));

  await page.evaluate(() => openExInfo('cex1'));
  let infoHtml = await page.evaluate(() => document.getElementById('exInfoContent').innerHTML);
  check('ex photo: shows on the exercise info screen', infoHtml.includes(`src="${stored1}"`));
  await page.evaluate(() => cm('exInfoModal'));

  await page.evaluate(() => { startEmpty(); addExToWorkout('cex1'); });
  const wsHtml = await page.evaluate(() => document.getElementById('wSession').innerHTML);
  check('ex photo: shows in-workout', wsHtml.includes(`src="${stored1}"`));
  const cachedUrl = await page.evaluate(() => aw.exercises[0].imgUrl);
  check('ex photo: in-workout state caches the local photo url', cachedUrl === stored1);
  await page.evaluate(() => { cm('restModal'); finishW(true); });
  await page.waitForTimeout(300);

  // Replace: picking a new photo overwrites the first.
  await page.evaluate(() => openEditEx('cex1'));
  await page.locator('#cePhotoFile').setInputFiles({ name: 'photo2.png', mimeType: 'image/png', buffer: pngPixel(0, 0, 255) });
  await page.waitForFunction(() => !!_cePhotoData);
  await page.locator('#ceSaveBtn').tap();
  await page.waitForTimeout(150);
  const stored2 = await page.evaluate(() => getExPhoto('cex1'));
  check('ex photo: replacing the photo stores a different image', /^data:image\/jpeg;base64,/.test(stored2) && stored2 !== stored1);

  // Remove: falls back cleanly to the icon-placeholder everywhere, no broken/blank image.
  await page.evaluate(() => openEditEx('cex1'));
  check('ex photo: Remove button shown once a photo exists', await page.locator('#cePhotoRmBtn').isVisible());
  await page.locator('#cePhotoRmBtn').tap();
  await page.locator('#ceSaveBtn').tap();
  await page.waitForTimeout(150);
  check('ex photo: removing clears local storage for this exercise', await page.evaluate(() => getExPhoto('cex1')) === null);
  await page.evaluate(() => { document.getElementById('exSearch').value = 'Barbell Bench Press'; renderEx(); });
  row = await page.evaluate(() => document.querySelector('#exList .eli').innerHTML);
  check('ex photo: library row falls back to the icon-placeholder after removal (no broken/blank tile)', /class="etp"/.test(row) && !/<img/.test(row), row.slice(0, 150));
  await page.evaluate(() => openExInfo('cex1'));
  infoHtml = await page.evaluate(() => document.getElementById('exInfoContent').innerHTML);
  check('ex photo: exercise info falls back to the icon-placeholder after removal', !infoHtml.includes('<img') && /<svg/.test(infoHtml), infoHtml.slice(0, 150));
  await page.evaluate(() => cm('exInfoModal'));

  // Scope: built-in/warm-up exercises never get the photo control (custom exercises only).
  await page.evaluate(() => openEditEx('wu_core'));
  check('ex photo: photo control hidden when editing a built-in exercise', !(await page.locator('#cePhotoRow').isVisible()));
  await page.evaluate(() => cm('ceModal'));

  // Local-device-only: never under jk_*, so collectBackup() (cloud sync + JSON export/import) never sees it.
  const localOnly = await page.evaluate(() => {
    setExPhoto('cex1', 'data:image/jpeg;base64,AAAA');
    const backup = JSON.stringify(collectBackup());
    const jkVals = Object.keys(localStorage).filter(k => k.startsWith('jk_')).map(k => localStorage.getItem(k)).join('');
    return { stored: getExPhoto('cex1') === 'data:image/jpeg;base64,AAAA', inBackup: backup.includes('AAAA'), inJkKeys: jkVals.includes('AAAA') };
  });
  check('ex photo: local photo store round-trips', localOnly.stored);
  check('ex photo: never appears in collectBackup() (no cloud sync, no JSON export)', !localOnly.inBackup);
  check('ex photo: never held under any jk_* key', !localOnly.inJkKeys);

  // Orphan cleanup: deleting the custom exercise deletes its photo too.
  await page.evaluate(() => openExInfo('cex1'));
  await page.evaluate(() => deleteEx('cex1'));
  await page.click('#cfOk');
  await page.waitForTimeout(150);
  check('ex photo: deleting the exercise removes its orphaned local photo', await page.evaluate(() => getExPhoto('cex1')) === null);

  check('ex photo: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function backExtLoad() {
  // Mr. Roni 2026-10-01: Dad's Top PR read "Hyperextensions (Back Extensions) 325lb x 12". Real cause (his cloud
  // backup): 75 lb machine sets logged in the app on 9/22, 9/26, 9/29 with "+ Added" after the lift was tagged
  // bodyweight on 9/8, so his ~250 lb body weight was added on top. Not the Hevy import (his Hevy rows say
  // "Back Extension (Machine)", max 70 lb). Seeded exactly as his saved workouts are shaped.
  const set = (lb, r) => ({ weight: lb / LB, reps: r, done: true });
  const dadEx = lb => ({ exId: 'Hyperextensions_Back_Extensions', name: 'Hyperextensions (Back Extensions)', muscle: 'lower back', equip: 'body only', tracking: 'weight_reps', bwMode: 'added', sets: [set(lb, 12), set(lb, 12), set(lb, 12)] });
  const hist = [wk('2026-09-22', [dadEx(70)]), wk('2026-09-26', [dadEx(75)]), wk('2026-09-29', [dadEx(75)])];
  const { page, ctx, errors } = await phone({ seed: { hist, bw: 250 / LB }, now: new Date('2026-10-01T12:00:00-06:00') });
  const r = await page.evaluate(() => { const h = gH(); const e = h[1].exercises[0];
    return { eff: effWeight(e, e.sets[0]) * 2.20462, cap: bwCapable(e), best: prBest(e).weight * 2.20462,
      replay: [...prReplay().values()].flatMap(x => x.list).map(p => Math.round(p.weight * 2.20462)) }; });
  check('back ext: a 75 lb set on a saved "body only / + Added" workout counts as 75 lb, not 75 + body weight', Math.round(r.eff) === 75, JSON.stringify(r));
  check('back ext: no Body/+Added/-Assist switch for back extensions', !r.cap, String(r.cap));
  check('back ext: PR replay over his history = 70 then 75 lb', r.replay.join() === '70,75', r.replay.join());
  // Live: log 75 x 12 the way he does, finish, the stored PR and Top PR card say 75 lb.
  await page.evaluate(async () => { S.s('prs', {}); loadDB(); for (let i = 0; i < 100 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  const lib = await page.evaluate(() => { const e = byId('Hyperextensions_Back_Extensions'); return { equip: e.equip, bw: isBodyweightEx(e) }; });
  check('back ext: library entry is no longer tagged bodyweight', !lib.bw, JSON.stringify(lib));
  await page.evaluate(() => { startEmpty && startEmpty(); });
  await page.evaluate(() => { aw.exercises.push({ exId: 'Hyperextensions_Back_Extensions', name: 'Hyperextensions (Back Extensions)', muscle: 'lower back', equip: 'body only', tracking: 'weight_reps', sets: [{ weight: 75 / 2.20462, reps: 12, done: true }] }); renderWS(); finishW(true); });
  await page.waitForTimeout(300);
  const pr = await page.evaluate(() => Math.round(gPR()['Hyperextensions_Back_Extensions'].weight * 2.20462));
  check('back ext: finishing 75 x 12 stores a 75 lb PR', pr === 75, String(pr));
  const card = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = cardLifetime().html; return d.textContent; });
  check('back ext: Top PR card shows 75lb x 12, never 325', /75lb × 12/.test(card) && !/325/.test(card), card.slice(-80));
  check('back ext: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // Hevy import with the exact names from Dad's and Mr. Roni's exports: weights land as logged, never + body weight.
  const p2 = await phone({ seed: { bw: 250 / LB }, now: new Date('2026-10-01T12:00:00-06:00') });
  const csv = ['title,start_time,end_time,exercise_title,set_type,weight_lbs,reps',
    '"Legs and Back","7 Aug 2026, 13:00","7 Aug 2026, 14:00","Back Extension (Machine)",normal,70,12',
    '"Legs and Back","7 Aug 2026, 13:00","7 Aug 2026, 14:00","Back Extension (Machine)",normal,70,12',
    '"Pull","27 Mar 2025, 21:07","27 Mar 2025, 22:00","Back Extension (Weighted Hyperextension)",normal,25,12',
    '"Pull","27 Mar 2025, 21:07","27 Mar 2025, 22:00","Back Extension (Hyperextension)",normal,0,15'].join('\n');
  const imp = await p2.page.evaluate(async csv => { await importWorkoutCsv(csv);
    return gH().flatMap(w => w.exercises.map(e => ({ n: e.name, id: e.exId, lb: Math.round(Math.max(...e.sets.map(s => s.weight)) * 2.20462), eff: Math.round(Math.max(...e.sets.map(s => effWeight(e, s))) * 2.20462) }))); }, csv);
  const by = n => imp.find(x => x.n === n) || {};
  check('back ext import: "Back Extension (Machine)" 70 lb stays 70 lb', by('Back Extension (Machine)').lb === 70 && by('Back Extension (Machine)').eff === 70, JSON.stringify(imp));
  check('back ext import: "Back Extension (Weighted Hyperextension)" 25 lb stays 25 lb', by('Back Extension (Weighted Hyperextension)').eff === 25, JSON.stringify(imp));
  check('back ext import: no imported back extension is worth body weight', imp.every(x => x.eff < 100), JSON.stringify(imp));
  const prs = await p2.page.evaluate(() => Object.values(gPR()).map(p => Math.round(p.weight * 2.20462)));
  check('back ext import: no imported PR over 70 lb', prs.every(x => x <= 70), prs.join());
  await p2.ctx.close();
}

async function backExtRepair() {
  // Mr. Roni approved 2026-10-01: one-shot in-app repair of numbers STORED while back extensions added body weight
  // (before v1.10.55). Fixture = the 7 workouts from Dad's cloud backup (read-only, 2026-10-01 17:24Z) that decide
  // the result: the 3 saved "body only / + Added" ones, whole, and the earlier ones holding his prior records for
  // every lift in them. Compact: [exId, name, equip, bwMode, [[kg, reps, done]]].
  const W = (id, date, tv, pc, exs) => ({ id, name: 'Legs and Back', date, duration: '60:00', sets: 27, totalVolume: tv, prCount: pc,
    exercises: exs.map(([exId, name, equip, bwMode, sets]) => ({ exId, name, equip, tracking: 'weight_reps', ...(bwMode ? { bwMode } : {}),
      sets: sets.map(([weight, reps, d]) => ({ weight, reps, done: !!d })) })) });
  const LE = 'Leg_Extensions', LC = 'Seated_Leg_Curl', HX = 'Hyperextensions_Back_Extensions', LP = 'Leg_Press', CP = 'Calf_Press_On_The_Leg_Press_Machine',
    PO = 'Bent-Arm_Barbell_Pullover', HR = 'Leverage_High_Row', IR = 'Leverage_Iso_Row', LAT = 'Wide-Grip_Lat_Pulldown';
  const x3 = (w, r = [12, 12, 12]) => r.map(n => [w, n, 1]);
  const HXN = 'Hyperextensions (Back Extensions)';
  const dadHist = () => [
    W('w1781037016028', '2026-06-09T20:30:16.028Z', 21101, 2, [[LE, 'Leg Extensions', 'machine', 0, x3(36.287433)], [LC, 'Seated Leg Curl', 'machine', 0, x3(36.287433)],
      [HX, HXN, 'other', 0, x3(27.215575)], [PO, 'Bent-Arm Barbell Pullover', 'barbell', 0, x3(40.82)], [HR, 'Leverage High Row', 'machine', 0, x3(72.574866, [12, 10, 10])],
      [IR, 'Leverage Iso Row', 'machine', 0, x3(72.574866)]]),
    W('w1789155429897', '2026-09-11T19:37:09.897Z', 17799, 2, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(40.823362)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(40.823362)],
      [HX, HXN, 'other', 0, x3(27.215575)], [LP, 'Leg Press (machine)', 'machine', 0, x3(102.058405)], [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(54.431149)],
      [HR, 'Leverage High Row (machine)', 'machine', 0, [...x3(40.823362), [40.823362, 10, 0]]], [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(40.823362)],
      [LAT, 'Wide-Grip Lat Pulldown (cable)', 'cable', 0, x3(45.359291)]]),
    W('w1789414520547', '2026-09-14T19:35:20.547Z', 19922, 3, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(45.359291)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(45.359291)],
      [HX, HXN, 'other', 0, x3(31.751504)], [LP, 'Leg Press (machine)', 'machine', 0, x3(102.058405)], [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(63.503007, [12, 12, 9])],
      [HR, 'Leverage High Row (machine)', 'machine', 0, x3(63.503007)], [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(63.503007)]]),
    W('w1789668164285', '2026-09-17T18:02:44.285Z', 18842, 0, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(45.359291)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(45.359291)],
      [HX, HXN, 'other', 0, x3(31.751504)], [LP, 'Leg Press (machine)', 'machine', 0, x3(102.058405)], [CP, 'Calf Press On The Leg Press (machine)', 'machine', 0, x3(102.058405)],
      [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(63.503007, [12, 12, 7])], [HR, 'Leverage High Row (machine)', 'machine', 0, x3(72.574866, [8, 8, 8])],
      [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(72.574866, [8, 8, 8])], [LAT, 'Wide-Grip Lat Pulldown (cable)', 'cable', 0, x3(45.359291)]]),
    W('w1790104898582', '2026-09-22T19:21:38.582Z', 25805, 3, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(45.359291)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(45.359291)],
      [HX, HXN, 'body only', 'added', x3(31.751504)], [LP, 'Leg Press (machine)', 'machine', 0, x3(124.73805, [12, 12, 10])], [CP, 'Calf Press On The Leg Press (machine)', 'machine', 0, x3(124.73805)],
      [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(63.503007, [12, 12, 10])], [HR, 'Leverage High Row (machine)', 'machine', 0, x3(72.574866, [12, 12, 10])],
      [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(72.574866, [12, 12, 8])], [LAT, 'Wide-Grip Lat Pulldown (cable)', 'cable', 0, x3(45.359291)]]),
    W('w1790448706480', '2026-09-26T18:51:46.480Z', 25106, 3, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(47.627255)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(47.627255)],
      [HX, HXN, 'body only', 'added', x3(34.019468)], [LP, 'Leg Press (machine)', 'machine', 0, x3(124.73805, [12, 12, 10])], [CP, 'Calf Press On The Leg Press (machine)', 'machine', 0, x3(124.73805)],
      [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(49.89522)], [HR, 'Leverage High Row (machine)', 'machine', 0, x3(72.574866, [12, 10, 8])],
      [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(72.574866, [10, 10, 8])], [LAT, 'Wide-Grip Lat Pulldown (cable)', 'cable', 0, x3(45.359291)]]),
    W('w1790714236686', '2026-09-29T20:37:16.686Z', 26186, 1, [[LE, 'Leg Extensions (machine)', 'machine', 0, x3(47.627255)], [LC, 'Seated Leg Curl (machine)', 'machine', 0, x3(47.627255)],
      [HX, HXN, 'body only', 'added', x3(34.019468)], [LP, 'Leg Press (machine)', 'machine', 0, x3(124.73805, [12, 12, 10])], [CP, 'Calf Press On The Leg Press (machine)', 'machine', 0, x3(124.73805)],
      [PO, 'Bent-Arm Pullover (barbell)', 'barbell', 0, x3(49.89522)], [HR, 'Leverage High Row (machine)', 'machine', 0, x3(72.574866)],
      [IR, 'Leverage Iso Row (machine)', 'machine', 0, x3(72.574866)], [LAT, 'Wide-Grip Lat Pulldown (cable)', 'cable', 0, [[49.89522, 12, 1], [49.89522, 12, 1], [49.89522, 10, 1]]]]),
  ];
  const dadPrs = () => ({ [HX]: { date: '2026-09-26T21:55:54.517Z', reps: 12, weight: 147.41769556658292 },
    [LP]: { date: '2026-09-22T20:24:25.816Z', reps: 12, weight: 124.73805009480093 }, [CP]: { date: '2026-09-22T20:24:25.816Z', reps: 12, weight: 124.73805009480093 },
    Hack_Squat: { date: '2026-06-06T21:56:55.132Z', reps: 12, weight: 92.98654643430615 }, Calf_Press: { date: '2026-05-15T18:16:00.000Z', reps: 12, weight: 102.06 },
    [IR]: { date: '2026-06-09T21:42:33.565Z', reps: 12, weight: 72.57486550970236 }, Dip_Machine: { date: '2026-09-22T17:52:48.968Z', reps: 12, weight: 72.57486550970236 },
    [LE]: { date: '2026-09-26T21:55:54.517Z', reps: 12, weight: 47.62725549074217 }, [LC]: { date: '2026-09-26T21:55:54.517Z', reps: 12, weight: 47.62725549074217 },
    [LAT]: { date: '2026-09-29T21:41:32.313Z', reps: 12, weight: 49.895220037920375 }, [PO]: { date: '2026-09-14T20:30:12.201Z', reps: 12, weight: 63.50300732098956 } });
  const bwlog = [{ d: '2026-06-06', kg: 112.9446344494743 }, { d: '2026-08-03', kg: 112.9446344494743 }, { d: '2026-09-19', kg: 113.39822735890993 }, { d: '2026-10-01', kg: 111.58385572116738 }];
  const dadSeed = () => ({ hist: dadHist(), prs: dadPrs(), bw: 111.58385572116738, bwlog });
  const NOW = new Date('2026-10-01T18:00:00-06:00');
  const lb = kg => Math.round(kg * LB);
  const BAD = ['w1790104898582', 'w1790448706480', 'w1790714236686'];
  const state = page => page.evaluate(([HX, BAD]) => { const h = gH(), by = id => h.find(w => w.id === id);
    return { pr: gPR()[HX], tv: BAD.map(id => by(id).totalVolume), pc: BAD.map(id => by(id).prCount),
      ent: BAD.map(id => by(id).exercises.find(e => e.exId === HX)).map(e => ({ equip: e.equip, bwMode: e.bwMode, sets: e.sets })),
      cut: S.g('prRepair'), flag: localStorage.getItem(BACKEXT_REPAIR_FLAG), hist: localStorage.getItem('jk_hist'), prs: localStorage.getItem('jk_prs') }; }, [HX, BAD]);

  // 1. Dad's device opens the new build: the repair runs once, by itself, before anything syncs.
  const logs = [];
  const A = await phone({ seed: dadSeed(), now: NOW });
  const a = await state(A.page);
  check('repair (Dad): back-extension record is 75 lb x 12', lb(a.pr.weight) === 75 && a.pr.reps === 12, JSON.stringify(a.pr));
  check('repair (Dad): record keeps its 9/26 date and is stamped repaired', a.pr.date === '2026-09-26T21:55:54.517Z' && !!a.pr.repaired, JSON.stringify(a.pr));
  const drop = a.tv.map((t, i) => [25805, 25106, 26186][i] - t);
  check('repair (Dad): 9/22, 9/26, 9/29 totals each drop 9,000 lb (to 21,723 / 21,024 / 22,104 kg)', a.tv.join() === '21723,21024,22104' && drop.every(d => Math.abs(d * LB - 9000) <= 3), `${a.tv.join()} drop ${drop.map(d => Math.round(d * LB)).join()}`);
  check('repair (Dad): 9/22 PR count 3 -> 2; 9/26 stays 3; 9/29 stays 1', a.pc.join() === '2,3,1', a.pc.join());
  check('repair (Dad): entries tidied to equip "other", no bwMode', a.ent.every(e => e.equip === 'other' && e.bwMode === undefined), JSON.stringify(a.ent.map(e => [e.equip, e.bwMode])));
  const fx = dadHist().filter(w => BAD.includes(w.id)).map(w => JSON.stringify(w.exercises.find(e => e.exId === HX).sets));
  check('repair (Dad): typed weights/reps untouched', a.ent.every((e, i) => JSON.stringify(e.sets) === fx[i]), '');
  const other = await A.page.evaluate(([HX]) => gH().map(w => ({ ...w, exercises: w.exercises.filter(e => e.exId !== HX) })).map(w => JSON.stringify(w.exercises)), [HX]);
  const fxOther = dadHist().map(w => JSON.stringify(w.exercises.filter(e => e.exId !== HX)));
  check('repair (Dad): every other exercise is byte-identical', other.join('|') === fxOther.join('|'), '');
  const prOthers = await A.page.evaluate(HX => { const p = { ...gPR() }; delete p[HX]; return JSON.stringify(p); }, HX);
  const fxPrs = dadPrs(); delete fxPrs[HX];
  check('repair (Dad): every other PR record is unchanged', prOthers === JSON.stringify(fxPrs), '');
  const card = await A.page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = cardLifetime().html; return d.textContent; });
  check('repair (Dad): Top PR becomes Leg Press / Calf Press on the leg press 275lb x 12', /(Leg Press|Calf Press)/i.test(card) && /275lb × 12/.test(card) && !/325|Hyperext/.test(card), card.slice(-90));
  // v1.10.57 raw-weight Top PR: Leg Press and Calf Press on the leg press tie at 275 x 12 on 9/22; the earlier set
  // (Leg Press comes first in that workout) takes it.
  const topD = await A.page.evaluate(() => topPRSet());
  check('Top PR (Dad, raw heaviest): Leg Press 275 lb x 12', topD && topD.exId === 'Leg_Press' && lb(topD.weight) === 275 && topD.reps === 12 && /Leg Press[^×]*275lb × 12/.test(card), JSON.stringify(topD) + ' ' + card.slice(-60));
  check('repair (Dad): repair marker recorded for the cloud merge', a.cut && a.cut[HX] && a.flag, JSON.stringify([a.cut, a.flag]));
  check('repair (Dad): replay agrees with the stored PR counts for the repaired workouts', await A.page.evaluate(BAD => { const m = prAudit().mismatches.map(x => x.id); return BAD.every(id => !m.includes(id)); }, BAD), '');
  check('repair (Dad): the repair queued a cloud sync', await A.page.evaluate(() => typeof isDirty === 'function' ? isDirty() : true), '');

  // 2. Idempotent / one-shot: a relaunch does nothing; running it by hand does nothing; dropping the flag and
  //    running again leaves the data byte-identical.
  A.page.on('console', m => logs.push(m.text()));
  await A.page.reload(); await A.page.waitForTimeout(300);
  const a2 = await state(A.page);
  check('repair: second launch changes nothing (flag holds)', a2.hist === a.hist && a2.prs === a.prs && a2.flag === a.flag, '');
  check('repair: second launch logs no repair', !logs.some(t => /\[repair\].*fixed/.test(t)), logs.join(' | '));
  const again = await A.page.evaluate(() => { const r1 = repairBackExtBW(); localStorage.removeItem(BACKEXT_REPAIR_FLAG); const r2 = repairBackExtBW();
    return { r1, n2: r2 && r2.workouts.length, hist: localStorage.getItem('jk_hist'), prs: localStorage.getItem('jk_prs') }; });
  check('repair: idempotent (flag blocks; without the flag it finds nothing left to fix)', again.r1 === null && again.n2 === 0 && again.hist === a.hist && again.prs === a.prs, JSON.stringify({ r1: again.r1, n2: again.n2 }));

  // 3. Cloud merge: the existing cloud copy (325, old totals) and a stale device can't bring 325 back.
  const cloudOld = { jk_hist: dadHist(), jk_prs: dadPrs(), jk_bw: 111.58385572116738, jk_bwlog: bwlog };
  const m = await A.page.evaluate(([cloud, HX, BAD]) => { const out = mergeBackup(cloud, collectBackup());
    return { pr: out.jk_prs[HX], tv: BAD.map(id => out.jk_hist.find(w => w.id === id).totalVolume), cut: out.jk_prRepair }; }, [cloudOld, HX, BAD]);
  check('merge: Dad\'s current cloud copy (325) + repaired device -> 75 lb is what gets written', lb(m.pr.weight) === 75 && m.tv.join() === '21723,21024,22104' && m.cut && m.cut[HX], JSON.stringify(m));
  // A stale device / watch with "best record wins" writes 325 back over the repaired cloud copy (marker kept, as
  // its {...cloud,...local} keeps keys it doesn't know). The repaired phone's next pull and push both drop it.
  const stale = await A.page.evaluate(([cloud, HX]) => { const fixed = mergeBackup(cloud, collectBackup());
    const staleWrite = { ...fixed, jk_prs: { ...fixed.jk_prs, [HX]: cloud.jk_prs[HX] }, jk_hist: cloud.jk_hist };
    const push = mergeBackup(staleWrite, collectBackup());
    // pull: same merge, written into this device's storage (cloudPullMerge's write step)
    const pulled = mergeBackup(staleWrite, collectBackup()); Object.keys(pulled).forEach(k => localStorage.setItem(k, JSON.stringify(pulled[k])));
    return { push: push.jk_prs[HX], local: gPR()[HX], staleIn: staleWrite.jk_prs[HX], swap: mergeBackup(collectBackup(), staleWrite).jk_prs[HX] }; }, [cloudOld, HX]);
  check('merge: a stale device writing 325 back can\'t resurrect it on push', lb(stale.push.weight) === 75 && lb(stale.staleIn.weight) === 325, JSON.stringify(stale));
  check('merge: ...nor on pull into the repaired phone', lb(stale.local.weight) === 75, JSON.stringify(stale.local));
  check('merge: ...nor with the sides swapped (stale copy as local)', lb(stale.swap.weight) === 75, JSON.stringify(stale.swap));
  // A REAL new record after the repair (80 x 12 tonight) still wins over the repaired 75, everywhere.
  const newer = await A.page.evaluate(([cloud, HX]) => { const p = gPR(); const rec = { weight: 80 / 2.20462, reps: 12, date: new Date(Date.now() + 1000).toISOString() };
    const staleWrite = { ...cloud, jk_prRepair: S.g('prRepair') };
    return { a: mergeBackup(staleWrite, { ...collectBackup(), jk_prs: { ...p, [HX]: rec } }).jk_prs[HX], b: mergeBackup({ ...staleWrite, jk_prs: { ...cloud.jk_prs, [HX]: rec } }, collectBackup()).jk_prs[HX] }; }, [cloudOld, HX]);
  check('merge: a genuine heavier PR logged after the repair still wins (either side)', lb(newer.a.weight) === 80 && lb(newer.b.weight) === 80, JSON.stringify(newer));
  check('repair (Dad): no page errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();

  // 4. A second device logging in AFTER the cloud got a stale 325 + old workouts back: the login restore clears the
  //    device flag, so its reload repairs that data, and the marker keeps the stale record out.
  const C = await phone({ seed: {}, now: NOW });
  await C.page.evaluate(([cloud, HX]) => { const cut = { [HX]: '2026-10-01T20:00:00.000Z' };
    applyBundle({ ...cloud, jk_prRepair: cut, jk_prof: { name: 'Dad', username: '@dad', code: '@dad' }, jk_settings: { wUnit: 'lb' } }, { wipe: true }); localStorage.setItem('jk_appVersion', APP_VERSION); }, [cloudOld, HX]);
  await C.page.reload(); await C.page.waitForTimeout(300);
  const c = await state(C.page);
  check('login restore: stale cloud data is repaired on the new device too', lb(c.pr.weight) === 75 && c.tv.join() === '21723,21024,22104' && c.pc.join() === '2,3,1', JSON.stringify({ pr: c.pr, tv: c.tv, pc: c.pc }));
  check('login restore: earliest repair time kept', c.cut[HX] === '2026-10-01T20:00:00.000Z', JSON.stringify(c.cut));
  // Restored with ALREADY-TIDIED workouts but a stale 325 record (a watch's best-wins write): enforced at launch.
  await C.page.evaluate(([cloud, HX]) => { const h = gH(), p = { ...gPR(), [HX]: cloud.jk_prs[HX] };
    applyBundle({ jk_hist: h, jk_prs: p, jk_prRepair: S.g('prRepair'), jk_prof: gProf(), jk_settings: { wUnit: 'lb' }, jk_bwlog: S.g('bwlog'), jk_bw: gBW() }, { wipe: true }); localStorage.setItem('jk_appVersion', APP_VERSION); }, [cloudOld, HX]);
  await C.page.reload(); await C.page.waitForTimeout(300);
  const c2 = await state(C.page);
  check('login restore: a stale 325 record over tidied workouts is replaced at launch', lb(c2.pr.weight) === 75 && !!c2.pr.repaired, JSON.stringify(c2.pr));
  check('login restore: no page errors', C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();

  // 5. Unaffected users are untouched, byte for byte: Mr. Roni's Hevy "Back Extension (Weighted Hyperextension)"
  //    25 lb (unmatched), a back extension already logged right, and his 9/25 Dips "+ Added 230" (not approved here).
  const rHist = [
    { id: 'w1774645620000_3', name: 'Pull', date: '2025-03-28T03:07:00.000Z', duration: '53:00', sets: 3, totalVolume: 340, prCount: 1,
      exercises: [{ exId: 'imp_back_extension_weighted_hyperextension_', name: 'Back Extension (Weighted Hyperextension)', equip: 'other', tracking: 'weight_reps', sets: [{ weight: 11.34, reps: 12, done: true }] }] },
    wk('2026-09-20', [{ exId: HX, name: HXN, equip: 'other', tracking: 'weight_reps', sets: [{ weight: 25 / LB, reps: 12, done: true }] }], { pr: 1 }),
    wk('2026-09-25', [{ exId: 'Dips_-_Triceps_Version', name: 'Dips - Triceps Version', equip: 'body only', tracking: 'weight_reps', bwMode: 'added', sets: [{ weight: 230 / LB, reps: 12, done: true }] }], { pr: 1 }),
    wk('2026-09-27', [{ exId: HX, name: HXN, equip: 'body only', tracking: 'weight_reps', sets: [{ weight: 0, reps: 15, done: true }] }]),
  ];
  const rPrs = { Dips_: { weight: 208.2, reps: 12, date: '2026-09-25T18:00:00.000Z' }, [HX]: { weight: 25 / LB, reps: 12, date: '2026-09-20T18:00:00.000Z' } };
  const R = await phone({ seed: { hist: rHist, prs: rPrs, bw: 229 / LB }, now: NOW });
  const r = await R.page.evaluate(() => ({ hist: localStorage.getItem('jk_hist'), prs: localStorage.getItem('jk_prs'), cut: localStorage.getItem('jk_prRepair'), flag: localStorage.getItem(BACKEXT_REPAIR_FLAG) }));
  check('repair: unaffected user (Mr. Roni-shaped) history byte-identical', r.hist === JSON.stringify(rHist), '');
  check('repair: unaffected user PRs byte-identical, no repair marker, flag set', r.prs === JSON.stringify(rPrs) && r.cut === null && !!r.flag, JSON.stringify(r.cut));
  check('repair: unaffected user no page errors', R.errors.length === 0, R.errors.join(' | '));
  await R.ctx.close();
}

async function popupScrollLock() {
  // Mr. Roni 2026-10-01: "when on the recap page you are able to scroll the background page. That shouldn't be
  // allowed on any popup screen". Every popup pins the page; wheel and touch over it can't move the page; closing
  // puts you back where you were; nested popups keep the lock until the last one closes; long popups still scroll.
  const hist = days('2026-08-01', 40).map(d => wk(d, [ex('Barbell Bench Press', [[185, 5]])]));
  const { page, ctx, errors } = await phone({ seed: { hist, bw: 180 / LB }, now: SEP15 });
  await page.evaluate(() => sp('metrics')); await page.waitForTimeout(300);
  const Y = 600;
  const pageTop = () => page.evaluate(() => document.querySelector('.page.active').getBoundingClientRect().top);
  const OPEN = {
    recap: () => openRecap(2026, 7), badge: () => badgeInfo(computeBadges()[0].name), achievements: () => openAch(),
    profile: () => om('profModal'), friendProfile: () => om('fpModal'), workoutDetail: () => om('wdModal'), lightbox: () => om('avLightbox'),
    confirm: () => { showConfirm('Delete it?'); }, exInfo: () => om('exInfoModal'), cardOrder: () => om('cardOrderModal'),
  };
  const CLOSE = { recap: 'closeRecap()', badge: 'closeBadgeFull()', achievements: 'closeAch()', profile: "cm('profModal')", friendProfile: "cm('fpModal')",
    workoutDetail: "cm('wdModal')", lightbox: "cm('avLightbox')", confirm: "document.getElementById('cfCancel')?document.getElementById('cfCancel').click():cm('confirmModal')", exInfo: "cm('exInfoModal')", cardOrder: "cm('cardOrderModal')" };
  for (const [name, open] of Object.entries(OPEN)) {
    await page.evaluate(y => window.scrollTo(0, y), Y); await page.waitForTimeout(50);
    const y0 = await page.evaluate(() => window.scrollY), t0 = await pageTop();
    await page.evaluate(`(${open.toString()})()`); await page.waitForTimeout(150);
    const yOpen = await page.evaluate(() => window.scrollY);
    await page.mouse.move(195, 420); await page.mouse.wheel(0, 900); await page.waitForTimeout(150);
    const c = await ctx.newCDPSession(page);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 600 }] });
    for (let k = 1; k <= 8; k++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 600 - k * 50 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach();
    await page.waitForTimeout(250);
    const yAfter = await page.evaluate(() => window.scrollY), t1 = await pageTop();
    check(`scroll lock: ${name}: wheel + swipe over the popup leave window.scrollY unchanged`, yAfter === yOpen, `${yOpen} -> ${yAfter}`);
    check(`scroll lock: ${name}: the page behind doesn't move`, Math.abs(t1 - t0) < 1, `${t0} -> ${t1}`);
    await page.evaluate(CLOSE[name]); await page.waitForTimeout(150);
    const yClosed = await page.evaluate(() => window.scrollY);
    check(`scroll lock: ${name}: closing puts the page back where it was`, yClosed === y0 && y0 > 0, `${y0} -> ${yClosed}`);
  }
  // Nested: a confirm over the profile popup; closing the confirm keeps the lock until the profile closes too.
  await page.evaluate(y => window.scrollTo(0, y), Y);
  await page.evaluate(() => { om('profModal'); showConfirm('Sure?'); }); await page.waitForTimeout(100);
  await page.evaluate(() => { const b = document.getElementById('cfCancel'); b ? b.click() : cm('confirmModal'); }); await page.waitForTimeout(100);
  const mid = await page.evaluate(() => ({ fixed: document.body.style.position, open: !!document.querySelector('#profModal.open') }));
  check('scroll lock: nested: closing the confirm keeps the page pinned while the profile is open', mid.fixed === 'fixed' && mid.open, JSON.stringify(mid));
  await page.evaluate(() => cm('profModal')); await page.waitForTimeout(100);
  const end = await page.evaluate(() => ({ fixed: document.body.style.position, y: window.scrollY }));
  check('scroll lock: nested: closing the last popup releases it and restores the spot', end.fixed === '' && end.y === Y, JSON.stringify(end));
  // Backdrop tap closes and releases too.
  await page.evaluate(() => om('profModal')); await page.waitForTimeout(100);
  await page.mouse.click(195, 30); await page.waitForTimeout(150);
  const bd = await page.evaluate(() => ({ open: !!document.querySelector('.mo.open'), fixed: document.body.style.position, y: window.scrollY }));
  check('scroll lock: backdrop tap closes and unpins', !bd.open && bd.fixed === '' && bd.y === Y, JSON.stringify(bd));
  // A long popup still scrolls its own content.
  await page.evaluate(() => openAch()); await page.waitForTimeout(150);
  const s0 = await page.evaluate(() => document.getElementById('achFull').scrollTop);
  await page.mouse.move(195, 500); await page.mouse.wheel(0, 600); await page.waitForTimeout(250);
  const s1 = await page.evaluate(() => ({ st: document.getElementById('achFull').scrollTop, max: document.getElementById('achFull').scrollHeight - document.getElementById('achFull').clientHeight }));
  check('scroll lock: Achievements page still scrolls its own list', s1.max > 0 && s1.st > s0, JSON.stringify({ s0, ...s1 }));
  await page.evaluate(() => closeAch());
  check('scroll lock: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function topPRRaw() {
  // Mr. Roni 2026-10-01 (4:26-6:22pm): Lifetime Stats "Top PR" = heaviest RAW weight lifted, reps only break a tie;
  // plain bodyweight moves never count; derived from history so stored records with body weight in them can't win.
  const BW = 229 / LB;
  const bwEx = (exId, name, lbs, reps, extra = {}) => ({ exId, name, muscle: 'chest', equip: 'body only', tracking: 'weight_reps', ...extra, sets: [{ weight: lbs / LB, reps, done: true }] });
  const lift = (exId, name, sets, extra = {}) => ({ exId, name, muscle: 'legs', equip: 'barbell', tracking: 'weight_reps', ...extra, sets: sets.map(([l, r, d = true]) => ({ weight: l / LB, reps: r, done: d })) });
  const cardTxt = page => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = cardLifetime().html; return d.textContent.replace(/\s+/g, ' '); });
  const hist = [
    wk('2026-07-20', [bwEx('Pushups', 'Pushups (bodyweight)', 229, 62), bwEx('Pullups', 'Pullups (bodyweight)', 229, 20), bwEx('Plank', 'Plank (bodyweight)', 229, 1)]),
    wk('2026-09-10', [lift('Barbell_Bench_Press_-_Medium_Grip', 'Bench Press', [[185, 5], [135, 20]]), lift('Barbell_Squat', 'Squat', [[225, 3]])]),
    // "+ Added 230" dips: counts 230 (the plates), never 229 + 230 = 459.
    wk('2026-09-25', [bwEx('Dips_-_Chest_Version', 'Dips (chest version)', 230, 12, { bwMode: 'added' }), bwEx('Pullups', 'Assisted Pull-up', 80, 10, { bwMode: 'assist' })]),
    // An unchecked 400 lb set never counts.
    wk('2026-09-28', [lift('Barbell_Deadlift', 'Deadlift', [[400, 5, false], [225, 8]])]),
  ];
  // Stored records as the old card read them: push-ups with body weight, dips with body weight folded in.
  const prs = { Pushups: { weight: BW, reps: 62, date: '2026-07-20T18:00:00Z' }, 'Dips_-_Chest_Version': { weight: 459 / LB, reps: 12, date: '2026-09-25T18:00:00Z' },
    Barbell_Squat: { weight: 225 / LB, reps: 3, date: '2026-09-10T18:00:00Z' } };
  const { page, ctx, errors } = await phone({ seed: { hist, prs, bw: BW }, now: SEP15 });
  let top = await page.evaluate(() => topPRSet()), card = await cardTxt(page);
  check('Top PR: push-ups 229 x 62 never wins (plain bodyweight)', !/Push/i.test(card) && top.exId !== 'Pushups', card);
  check('Top PR: stored 459 lb dip record (body weight folded in) not shown', !/459/.test(card), card);
  check('Top PR: "+ Added" dips count the 230 lb of plates, and win over lighter barbell lifts', top.exId === 'Dips_-_Chest_Version' && Math.round(top.weight * LB) === 230 && top.reps === 12, JSON.stringify(top));
  check('Top PR: card shows that set as weight x reps', /Top PR.*Dips.*230lb × 12 reps/.test(card), card);
  check('Top PR: unchecked 400 lb deadlift set ignored', !/400/.test(card), card);
  // Heaviest weighted lift wins over more reps or more weight x reps.
  await page.evaluate(([LB]) => { const h = gH(); h.push({ id: 'wx1', name: 'W', date: '2026-09-29T18:00:00Z', duration: '30:00', sets: 2, totalVolume: 0, prCount: 0,
    exercises: [{ exId: 'Barbell_Squat', name: 'Squat', equip: 'barbell', tracking: 'weight_reps', sets: [{ weight: 315 / LB, reps: 1, done: true }, { weight: 275 / LB, reps: 10, done: true }] }] });
    S.s('hist', h); }, [LB]);
  top = await page.evaluate(() => topPRSet()); card = await cardTxt(page);
  check('Top PR: heaviest weighted lift wins (squat 315 x 1 beats 275 x 10 and dips 230 x 12)', top.exId === 'Barbell_Squat' && Math.round(top.weight * LB) === 315 && top.reps === 1 && /315lb × 1 reps/.test(card), card);
  // Reps only break ties: 315 x 4 on another lift beats 315 x 1.
  await page.evaluate(([LB]) => { const h = gH(); h.push({ id: 'wx2', name: 'W', date: '2026-09-30T18:00:00Z', duration: '30:00', sets: 1, totalVolume: 0, prCount: 0,
    exercises: [{ exId: 'Leg_Press', name: 'Leg Press', equip: 'machine', tracking: 'weight_reps', sets: [{ weight: 315 / LB, reps: 4, done: true }] }] });
    S.s('hist', h); }, [LB]);
  top = await page.evaluate(() => topPRSet());
  check('Top PR: reps break a tie at the same weight (315 x 4 beats 315 x 1)', top.exId === 'Leg_Press' && top.reps === 4, JSON.stringify(top));
  // Same weight and reps: the earlier set keeps it (the newer one doesn't steal it).
  await page.evaluate(([LB]) => { const h = gH(); h.push({ id: 'wx3', name: 'W', date: '2026-09-30T20:00:00Z', duration: '30:00', sets: 1, totalVolume: 0, prCount: 0,
    exercises: [{ exId: 'Hack_Squat', name: 'Hack Squat', equip: 'machine', tracking: 'weight_reps', sets: [{ weight: 315 / LB, reps: 4, done: true }] }] });
    S.s('hist', h); }, [LB]);
  top = await page.evaluate(() => topPRSet());
  check('Top PR: exact tie keeps the earlier set', top.exId === 'Leg_Press', JSON.stringify(top));
  // An imported workout (no reliable done flag) counts; cardio and timed holds never do.
  await page.evaluate(([LB]) => { const h = gH(); h.push({ id: 'w1775529720000_22', name: 'Hevy', date: '2026-04-07T18:00:00Z', duration: '—', sets: 3, totalVolume: 0, prCount: 0,
    exercises: [{ exId: 'Calf_Press_On_The_Leg_Press_Machine', name: 'Leg Press (Machine)', equip: 'machine', tracking: 'weight_reps', sets: [{ weight: 500 / LB, reps: 12 }] },
      { exId: 'bi_run_outdoor', name: 'Run', tracking: 'distance', sets: [{ weight: 900, reps: 30, done: true }] },
      { exId: 'Plank', name: 'Plank', tracking: 'duration', sets: [{ weight: 900, reps: 1, done: true }] }] });
    S.s('hist', h); }, [LB]);
  top = await page.evaluate(() => topPRSet()); card = await cardTxt(page);
  check('Top PR: imported 500 x 12 counts; cardio distance and hold seconds never do', top.exId === 'Calf_Press_On_The_Leg_Press_Machine' && Math.round(top.weight * LB) === 500 && /500lb × 12 reps/.test(card), card);
  // kg display follows the unit setting.
  await page.evaluate(() => { const s = S.g('settings'); S.s('settings', { ...(s || {}), wUnit: 'kg' }); });
  card = await cardTxt(page);
  check('Top PR: shown in kg when the unit is kg (500 lb = 226.8 kg)', /226\.8kg × 12 reps|227kg × 12 reps/.test(card), card);
  // No weighted lift at all: no Top PR row (bodyweight-only user).
  const B = await phone({ seed: { hist: [hist[0]], prs: { Pushups: prs.Pushups }, bw: BW }, now: SEP15 });
  const cardB = await cardTxt(B.page);
  check('Top PR: bodyweight-only history shows no Top PR (not push-ups)', !/Top PR/.test(cardB), cardB);
  await B.ctx.close();
  check('Top PR: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
async function monthReset() {
  // Mr. Roni 2026-10-01 (photo: "Past Month" still showed Dad 413.1K lb on Oct 1): "For the leaderboards first day of
  // the month should show the metrics reset for the leaderboards." Calendar month in local time (America/Denver
  // here), every chip, "This Month"; crown = last calendar month's winner; friends measured on the same month.
  const KG = lb => lb / LB, near = (kg, lb) => Math.abs(kg * LB - lb) < 3;
  const W = (iso, lbs, pr = 0, id) => ({ id: id || 'w' + iso, name: 'W', date: new Date(iso).toISOString(), exercises: [ex('Barbell Squat', [[100, 1]])], duration: '30:00', sets: 1, totalVolume: KG(lbs), prCount: pr });
  const hist = [W('2026-09-15T12:00:00-06:00', 40000, 2), W('2026-09-30T23:30:00-06:00', 5000, 1), W('2026-10-01T00:30:00-06:00', 3000, 1)];
  // Sep 30 23:59 MDT: Sep 30's late workout is this month; Oct's isn't here yet (it's in the future).
  {
    const { page, ctx } = await phone({ seed: { hist: hist.slice(0, 2) }, now: new Date('2026-09-30T23:59:00-06:00') });
    const m = await page.evaluate(() => monthStats());
    check('month boundary: Sep 30 23:59 MDT -> September counts both Sep workouts', m.ym === '2026-09' && near(m.v, 45000) && m.w === 2 && m.p === 3, JSON.stringify(m));
    await ctx.close();
  }
  // Oct 1 00:05 MDT, nothing logged yet in October (the 23:30 Sep 30 workout is 05:30Z Oct 1 -- still September locally).
  const bobOld = { id: '@bob', code: '@bob', name: 'Bob', username: '@bob', totalVolume: KG(900000), workouts: 200, prs: 50, streak: 4, consistency: 60, badges: 9,
    // Old build: rolling-30-day numbers, no month stamp. Last published Sep 29 (so its pv is August).
    mVol: KG(413100), mWorkouts: 12, mPRs: 21, pmVol: KG(99999), days: ['2026-09-26', '2026-09-27', '2026-09-29'],
    wd: [{ name: 'Legs', date: '2026-09-29T20:00:00Z', vol: KG(30000), sets: 20 }, { name: 'Back', date: '2026-09-27T20:00:00Z', vol: KG(25000), sets: 20 },
      { name: 'Push', date: '2026-09-26T20:00:00Z', vol: KG(20000), sets: 20 }], recent: [] };
  const amyNew = { id: '@amy', code: '@amy', name: 'Amy', username: '@amy', totalVolume: KG(500000), workouts: 100, prs: 30, streak: 2, consistency: 40, badges: 5,
    // New build, last published in September: her stamped month total is her final September.
    mYm: '2026-09', mVol: KG(60000), mWorkouts: 9, mPRs: 4, pmVol: KG(10000), mStreak: 3, mCons: 30, mBadges: 2, days: ['2026-09-28'], wd: [], recent: [] };
  const seedOct = { hist: hist.slice(0, 2), friends: [bobOld, amyNew], closeBuddies: ['@bob', '@amy'] };
  {
    const { page, ctx, errors } = await phone({ seed: seedOct, now: new Date('2026-10-01T00:05:00-06:00') });
    const mine = await page.evaluate(() => monthStats());
    check('month boundary: Oct 1 00:05 MDT -> this month is empty (0 weight, 0 sessions, 0 PRs, 0 streak, 0%)', mine.ym === '2026-10' && mine.v === 0 && mine.w === 0 && mine.p === 0 && mine.st === 0 && mine.c === 0, JSON.stringify(mine));
    check('month boundary: Sep 30 23:30 MDT workout counts toward September (crown total 45,000 lb)', near(mine.pv, 45000), String(mine.pv * LB));
    const vals = await page.evaluate(() => CMP.map(c => [c.k, [yourStats(), ...friendSrc()].map(p => c.mon(p))]));
    check('Oct 1: every This Month chip is 0 for everyone (you, an old-build friend, a September-stamped friend)', vals.every(([, v]) => v.every(x => x === 0)), JSON.stringify(vals));
    // Crown = September's winner. Bob (old build, published in September) is measured from his shared September workouts
    // (75,000 lb), never his stale August pv (99,999). Amy's final September = 60,000. You: 45,000.
    const crowned = await page.evaluate(() => [...crownCodes()]);
    check('crown on Oct 1 = September winner (Bob 75,000 lb from his shared Sept workouts)', crowned.join() === '@bob', JSON.stringify(crowned) + ' ' + JSON.stringify(await page.evaluate(() => friendSrc().map(p => [p.code, Math.round(monthOf(p).pv * 2.20462)]))));
    await page.evaluate(() => { sp('leaderboard'); cmpRange = 'month'; renderLB(); });
    await page.waitForTimeout(150);
    const ui = await page.evaluate(() => ({ tog: [...document.querySelectorAll('#compareBoard .unit-tog button')].map(b => b.textContent.trim()),
      rows: [...document.querySelectorAll('#compareBoard .lbi')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), medals: document.querySelectorAll('#compareBoard .lbr.gold,#compareBoard .lbr.silver,#compareBoard .lbr.bronze').length,
      txt: document.getElementById('compareBoard').textContent }));
    check('toggle reads "This Month" / "All Time"', ui.tog.join('|') === 'This Month|All Time', ui.tog.join('|'));
    check('Oct 1 board: everyone at 0, no medals, you first then by name, fresh-board note', ui.rows.length === 3 && /You/.test(ui.rows[0]) && /Amy/.test(ui.rows[1]) && /Bob/.test(ui.rows[2])
      && ui.rows.every(r => /\b0 lb/.test(r)) && ui.medals === 0 && /New month/.test(ui.txt) && !/413/.test(ui.txt), JSON.stringify(ui.rows));
    for (const k of ['prs', 'workouts', 'streak', 'consistency', 'badges']) {
      await page.evaluate(k => cmpSw(k), k); await page.waitForTimeout(50);
      const t = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#compareBoard .lbi')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), how: (document.getElementById('cmpHow') || {}).textContent || '' }));
      check(`Oct 1 board (${k}): everyone shows 0 and the chip says how it's counted`, t.rows.every(r => /(^|\s)0(d|%)?\s*$/.test(r) || /\s0\s*$/.test(r.replace(/[^\w\s%]/g, ' ').trim() + ' ') || / 0( |d|%|$)/.test(r)) && t.how.length > 5, JSON.stringify(t));
    }
    await page.evaluate(() => { cmpSw('volume'); cmpRangeSet('all'); });
    const allT = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#compareBoard .lbi')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), how: !!document.getElementById('cmpHow') }));
    check('All Time unchanged (Bob 900K lb first)', /Bob/.test(allT.rows[0]) && /900/.test(allT.rows[0]) && !allT.how, JSON.stringify(allT));
    check('month reset: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // Oct 5 MDT: values match what each person did since the 1st.
  {
    const oct = [...hist, W('2026-10-02T09:00:00-06:00', 2000, 0), W('2026-10-03T09:00:00-06:00', 4000, 2), W('2026-10-05T07:00:00-06:00', 1000, 0)];
    // Bob still on the old build, but he trained in October and published: his rolling 30 days must not show; his
    // October workouts from his shared list are counted. His pv was computed in October -> it is September's.
    const bob = { ...bobOld, mVol: KG(420000), pmVol: KG(75000), days: [...bobOld.days, '2026-10-01', '2026-10-02'],
      wd: [{ name: 'Legs', date: '2026-10-02T16:00:00Z', vol: KG(8000), sets: 20 }, { name: 'Arms', date: '2026-10-01T16:00:00Z', vol: KG(7000), sets: 20 }, ...bobOld.wd] };
    const amy = { ...amyNew, mYm: '2026-10', mVol: KG(12345), mWorkouts: 3, mPRs: 2, mStreak: 2, mCons: 40, mBadges: 1, pmVol: KG(60000) };
    const { page, ctx, errors } = await phone({ seed: { hist: oct, friends: [bob, amy], closeBuddies: ['@bob', '@amy'] }, now: new Date('2026-10-05T18:00:00-06:00') });
    const r = await page.evaluate(() => { const ppl = [yourStats(), ...friendSrc()]; return Object.fromEntries(ppl.map(p => [p.code, monthOf(p)])); });
    const me = r['@tester'], b = r['@bob'], a = r['@amy'];
    check('Oct 5 (you): weight = Oct 1+2+3+5 workouts (10,000 lb), 4 sessions, 3 PRs', near(me.v, 10000) && me.w === 4 && me.p === 3, JSON.stringify(me));
    check('Oct 5 (you): longest run Oct 1-3 = 3 days; consistency 4 of 5 days = 80%', me.st === 3 && me.c === 80, JSON.stringify(me));
    const pub = await page.evaluate(() => myActivity().m);
    check('Oct 5 (you): what you publish to friends is stamped 2026-10 and equals your board numbers', pub.ym === '2026-10' && pub.v === me.v && pub.w === me.w && pub.p === me.p && pub.st === me.st && pub.c === me.c, JSON.stringify(pub));
    check('Oct 5 (old-build friend): October from his shared workouts (15,000 lb, 2 sessions), never his rolling 420K; PRs/badges 0', near(b.v, 15000) && b.w === 2 && b.p === 0 && b.b === 0, JSON.stringify(b));
    check('Oct 5 (old-build friend): streak 2 (Oct 1-2), consistency 2/5 = 40%', b.st === 2 && b.c === 40, JSON.stringify(b));
    check('Oct 5 (old-build friend): crown total = his October-computed pv (75,000 lb)', near(b.pv, 75000), JSON.stringify(b));
    check('Oct 5 (new-build friend, stamped October): her published numbers', near(a.v, 12345) && a.w === 3 && a.p === 2 && a.st === 2 && a.c === 40 && a.b === 1, JSON.stringify(a));
    // Cloud mapping keeps the stamp (refreshFriends -> cleanPerson round trip).
    const cp = await page.evaluate(() => cleanPerson({ code: '@zed', mYm: '2026-10', mStreak: 3, mCons: 50, mBadges: 1 }));
    check('friend cache keeps the month stamp and the new month numbers', cp.mYm === '2026-10' && cp.mStreak === 3 && cp.mCons === 50 && cp.mBadges === 1, JSON.stringify(cp));
    await page.evaluate(() => { sp('leaderboard'); cmpRange = 'month'; cmpSw('volume'); });
    const rows = await page.evaluate(() => [...document.querySelectorAll('#compareBoard .lbi')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    check('Oct 5 board (weight): Bob 15K, Amy 12.3K, you 10K in that order', /Bob/.test(rows[0]) && /Amy/.test(rows[1]) && /You/.test(rows[2]), JSON.stringify(rows));
    check('Oct 5: crown is still September\'s winner (Bob 75,000 lb vs Amy 60,000 vs you 45,000)', (await page.evaluate(() => [...crownCodes()])).join() === '@bob', '');
    check('month values: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
const MGROUPS_ok = (sc, only) => Object.entries(sc).every(([g, v]) => g === only || v === 0);

await startServer();
await launch();
try {
  for (const s of [regression, workoutFlow, tapToClear, coward, consistency, jacked, monthly, achievementsPage, narrowAndShots, pastPRs, prReconcile, portraitLock, suggestions, suggestTrained, badgeLadders, benchGoodlift, confirmCentered, cardioOrder, typeRulebook, haptics, tricepsTier, lifetimeAvgMin, crunchRegex, builtinMachines, exerciseAudit, multiMuscleCredit, profileTabs, badgeStandard, benchSubstitutes, badgePopupSections, timedHolds, avatarLightbox, exercisePhoto, backExtLoad, backExtRepair, popupScrollLock, topPRRaw, monthReset].filter(s => !process.env.JK_ONLY || process.env.JK_ONLY.split(',').includes(s.name))) {   // JK_ONLY=suiteA,suiteB runs a subset
    try { await s(); } catch (e) { check(`${s.name}: suite crashed`, false, e.stack.split('\n').slice(0, 3).join(' ')); }
  }
} finally { await close(); stopServer(); }
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
