// Parity fixtures for the Swift PR replay (ios/Jacked/Data/PRReplay.swift). Runs the PWA's REAL
// prReplay() and its helpers (pulled out of jacked-pwa/index.html, no copy) over seeded random
// histories (imported Strong/Hevy ids, prRule 2 and older workouts, mixed dates) and writes
// prreplay-fixtures.json = [{name, hist, bw, expected:{<id>:{list, sug}}}].
//   TZ=America/Denver node prreplay-gen.mjs [count]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../../../jacked-pwa/index.html'), 'utf8');
function extract(name) {
  const fn = html.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  if (fn >= 0) {
    let i = html.indexOf('{', html.indexOf(')', fn)), depth = 0;
    for (; i < html.length; i++) { const c = html[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
    return html.slice(fn, i + 1);
  }
  const at = html.search(new RegExp(`^const ${name}\\s*=`, 'm')); if (at < 0) throw new Error('not found: ' + name);
  let i = html.indexOf('=', at) + 1, depth = 0, started = false, q = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) { depth++; started = true; } else if (')]}'.includes(c)) depth--;
    else if ((c === ';' || c === '\n') && depth === 0 && (started || c === ';')) break;
  }
  return html.slice(at, i) + ';';
}
const names = ['S', 'gBW', 'histClean', 'gH', 'isHold', 'isCardio', 'isWT', 'e1rm', 'prE1rm', 'mileEquiv', 'SUG_EPS', 'NOT_BW_IDS',
  'isBodyweightEx', 'bwMode', 'bwCapable', 'effWeight', 'SINGLE_DEFAULT_IDS', 'SINGLE_BOTH_IDS', 'DOUBLE_VOL_IDS', 'setSingle', 'IMPORTED_ID',
  'importBest', 'prBest', 'prWeightStep', 'sugStands', 'NO_PRS', 'prReplay'];
const store = {};
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  console, shapeOk: () => true, storageFullWarn: () => {}, _prMemo: null };
vm.createContext(ctx);
vm.runInContext('var _prMemo=null;\n' + names.map(extract).join('\n') + '\nglobalThis.__rp=prReplay;', ctx);
let seed = 20261107; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], maybe = (p = 0.5) => rnd() < p;
const EX = [
  { exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench Press (barbell)', equip: 'barbell', tracking: 'weight_reps' },
  { exId: 'Barbell_Squat', name: 'Squat (barbell)', equip: 'barbell', tracking: 'weight_reps' },
  { exId: 'Hammer_Curls', name: 'Hammer Curls (dumbbell)', equip: 'dumbbell', tracking: 'weight_reps' },
  { exId: 'One-Arm_Dumbbell_Row', name: 'One-Arm Row (dumbbell)', equip: 'dumbbell', tracking: 'weight_reps' },
  { exId: 'Concentration_Curls', name: 'Concentration Curls', equip: 'dumbbell', tracking: 'weight_reps' },
  { exId: 'Pullups', name: 'Pullups', equip: 'body only', tracking: 'weight_reps' },
  { exId: 'Dips_-_Triceps_Version', name: 'Dips', equip: 'body only', tracking: 'bodyweight_reps' },
  { exId: 'bi_assisted_pullup_machine', name: 'Assisted Pull-Up (machine)', equip: 'machine', tracking: 'weight_reps', assist: true },
  { exId: 'Hyperextensions_Back_Extensions', name: 'Hyperextensions', equip: 'body only', tracking: 'weight_reps' },
  { exId: 'Weighted_Pull_Ups', name: 'Weighted Pull Ups', equip: 'body only', tracking: 'weight_reps' },
  { exId: 'bi_run_outdoor', name: 'Running (outdoor)', equip: 'body only', tracking: 'distance' },
  { exId: 'Plank', name: 'Plank', equip: 'body only', tracking: 'duration' },
  { exId: 'wu_back', name: 'Cat–Cow', equip: 'Bodyweight', tracking: 'reps_only' },
  { exId: '?', name: 'Unknown', equip: '', tracking: 'weight_reps' },
];
const num = () => pick([0, 0, 1, 2.5, 5, 8, 10, 12, 20, 22.68, 45.36, 60, 61.235, 100, 102.06, 140]);
const reps = () => pick([0, 1, 1, 3, 5, 5, 8, 10, 12, 15]);
function genSet(ex) {
  const s = { weight: ex.tracking === 'distance' ? pick([0, 1, 2.5, 3.1, 5]) : ex.tracking === 'duration' ? pick([0, 30, 45, 60, 90, 125]) : num(),
    reps: ex.tracking === 'distance' ? pick([0, 9, 21.5, 30, 45]) : ex.tracking === 'duration' ? 0 : reps(), done: maybe(0.8) };
  if (maybe(0.2)) { s.pw = num(); s.pr = reps(); }
  if (maybe(0.3)) s.single = maybe();
  return s;
}
function genEx() {
  const b = pick(EX), e = { exId: b.exId, name: b.name, muscle: 'x', equip: b.equip, assist: !!b.assist, tracking: b.tracking, imgUrl: maybe(0.1) ? 'data:image/jpeg;base64,AAA' : maybe() ? 'https://x/y.jpg' : null, sets: [] };
  if (maybe(0.2)) e.bwMode = pick(['body', 'added', 'assist']);
  const n = 1 + Math.floor(rnd() * 5); for (let i = 0; i < n; i++) e.sets.push(genSet(e));
  return e;
}
const N = +(process.argv[2] || 300), cases = [];
for (let i = 0; i < N; i++) {
  const hist = [], nw = 1 + Math.floor(rnd() * 14);
  for (let j = 0; j < nw; j++) {
    const imp = maybe(0.15), w = { id: imp ? 'w17000000000' + j + '_' + j : (maybe(0.2) ? 1794000000000 + j : 'w' + (1794000000000 + i * 100 + j)), name: 'W' + j,
      date: maybe(0.05) ? 'bad' : new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 120), Math.floor(rnd() * 24))).toISOString(), exercises: [] };
    if (maybe(0.5)) w.prRule = 2;
    const ne = Math.floor(rnd() * 5); for (let k = 0; k < ne; k++) w.exercises.push(genEx());
    hist.push(w);
  }
  const bw = maybe(0.8) ? pick([70, 81.6, 95.25]) : 0;
  for (const k of Object.keys(store)) delete store[k];
  store.jk_hist = JSON.stringify(hist); if (bw) store.jk_bw = JSON.stringify(bw);
  ctx._prMemo = null; vm.runInContext('_prMemo=null', ctx);
  const m = ctx.__rp(), expected = {};
  for (const [id, e] of m) expected[String(id)] = { list: e.list.map(p => [p.exId, p.ei, p.si, p.weight, p.reps]), sug: e.sug.map(p => [p.exId, p.ei, p.si, p.weight, p.reps]) };
  cases.push({ name: 'case' + i, hist, bw, expected });
}
fs.writeFileSync(path.join(here, 'prreplay-fixtures.json'), JSON.stringify(cases));
console.log('node replayed', cases.length, 'histories');
