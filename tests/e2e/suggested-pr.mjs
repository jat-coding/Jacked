// Suggested vs documented PR (Mr. Roni, 2026-10-20, tasks/2026-10-20-suggested-vs-documented-pr.md): a new best e1RM that
// only came from an estimate (lighter weight, more reps) is a SUGGESTED PR, labeled, never counted; it becomes the real PR
// once a set's raw weight reaches what the estimate implied. Follow-up the same day (the locked rule): the DOCUMENTED PR is the
// heaviest weight actually lifted, never the rep-adjusted e1RM, and a multi-rep PR also shows its estimate as suggested.
// Real library exercises (free-exercise-db, loaded in the page).
import { phone, check, LB } from './harness.mjs';

const BENCH = 'Barbell_Bench_Press_-_Medium_Grip', SQUAT = 'Barbell_Squat', DEAD = 'Barbell_Deadlift';
const OLD = '2026-09-01T18:00:00.000Z';
const kg = lb => lb / LB, lb = v => Math.round(v * LB * 10) / 10;
const SEED_W = { id: 'w1756749600000', name: 'Push', date: OLD, duration: '30:00', sets: 1, totalVolume: Math.round(kg(220)), prCount: 1,
  prSets: [{ exId: BENCH, ei: 0, si: 0, weight: kg(220), reps: 1 }],
  exercises: [{ exId: BENCH, name: 'Barbell Bench Press - Medium Grip', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps', sets: [{ weight: kg(220), reps: 1, done: true }] }] };
const SEED = { hist: [SEED_W], prs: { [BENCH]: { weight: kg(220), reps: 1, date: OLD } } };
const dbReady = page => page.evaluate(async () => { loadDB(); for (let i = 0; i < 200 && (dbLoading || !dbLoaded); i++) await new Promise(r => setTimeout(r, 100)); return dbLoaded; });

// Finish a workout on this page through the real finish path, sets = {exId: [[lb, reps], ...]} (all done).
async function finish(page, sets, at) {
  return page.evaluate(({ sets, at }) => {
    const ids = Object.keys(sets);
    S.s('routines', [{ id: 'rS', name: 'S', desc: '', exercises: ids }]);
    startRW('rS');
    aw.exercises.forEach(e => { e.sets = sets[e.exId].map(([w, r]) => ({ weight: w, reps: r, done: true })); });
    renderWS();
    const card = ids.map((id, ei) => { const el = document.getElementById('eb' + ei); return { star: /★ PR/.test(el.innerHTML), sug: !!el.querySelector('.ebn .sug-tag'), setSug: !!el.querySelector('.sn .sug-tag'), sub: el.querySelector('.ebn').parentElement.textContent }; });
    if (at) aw.date = at;
    _finishWContinue(false);
    const fs = document.getElementById('fsContent');
    const w = gH()[gH().length - 1];
    return { card, w, fsText: fs ? fs.textContent : '', fsSug: !!document.getElementById('fsSugPRs'),
      prs: gPR(), sug: gPRSug() };
  }, { sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.map(([l, r]) => [l / 2.20462, r])])), at });
}
const closeFs = page => page.evaluate(() => { document.querySelectorAll('.modal.open,.ov.open').forEach(m => m.classList.remove('open')); });
// Live records vs what history replays to, for every workout and the final records (Done-when 4).
const agree = page => page.evaluate(() => {
  const rp = prReplay(), bad = [];
  gH().forEach(w => {
    const r = rp.get(w.id) || NO_PRS, k = l => JSON.stringify((l || []).map(p => [p.exId, p.ei, p.si, Math.round(p.weight * 1000), p.reps]));
    if (r.n !== w.prCount || k(r.list) !== k(w.prSets) || k(r.sug) !== k(w.sugSets)) bad.push({ id: w.id, stored: [w.prCount, k(w.prSets), k(w.sugSets)], replay: [r.n, k(r.list), k(r.sug)] });
  });
  const prs = gPR(), sug = gPRSug();
  Object.keys(prs).forEach(id => { const r = replayRecord(id); if (!r || Math.abs(r.weight - prs[id].weight) > 1e-9 || r.reps !== prs[id].reps) bad.push({ rec: id, stored: prs[id], replay: r }); });
  const se = rp.sugEnd;
  new Set([...Object.keys(sug), ...se.keys()]).forEach(id => { const a = sug[id], b = se.get(id); if (!a !== !b || (a && (Math.abs(a.weight - b.weight) > 1e-9 || a.reps !== b.reps))) bad.push({ sug: id, stored: a, replay: b }); });
  return bad;
});

