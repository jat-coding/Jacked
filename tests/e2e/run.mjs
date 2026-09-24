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
    check('jacked: does not count itself (10 required, not 11/12)', /10 \/ 10 badges · 6 \/ 6 at Gold/.test(j.detail) && !/\d+ \/ \d+/.test(j.desc), j.detail + ' | ' + j.desc);
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

await startServer();
await launch();
try {
  for (const s of [regression, workoutFlow, tapToClear, coward, consistency, jacked, narrowAndShots, pastPRs]) {
    try { await s(); } catch (e) { check(`${s.name}: suite crashed`, false, e.stack.split('\n').slice(0, 3).join(' ')); }
  }
} finally { await close(); stopServer(); }
const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
