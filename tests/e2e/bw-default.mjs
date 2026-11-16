// Bodyweight lifts must open in Bodyweight mode with no weight box (Mr. Roni, 2026-11-11: "The dips exercises
// and all other bodyweight exercises aren't defaulting to bodyweight"). Root cause: a workout started before
// the exercise library loaded (slow or no signal; the service worker stopped caching the library when it moved
// to our own bucket on 2026-11-03) saved every lift with blank equipment, so isBodyweightEx() said no.
import { phone, check } from './harness.mjs';

// What the workout card actually shows, per exercise: which Load option is on, and whether a weight box exists.
const cards = page => page.evaluate(() => aw.exercises.map((e, i) => {
  const card = document.getElementById('eb' + i);
  const on = card ? [...card.querySelectorAll('.cab-opt.on')].map(b => b.textContent.trim()) : [];
  return { id: e.exId, equip: e.equip, load: on.find(t => /Bodyweight|Added|Assist/.test(t)) || null,
    weightBox: card ? card.querySelectorAll('input[inputmode="decimal"]').length : -1 };
}));
const waitDB = page => page.waitForFunction(() => dbLoaded, null, { timeout: 30000 });
const fmt = rows => rows.slice(0, 8).map(r => `${r.id}[equip=${r.equip} load=${r.load} box=${r.weightBox}]`).join(', ');