export async function suggestedPR() {
  const { page, ctx, errors } = await phone({ seed: SEED });
  const real = await dbReady(page) && await page.evaluate(([b, s, d]) => [b, s, d].map(id => { const e = byId(id); return e && e.name && !e._c ? `${e.name}|${e.equip}|${e.tracking || 'weight_reps'}` : null; }), [BENCH, SQUAT, DEAD]);
  check('suggested PR: real free-exercise-db entries in use (VERIFY #3)', real && real.every(Boolean), JSON.stringify(real));

  // Done-when 1: 200 x 8 (e1RM ~253) beats the 220 x 1 PR's e1RM but is lighter -> suggested, not documented.
  let r = await finish(page, { [BENCH]: [[185, 5], [200, 8]] });
  // 2026-10-23 (Mr. Roni, friend flagged it as confusing mid-set): the gold SUGGESTED pill + 'S' set
  // marker are hidden on THIS screen (the live, in-progress workout) only -- the estimate is still
  // tracked underneath (r.sug/r.w.sugSets/the finish-summary and exercise-info checks below).
  check('suggested PR: live in-progress screen hides the suggested tag and the per-set S marker, no PR star', !r.card[0].star && !r.card[0].sug && !r.card[0].setSug, JSON.stringify(r.card));
  check('suggested PR: documented 220 x 1 left as it was', lb(r.prs[BENCH].weight) === 220 && r.prs[BENCH].reps === 1 && r.prs[BENCH].date === OLD, JSON.stringify(r.prs[BENCH]));
  check('suggested PR: stored as a separate suggested record (200 x 8)', r.sug[BENCH] && lb(r.sug[BENCH].weight) === 200 && r.sug[BENCH].reps === 8, JSON.stringify(r.sug));
  check('suggested PR: not counted as a PR (prCount 0, no prSets), saved in sugSets', r.w.prCount === 0 && r.w.prSets.length === 0 && r.w.sugSets.length === 1 && r.w.sugSets[0].si === 1 && r.w.prRule === 2, JSON.stringify([r.w.prCount, r.w.prSets, r.w.sugSets]));
  check('suggested PR: finish screen lists it under Suggested PRs with its implied weight', r.fsSug && /Suggested PRs/.test(r.fsText) && /253/.test(r.fsText) && /Becomes your PR once you lift 253/.test(r.fsText) && !/New PRs/.test(r.fsText), r.fsText.slice(0, 400));
  await closeFs(page);
  const shown = await page.evaluate(([id, wid]) => {
    openExInfo(id); const info = (document.getElementById('exSugPR') || {}).textContent || '';
    sp('exercises'); const q = document.getElementById('exSearch') || document.querySelector('#exercises input'); if (q) { q.value = 'bench press'; } renderEx();
    const lib = [...document.querySelectorAll('#exList .ex-sug')].map(e => e.textContent).join('|');
    openWD(wid); const wd = document.getElementById('wdContent').innerHTML;
    const p = prsOf(gH().find(w => w.id === wid));
    const rows = document.querySelectorAll('#exList .eli').length;
    return { rows, info, lib, wdSug: (wd.match(/sug-tag/g) || []).length, wdStar: /★/.test(wd), p: { n: p.n, sug: p.sug.length } };
  }, [BENCH, r.w.id]);
  check('suggested PR: exercise info shows Suggested PR next to the real one', /Suggested PR/.test(shown.info) && /253/.test(shown.info) && /Your PR is 220/.test(shown.info), shown.info);
  check('suggested PR: exercise library row shows the suggested number', /253.*suggested/.test(shown.lib), shown.lib + ' rows=' + shown.rows);
  check('suggested PR: past workout view tags the set "suggested", no star, 0 PRs', shown.wdSug === 1 && !shown.wdStar && shown.p.n === 0 && shown.p.sug === 1, JSON.stringify(shown));
  await closeFs(page);

  // A higher estimate from a still-lighter set just moves the suggestion (195 x 10 ~ 260); nothing documents.
  r = await finish(page, { [BENCH]: [[195, 10]] });
  check('suggested PR: a higher estimate from a lighter set updates the suggestion only', lb(r.prs[BENCH].weight) === 220 && lb(r.sug[BENCH].weight) === 195 && r.sug[BENCH].reps === 10 && r.w.prCount === 0 && r.w.sugSets.length === 1, JSON.stringify([r.prs[BENCH], r.sug[BENCH]]));
  await closeFs(page);
  // A lower estimate than the current suggestion: nothing at all.
  r = await finish(page, { [BENCH]: [[180, 12]] });
  check('suggested PR: a lower estimate leaves both records alone', lb(r.sug[BENCH].weight) === 195 && r.w.prCount === 0 && r.w.sugSets.length === 0, JSON.stringify([r.sug[BENCH], r.w.sugSets]));
  await closeFs(page);

  // Done-when 2: a real single that beats the documented PR documents at once, as today (240 x 1 > 220 x 1). It does not
  // reach the 260 suggestion, so that one stays.
  r = await finish(page, { [BENCH]: [[240, 1]] });
  check('suggested PR: a real 1-rep lift past the PR documents immediately (star, prCount 1)', r.card[0].star && !r.card[0].sug && lb(r.prs[BENCH].weight) === 240 && r.prs[BENCH].reps === 1 && r.w.prCount === 1 && /New PRs/.test(r.fsText), JSON.stringify([r.card, r.prs[BENCH]]));
  check('suggested PR: the 260 suggestion stands (240 did not reach it)', r.sug[BENCH] && lb(r.sug[BENCH].weight) === 195, JSON.stringify(r.sug));
  await closeFs(page);

  // Done-when 3: promotion. 262 x 1 is real weight past the ~260 implied: documented, dated now, suggestion cleared.
  const before = Date.now();
  r = await finish(page, { [BENCH]: [[262, 1]] });
  check('suggested PR: lifting the implied weight promotes it to the real PR, no tap needed', lb(r.prs[BENCH].weight) === 262 && r.prs[BENCH].reps === 1 && +new Date(r.prs[BENCH].date) >= before - 5 && !r.sug[BENCH] && r.w.prCount === 1 && r.w.sugSets.length === 0 && !r.fsSug, JSON.stringify([r.prs[BENCH], r.sug]));
  await closeFs(page);
  const after = await page.evaluate(id => { openExInfo(id); return !!document.getElementById('exSugPR'); }, BENCH);
  check('suggested PR: the "suggested" label is gone after promotion', !after);
  await closeFs(page);
  // "if the PR is for multiple weights then show the suggested PR": a heavier 3-rep set documents as 270 x 3 AND shows the
  // ~297 it implies as suggested, both on screen at once.
  r = await finish(page, { [BENCH]: [[270, 3]] });
  check('suggested PR: a multi-rep PR documents its real weight and also implies a suggested 1RM (not shown on the live screen, but stored and on the finish summary)', r.card[0].star && !r.card[0].sug && !r.card[0].setSug && lb(r.prs[BENCH].weight) === 270 && r.prs[BENCH].reps === 3 && lb(r.sug[BENCH].weight) === 270 && r.sug[BENCH].reps === 3 && r.w.prCount === 1 && r.w.sugSets.length === 1 && /New PRs/.test(r.fsText) && /297/.test(r.fsText) && r.fsSug, JSON.stringify([r.card, r.prs[BENCH], r.sug[BENCH]]) + r.fsText.slice(0, 300));
  await closeFs(page);
  const both = await page.evaluate(id => { openExInfo(id); return (document.getElementById('exSugPR') || {}).textContent || ''; }, BENCH);
  check('suggested PR: exercise info shows both at once (suggested 297, PR 270 x 3)', /297/.test(both) && /Your PR is 270/.test(both), both);
  await closeFs(page);

  // Done-when 2, the card's own example: a real 200 x 1 stays the documented PR over a later real 190 x 3 (e1RM 209); the
  // 209 is only suggested. Then 205 x 1 documents (raw 205 > 200) even though the 209 estimate is higher -- it stays shown.
  r = await finish(page, { [DEAD]: [[200, 1]] });
  check('raw weight: first single documents 200 x 1, nothing suggested', lb(r.prs[DEAD].weight) === 200 && r.prs[DEAD].reps === 1 && !r.sug[DEAD] && r.w.prCount === 1, JSON.stringify([r.prs[DEAD], r.sug[DEAD]]));
  await closeFs(page);
  r = await finish(page, { [DEAD]: [[190, 3]] });
  check('raw weight: real 190 x 3 does NOT replace the real 200 x 1 (no e1RM between real lifts); 209 suggested (not shown live)', lb(r.prs[DEAD].weight) === 200 && r.prs[DEAD].reps === 1 && lb(r.sug[DEAD].weight) === 190 && r.sug[DEAD].reps === 3 && r.w.prCount === 0 && !r.card[0].star && !r.card[0].sug && !r.card[0].setSug, JSON.stringify([r.prs[DEAD], r.sug[DEAD], r.card]));
  await closeFs(page);
  r = await finish(page, { [DEAD]: [[205, 1], [180, 10]] });   // 180 x 10 implies 240 but is lighter
  check('raw weight: 205 x 1 documents even with a higher-e1RM lighter set in the same workout; 240 suggested', lb(r.prs[DEAD].weight) === 205 && r.prs[DEAD].reps === 1 && r.w.prSets[0].si === 0 && lb(r.sug[DEAD].weight) === 180 && r.sug[DEAD].reps === 10 && r.w.sugSets[0].si === 1, JSON.stringify([r.prs[DEAD], r.sug[DEAD], r.w.prSets, r.w.sugSets]));
  await closeFs(page);
  r = await finish(page, { [DEAD]: [[205, 5]] });   // same raw weight, more reps: not a new documented PR (strictly heavier); ~239 < 240
  check('raw weight: same weight with more reps is not a new documented PR', lb(r.prs[DEAD].weight) === 205 && r.prs[DEAD].reps === 1 && r.w.prCount === 0 && lb(r.sug[DEAD].weight) === 180, JSON.stringify([r.prs[DEAD], r.sug[DEAD]]));
  await closeFs(page);

  // A first-ever lift is a real set, so it documents (no PR yet = nothing to estimate past); heavier-and-more-reps documents too.
  r = await finish(page, { [SQUAT]: [[225, 5]] });
  check('suggested PR: first logged set of a lift documents its real weight, its 5-rep estimate is suggested', lb(r.prs[SQUAT].weight) === 225 && r.prs[SQUAT].reps === 5 && r.w.prCount === 1 && lb(r.sug[SQUAT].weight) === 225 && r.sug[SQUAT].reps === 5, JSON.stringify([r.prs[SQUAT], r.sug[SQUAT]]));
  await closeFs(page);
  // Same workout: a heavier real set and a lighter estimate set -- the heavy one documents, the estimate is suggested.
  r = await finish(page, { [SQUAT]: [[265, 1], [215, 10]] });   // 265 > 225 raw; 215 x 10 ~287 but lighter than 265
  check('suggested PR: one workout can document the heavy single AND suggest the lighter estimate', lb(r.prs[SQUAT].weight) === 265 && r.prs[SQUAT].reps === 1 && lb(r.sug[SQUAT].weight) === 215 && r.w.prCount === 1 && r.w.prSets[0].si === 0 && r.w.sugSets[0].si === 1, JSON.stringify([r.prs[SQUAT], r.sug[SQUAT], r.w.prSets, r.w.sugSets]));
  await closeFs(page);

  // Done-when 4: every workout above, and the final records, replay identically from history.
  const bad = await agree(page);
  check('suggested PR: commitPRs and prReplay agree for every workout and the final records', bad.length === 0, JSON.stringify(bad).slice(0, 600));
  // Editing the suggesting set away (Edit Workout's repair path) rebuilds the suggestion from history too.
  const ed = await page.evaluate(id => {
    const h = gH(), wi = h.findIndex(w => (w.sugSets || []).some(p => p.exId === id && p.reps === 10));
    const w = JSON.parse(JSON.stringify(h[wi])); w.exercises[0].sets = w.exercises[0].sets.filter((s, i) => i !== w.sugSets[0].si);
    const h2 = h.slice(); h2[wi] = w; commitHistRepair(h2, new Set([id]), new Date().toISOString());
    return { sug: gPRSug()[id] || null, prs: gPR()[id] };
  }, SQUAT);
  check('suggested PR: editing the estimate set away clears the suggestion (history repair)', !ed.sug && lb(ed.prs.weight) === 265, JSON.stringify(ed));
  check('suggested PR: still agrees with history after the repair', (await agree(page)).length === 0, JSON.stringify(await agree(page)).slice(0, 400));
  // Reset PR clears the suggestion along with the record.
  const rs = await page.evaluate(id => { S.s('prSug', { ...gPRSug(), [id]: { weight: 100, reps: 10, date: '2026-09-02T00:00:00.000Z' } }); clearPRsBefore({ [id]: new Date().toISOString() }); return [!!gPR()[id], !!gPRSug()[id]]; }, SQUAT);
  check('suggested PR: Reset PR clears the suggested record too', rs.join() === 'false,false', rs.join());
  // Imported (Strong) workouts keep their own raw rule: lighter-more-reps after a heavier import is not a PR, nothing suggested.
  const imp = await page.evaluate(() => {
    const e = (w, r) => ({ exId: 'Barbell_Curl', name: 'Barbell Curl', tracking: 'weight_reps', sets: [{ weight: w, reps: r, done: true }] });
    const h = [{ id: 'w1700000000000_0', date: '2023-11-14T12:00:00.000Z', exercises: [e(150, 1)] }, { id: 'w1700100000000_1', date: '2023-11-16T12:00:00.000Z', exercises: [e(140, 8)] }];
    S.s('hist', [...h, ...gH()]);
    const rp = prReplay(); return [rp.get(h[0].id).n, rp.get(h[1].id).n, rp.get(h[1].id).sug.length];
  });
  check('suggested PR: imported workouts unchanged (raw-weight rule, never suggested)', imp.join() === '1,0,0', imp.join());
  check('suggested PR: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Done-when 5 + 7 (VERIFY #10, written first): two devices, no sync in between. Phone A finishes an estimate-only beat
// (suggested), phone B logs a real lift heavier than what A's estimate implied; then they merge, both directions.
export async function suggestedPRTwoDevices() {
  const seed = SEED;
  const bundle = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('jk_') && k !== 'jk_appVersion').map(k => [k, JSON.parse(localStorage.getItem(k))])));
  const run = async (bLift) => {
    const A = await phone({ seed }), B = await phone({ seed });
    await dbReady(A.page); await dbReady(B.page);
    const a = await finish(A.page, { [BENCH]: [[200, 8]] }, '2026-10-20T17:00:00.000Z');
    const b = await finish(B.page, { [BENCH]: [[bLift, 1]] }, '2026-10-20T18:00:00.000Z');
    const ba = await bundle(A.page), bb = await bundle(B.page);
    // A pulls B's cloud copy and B pulls A's: mergeBackup(cloud, local), then applied on each device.
    const onA = await A.page.evaluate(c => { const m = mergeBackup(c, Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('jk_') && k !== 'jk_appVersion').map(k => [k, JSON.parse(localStorage.getItem(k))]))); applyBundle(m); return { prs: gPR(), sug: gPRSug(), info: (openExInfo('Barbell_Bench_Press_-_Medium_Grip'), !!document.getElementById('exSugPR')) }; }, bb);
    const onB = await B.page.evaluate(c => { const m = mergeBackup(c, Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('jk_') && k !== 'jk_appVersion').map(k => [k, JSON.parse(localStorage.getItem(k))]))); applyBundle(m); return { prs: gPR(), sug: gPRSug() }; }, ba);
    const agrA = await agreeRecords(A.page), agrB = await agreeRecords(B.page);
    const errs = [...A.errors, ...B.errors];
    await A.ctx.close(); await B.ctx.close();
    return { a, b, onA, onB, agrA, agrB, errs };
  };
  // B lifts 255 x 1 -- past A's ~253 implied weight.
  let r = await run(255);
  check('two devices: before sync A holds a suggestion, B a documented 255', lb(r.a.sug[BENCH].weight) === 200 && lb(r.a.prs[BENCH].weight) === 220 && lb(r.b.prs[BENCH].weight) === 255 && !r.b.sug[BENCH], JSON.stringify([r.a.sug, r.a.prs[BENCH], r.b.prs[BENCH]]));
  check('two devices: after sync both hold 255 x 1 as the PR', [r.onA, r.onB].every(o => lb(o.prs[BENCH].weight) === 255 && o.prs[BENCH].reps === 1), JSON.stringify([r.onA.prs[BENCH], r.onB.prs[BENCH]]));
  check('two devices: the stale suggestion does not survive on either device', !r.onA.sug[BENCH] && !r.onB.sug[BENCH] && !r.onA.info, JSON.stringify([r.onA.sug, r.onB.sug]));
  check('two devices: merged records match a replay of the merged history', r.agrA.length === 0 && r.agrB.length === 0, JSON.stringify([r.agrA, r.agrB]).slice(0, 500));
  check('two devices: no console errors (255)', r.errs.length === 0, r.errs.join(' | '));
  // B lifts 240 x 1 -- a real PR, but short of the ~253 A's estimate implies: both keep the suggestion, PR is 240.
  r = await run(240);
  check('two devices: a real PR short of the estimate -- PR 240 x 1 and the suggestion kept, on both', [r.onA, r.onB].every(o => lb(o.prs[BENCH].weight) === 240 && o.sug[BENCH] && lb(o.sug[BENCH].weight) === 200 && o.sug[BENCH].reps === 8) && r.onA.info, JSON.stringify([r.onA, r.onB]).slice(0, 500));
  check('two devices: merged records match a replay of the merged history (240)', r.agrA.length === 0 && r.agrB.length === 0, JSON.stringify([r.agrA, r.agrB]).slice(0, 500));
  check('two devices: no console errors (240)', r.errs.length === 0, r.errs.join(' | '));
  // Pure merge: a suggestion never replaces a documented record, and a newer-dated stale suggestion still loses.
  const P = await phone({ seed });
  const m = await P.page.evaluate(id => {
    const doc = { [id]: { weight: 120, reps: 1, date: '2026-10-19T00:00:00.000Z' } }, sug = { [id]: { weight: 85, reps: 10, date: '2026-10-20T00:00:00.000Z' } };   // implies ~113, under the other device's real 120
    const x = mergeBackup({ jk_prs: doc }, { jk_prs: { [id]: { weight: 100, reps: 1, date: '2026-09-01T18:00:00.000Z' } }, jk_prSug: sug });
    const y = mergeBackup({ jk_prs: { [id]: { weight: 100, reps: 1, date: '2026-09-01T00:00:00.000Z' } }, jk_prSug: sug }, { jk_prs: { [id]: { weight: 100, reps: 1, date: '2026-09-01T00:00:00.000Z' } } });
    return { x, y };
  }, BENCH);
  check('merge: a stale suggestion never clobbers a heavier documented PR from the other device', m.x.jk_prs[BENCH].weight === 120 && !(m.x.jk_prSug || {})[BENCH], JSON.stringify(m.x.jk_prs) + JSON.stringify(m.x.jk_prSug));
  check('merge: a suggestion only one side has is not silently dropped', m.y.jk_prSug && m.y.jk_prSug[BENCH] && m.y.jk_prSug[BENCH].weight === 85 && m.y.jk_prs[BENCH].weight === 100, JSON.stringify(m.y));
  await P.ctx.close();
}
const agreeRecords = page => page.evaluate(() => {
  const rp = prReplay(), prs = gPR(), sug = gPRSug(), bad = [];
  Object.keys(prs).forEach(id => { const r = replayRecord(id); if (r && (Math.abs(r.weight - prs[id].weight) > 1e-9 || r.reps !== prs[id].reps)) bad.push({ rec: id, stored: prs[id], replay: r }); });
  new Set([...Object.keys(sug), ...rp.sugEnd.keys()]).forEach(id => { const a = sug[id], b = rp.sugEnd.get(id); if (!a !== !b || (a && (Math.abs(a.weight - b.weight) > 1e-9 || a.reps !== b.reps))) bad.push({ sug: id, stored: a, replay: b }); });
  return bad;
});

// Records saved before the rule (legacy e1RM pick, or a device still on the old build): 190 x 3 was documented over a
// real 200 x 1. On launch the documented PR becomes the heavier real lift and the 190 x 3 estimate (209) is suggested;
// an exercise with a PR reset is left alone; legacy workouts keep the stars/prCount they were saved with.
export async function suggestedPRLegacy() {
  const D = '2026-09-01T18:00:00.000Z', E = '2026-09-03T18:00:00.000Z', CURL = 'Barbell_Curl';
  const ex = (id, w, r) => ({ exId: id, name: id, muscle: 'back', equip: 'barbell', tracking: 'weight_reps', sets: [{ weight: kg(w), reps: r, done: true }] });
  const w1 = { id: 'w1756749600001', name: 'A', date: D, duration: '30:00', sets: 2, totalVolume: 1, prCount: 2, prSets: [{ exId: DEAD, ei: 0, si: 0, weight: kg(200), reps: 1 }, { exId: SQUAT, ei: 1, si: 0, weight: kg(200), reps: 1 }], exercises: [ex(DEAD, 200, 1), ex(SQUAT, 200, 1), ex(CURL, 50, 1)] };
  const w2 = { id: 'w1756922400002', name: 'B', date: E, duration: '30:00', sets: 2, totalVolume: 1, prCount: 2, prSets: [{ exId: DEAD, ei: 0, si: 0, weight: kg(190), reps: 3 }, { exId: SQUAT, ei: 1, si: 0, weight: kg(190), reps: 3 }], exercises: [ex(DEAD, 190, 3), ex(SQUAT, 190, 3), ex(CURL, 45, 5)] };
  const RESET = '2026-09-02T00:00:00.000Z';
  const seed = { hist: [w1, w2], prs: { [DEAD]: { weight: kg(190), reps: 3, date: E }, [SQUAT]: { weight: kg(190), reps: 3, date: E }, [CURL]: { weight: kg(45), reps: 5, date: E, repaired: RESET } }, prReset: { [SQUAT]: RESET }, prRepair: { [CURL]: RESET } };
  const { page, ctx, errors } = await phone({ seed });
  const r = await page.evaluate(() => ({ prs: gPR(), sug: gPRSug(), p1: prsOf(gH()[0]).n, p2: prsOf(gH()[1]).n }));
  check('legacy: documented 190 x 3 raised to the real 200 x 1 at launch', lb(r.prs[DEAD].weight) === 200 && r.prs[DEAD].reps === 1, JSON.stringify(r.prs[DEAD]));
  check('legacy: the old 190 x 3 estimate (209) is kept as the suggested PR', r.sug[DEAD] && lb(r.sug[DEAD].weight) === 190 && r.sug[DEAD].reps === 3, JSON.stringify(r.sug));
  check('legacy: an exercise with a PR reset is not rebuilt from pre-reset history', lb(r.prs[SQUAT].weight) === 190 && !r.sug[SQUAT], JSON.stringify([r.prs[SQUAT], r.sug[SQUAT]]));
  check('legacy: a repaired exercise is rebuilt to the heavier lift and keeps its repaired stamp', lb(r.prs[CURL].weight) === 50 && r.prs[CURL].reps === 1 && !!r.prs[CURL].repaired && r.sug[CURL] && r.sug[CURL].reps === 5, JSON.stringify([r.prs[CURL], r.sug[CURL]]));
  // Review finding: the suggested number is shown rounded (215.8 lb for 185 x 5 = 215.83); lifting what is shown clears it.
  const eps = await page.evaluate(([id, k]) => {
    const exo = { exId: id, name: 'x', tracking: 'weight_reps', equip: 'barbell', sets: [{ weight: 215.8 / k, reps: 1, done: true }] };
    const sug = { weight: 185 / k, reps: 5 }, st = prWeightStep(exo, { weight: 100 / k, reps: 1 }, sug);
    return { shown: sugText(sug), doc: !!st.doc, keep: st.keepSug, stands: sugStands(sug, { weight: 215.8 / k, reps: 1 }), still: sugStands(sug, { weight: 214 / k, reps: 1 }) };
  }, [BENCH, LB]);
  check('suggested PR: lifting the shown (rounded) suggested number clears it', /215\.8/.test(eps.shown) && eps.doc && !eps.keep && !eps.stands && eps.still, JSON.stringify(eps));
  check('legacy: old workouts keep the PR counts they were saved with', r.p1 === 2 && r.p2 === 2, JSON.stringify([r.p1, r.p2]));
  const bad = await page.evaluate(id => { const x = replayRecord(id), y = gPR()[id]; return x && Math.abs(x.weight - y.weight) < 1e-9 && x.reps === y.reps; }, DEAD);
  check('legacy: the raised record matches what history replays to', bad === true);
  // Idempotent: a second launch changes nothing.
  const again = await page.evaluate(() => { const a = localStorage.getItem('jk_prs') + localStorage.getItem('jk_prSug'); const n = enforceDocumentedPRs(); return n === 0 && a === localStorage.getItem('jk_prs') + localStorage.getItem('jk_prSug'); });
  check('legacy: running the fix again changes nothing', again === true);
  // Merge with a device still holding the old e1RM pick: the heavier real lift wins both directions.
  const m = await page.evaluate(id => {
    const old = { [id]: { weight: 190, reps: 3, date: '2026-09-03T18:00:00.000Z' } }, nw = { [id]: { weight: 200, reps: 1, date: '2026-09-01T18:00:00.000Z' } };
    return [mergePRs(old, nw)[id].weight, mergePRs(nw, old)[id].weight, mergePRs({ [id]: { weight: 200, reps: 1 } }, { [id]: { weight: 200, reps: 2 } })[id].reps];
  }, DEAD);
  check('merge: documented PRs merge by raw weight (200 x 1 beats 190 x 3 either way; tie -> more reps)', m.join() === '200,200,2', m.join());
  check('legacy: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const SUGGESTED_SUITES = [suggestedPR, suggestedPRTwoDevices, suggestedPRLegacy];