// Every bodyweight-tagged rep exercise in the whole library, added to one workout.
async function bwDefaultAllLibrary() {
  const { page, ctx, errors } = await phone();
  await waitDB(page);
  const ids = await page.evaluate(() => allEx().filter(e => isBodyweightEx(e) && (e.tracking || 'weight_reps') !== 'duration'
    && (e.tracking || 'weight_reps') !== 'distance' && (e.tracking || 'weight_reps') !== 'reps_only').map(e => e.id));
  check('bwDefault: library has a real list of bodyweight lifts', ids.length > 80, String(ids.length));
  for (const must of ['Dips_-_Triceps_Version', 'Dips_-_Chest_Version', 'Parallel_Bar_Dip', 'Ring_Dips', 'Bench_Dips', 'Pullups', 'Chin-Up', 'Pushups', 'Muscle_Up', 'Inverted_Row'])
    check(`bwDefault: ${must} is tagged bodyweight`, ids.includes(must));
  await page.evaluate(ids => { startEmpty(); ids.forEach(id => addExToWorkout(id)); }, ids);
  await page.waitForTimeout(300);
  const rows = await cards(page);
  const bad = rows.filter(r => r.load !== 'Bodyweight' || r.weightBox !== 0);
  check(`bwDefault: all ${rows.length} bodyweight lifts open on Bodyweight with no weight box`, rows.length === ids.length && bad.length === 0, fmt(bad));
  // Exceptions stay as they are.
  await page.evaluate(() => { aw.exercises = []; ['Weighted_Bench_Dip', 'Hyperextensions_Back_Extensions', 'Dip_Machine', 'bi_assisted_dip_machine', 'bi_assisted_pullup_machine'].forEach(id => addExToWorkout(id)); });
  await page.waitForTimeout(200);
  const ex = Object.fromEntries((await cards(page)).map(r => [r.id, r]));
  check('bwDefault: Weighted Bench Dip keeps a weight box, no Load toggle', ex.Weighted_Bench_Dip.load === null && ex.Weighted_Bench_Dip.weightBox > 0);
  check('bwDefault: back extension keeps a weight box, no Load toggle', ex.Hyperextensions_Back_Extensions.load === null && ex.Hyperextensions_Back_Extensions.weightBox > 0);
  check('bwDefault: Dip machine keeps a weight box', ex.Dip_Machine.load === null && ex.Dip_Machine.weightBox > 0);
  check('bwDefault: assisted dip/pull-up machines open on Assist', ex.bi_assisted_dip_machine.load === '− Assist' && ex.bi_assisted_pullup_machine.load === '− Assist',
    JSON.stringify([ex.bi_assisted_dip_machine, ex.bi_assisted_pullup_machine]));
  check('bwDefault: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// The actual bug: a routine started before the library has arrived, then the library loads.
async function bwDefaultBeforeLibrary() {
  const IDS = ['Dips_-_Triceps_Version', 'Dips_-_Chest_Version', 'Parallel_Bar_Dip', 'Pullups', 'Pushups', 'Plank', 'Barbell_Bench_Press_-_Medium_Grip'];
  const { page, ctx, errors } = await phone({ seed: { routines: [{ id: 'r1', name: 'BW', exercises: IDS }] } });
  await waitDB(page);
  await page.evaluate(() => { allDB = []; dbLoaded = false; dbLoading = false; startRW('r1'); });   // library not here yet
  await page.waitForTimeout(200);
  const before = await cards(page);
  check('bwDefault(pre-load): reproduces the bug -- blank equipment, weight box on dips', before[0].equip === '' && before[0].weightBox > 0, fmt(before));
  // he types a weight on one bodyweight lift before the library lands: that entry is left exactly as logged
  await page.evaluate(() => { aw.exercises[3].sets[0].weight = 180; saveAW(); });
  await page.evaluate(() => loadDB());
  await waitDB(page); await page.waitForTimeout(300);
  const after = Object.fromEntries((await cards(page)).map(r => [r.id, r]));
  for (const id of ['Dips_-_Triceps_Version', 'Dips_-_Chest_Version', 'Parallel_Bar_Dip', 'Pushups'])
    check(`bwDefault(pre-load): ${id} switches to Bodyweight once the library loads`, after[id].load === 'Bodyweight' && after[id].weightBox === 0, JSON.stringify(after[id]));
  check('bwDefault(pre-load): a lift with a typed weight is left as logged', after.Pullups.equip === '' && after.Pullups.weightBox > 0, JSON.stringify(after.Pullups));
  check('bwDefault(pre-load): Plank becomes timed again', await page.evaluate(() => aw.exercises[5].tracking) === 'duration');
  check('bwDefault(pre-load): bench press keeps its weight box', after['Barbell_Bench_Press_-_Medium_Grip'].load === null && after['Barbell_Bench_Press_-_Medium_Grip'].weightBox > 0);
  check('bwDefault(pre-load): fix is saved, not just drawn', await page.evaluate(() => JSON.parse(localStorage.getItem('jk_activeWorkout')).aw.exercises[0].equip) === 'body only');
  check('bwDefault(pre-load): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// A workout already saved with the bug (blank equipment) is repaired when the app reopens.
async function bwDefaultSavedWorkout() {
  const mk = id => ({ exId: id, name: id, muscle: '', equip: '', assist: false, tracking: 'weight_reps', imgUrl: null, sets: [{ weight: 0, reps: 0, done: false }] });
  const aw = { id: 'w1', name: 'Quick Workout', date: new Date().toISOString(), exercises: ['Ring_Dips', 'Chin-Up', 'Decline_Push-Up'].map(mk) };
  const { page, ctx, errors } = await phone({ seed: { activeWorkout: { aw, awStart: Date.now(), awTouch: Date.now() } } });
  await waitDB(page);
  await page.evaluate(() => typeof renderWS === 'function' && aw && renderWS());
  await page.waitForTimeout(200);
  const rows = await cards(page);
  check('bwDefault(saved): a reopened workout shows Bodyweight on all its bodyweight lifts', rows.length === 3 && rows.every(r => r.load === 'Bodyweight' && r.weightBox === 0), fmt(rows));
  check('bwDefault(saved): no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// Offline cache: the service worker must cache-first the public exercise library bucket (and nothing else on supabase.co).
async function bwDefaultSwCachesLibrary() {
  const fs = await import('fs');
  const sw = fs.readFileSync(new URL('../../jacked-pwa/sw.js', import.meta.url), 'utf8');
  const lib = sw.indexOf("supabase.co/storage/v1/object/public/exercise-images/"), skip = sw.indexOf("if (req.url.includes('supabase.co')) return;");
  check('bwDefault(sw): exercise library bucket is cached before the supabase network-only rule', lib > 0 && skip > lib);
}

export const BW_DEFAULT_SUITES = [bwDefaultAllLibrary, bwDefaultBeforeLibrary, bwDefaultSavedWorkout, bwDefaultSwCachesLibrary];
