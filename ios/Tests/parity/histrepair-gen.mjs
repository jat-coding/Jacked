// Parity fixtures for Edit Workout / Delete Workout (ios/Jacked/Data/HistRepair.swift). Runs the PWA's REAL
// saveWE() (DOM stubbed: the name/date fields are plain objects) and commitHistRepair() with its helpers, pulled
// out of jacked-pwa/index.html, no copy, over seeded random accounts and random edits; and delW's four lines
// (a closure inside openWD, so not extractable) copied verbatim below. Writes histrepair-fixtures.json =
// [{name, raw, op, expected}] with expected = the blob keys the edit writes.
//   TZ=America/Denver node histrepair-gen.mjs [count]
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
const names = ['S', 'gBW', 'histClean', 'gH', 'gPR', 'gPRSug', 'gCardioPR', 'gHoldPR', 'isHold', 'isCardio', 'isWT', 'e1rm', 'prE1rm', 'mileEquiv', 'SUG_EPS', 'NOT_BW_IDS',
  'isBodyweightEx', 'bwMode', 'bwCapable', 'effWeight', 'SINGLE_DEFAULT_IDS', 'SINGLE_BOTH_IDS', 'DOUBLE_VOL_IDS', 'setSingle', 'IMPORTED_ID',
  'importBest', 'prBest', 'prWeightStep', 'sugStands', 'NO_PRS', 'prReplay', 'replayRecord', 'setRepairedPR', 'chHistBest',
  'setRepairedCardioPR', 'setRepairedHoldPR', 'chTouched', 'commitHistRepair', 'histInsert', 'volWeight', 'saveWE'];
const AT = '2026-11-07T15:30:00.000Z';
const store = {}, fields = { weName: { value: '' }, weDate: { value: '' } };
class FDate extends Date { constructor(...a) { if (a.length) super(...a); else super(AT); } static now() { return Date.parse(AT); } }
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  console: { ...console, info: () => {} }, shapeOk: () => true, storageFullWarn: () => {}, _prMemo: null, Date: FDate,
  document: { getElementById: id => fields[id] }, cm: () => {}, renderHome: () => {}, toast: () => {} };
vm.createContext(ctx);
vm.runInContext('var _prMemo=null, weId=null, weDraft=null;\n' + names.map(extract).join('\n') +
  `\nglobalThis.__save=(id,d)=>{ weId=id; weDraft=d; saveWE(); };
globalThis.__del=(id)=>{ const all=gH(), gone=all.find(h=>h.id===id), rest=all.filter(h=>h.id!==id), ch=gone?chTouched(gone,null):new Set();
  if(ch.size) commitHistRepair(rest,ch,new Date().toISOString()); else S.s('hist',rest);
  S.s('deleted',[...new Set([...(S.g('deleted')||[]), id])]); };`, ctx);
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

const KEYS = ['jk_hist', 'jk_prs', 'jk_prSug', 'jk_cardioPR', 'jk_holdPR', 'jk_prRepair', 'jk_deleted', 'jk_prReset', 'jk_bw'];
const N = +(process.argv[2] || 300), cases = [];
for (let i = 0; i < N; i++) {
  const hist = [], nw = 1 + Math.floor(rnd() * 10);
  for (let j = 0; j < nw; j++) {
    const imp = maybe(0.1), w = { id: imp ? 'w17000000000' + j + '_' + j : (maybe(0.15) ? 1794000000000 + j : 'w' + (1794000000000 + i * 100 + j)), name: 'W' + j,
      date: new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 120), Math.floor(rnd() * 24), Math.floor(rnd() * 60))).toISOString(), exercises: [] };
    if (maybe(0.5)) w.prRule = 2;
    if (maybe(0.3)) w.lrev = pick([1, 2, 5]);
    const ne = 1 + Math.floor(rnd() * 4); for (let k = 0; k < ne; k++) w.exercises.push(genEx());
    hist.push(w);
  }
  hist.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const k of Object.keys(store)) delete store[k];
  const bw = maybe(0.8) ? pick([70, 81.6, 95.25]) : 0;
  store.jk_hist = JSON.stringify(hist); if (bw) store.jk_bw = JSON.stringify(bw);
  ctx._prMemo = null; vm.runInContext('_prMemo=null', ctx);
  // Stored PR bookkeeping the way finish would have left it (from the replay), sometimes stale, so the repair has work.
  const rp = vm.runInContext('prReplay()', ctx), prs = {}, sug = {}, cardio = {}, hold = {};
  hist.forEach(w => { const e = rp.get(w.id); if (!e) return;
    if (maybe(0.7)) { w.prSets = e.list.map(({ exId, ei, si, weight, reps }) => ({ exId, ei, si, weight, reps })); w.prCount = w.prSets.length + (maybe(0.1) ? 1 : 0); }
    else if (maybe(0.5)) w.prCount = e.list.length;
    if (maybe(0.4)) w.sugSets = e.sug.map(({ exId, ei, si, weight, reps }) => ({ exId, ei, si, weight, reps }));
    e.list.forEach(p => { if (p.cardio) cardio[p.exId] = { dist: p.weight, time: p.reps, date: w.date, maxDist: p.weight, maxDate: w.date };
      else if (p.hold) hold[p.exId] = { sec: p.weight, date: w.date }; else prs[p.exId] = { weight: p.weight, reps: p.reps, date: w.date }; });
    e.sug.forEach(p => { sug[p.exId] = { weight: p.weight, reps: p.reps, date: w.date }; });
  });
  if (maybe(0.2)) prs['Barbell_Squat'] = { weight: 200, reps: 5, date: hist[0].date };
  store.jk_hist = JSON.stringify(hist); store.jk_prs = JSON.stringify(prs); store.jk_prSug = JSON.stringify(sug);
  if (maybe(0.8)) store.jk_cardioPR = JSON.stringify(cardio); if (maybe(0.8)) store.jk_holdPR = JSON.stringify(hold);
  if (maybe(0.15)) store.jk_prReset = JSON.stringify({ [pick(EX).exId]: new Date(Date.UTC(2026, 7, 15)).toISOString() });
  if (maybe(0.2)) store.jk_prRepair = JSON.stringify({ Barbell_Squat: pick(['2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) });
  if (maybe(0.2)) store.jk_deleted = JSON.stringify(['wgone']);
  const raw = {}; KEYS.forEach(k => { if (k in store) raw[k] = JSON.parse(store[k]); });
  const target = pick(hist), op = { kind: maybe(0.25) ? 'delete' : 'edit', id: target.id };
  ctx._prMemo = null; vm.runInContext('_prMemo=null', ctx);
  if (op.kind === 'edit') {
    const d = JSON.parse(JSON.stringify(target)), r = rnd();
    if (r < 0.15) { op.dayKey = '2026-' + String(7 + Math.floor(rnd() * 4)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0'); }
    else if (r < 0.25) op.dayKey = new Date(Date.parse(d.date)).toLocaleDateString('en-CA');   // same day: nothing moves
    const nE = Math.floor(rnd() * 3);
    for (let k = 0; k < nE; k++) { const ex = pick(d.exercises); if (!ex) break; const s = pick(ex.sets); if (!s) continue;
      const f = rnd(); if (f < 0.4) s.weight = num(); else if (f < 0.7) s.reps = reps(); else s.done = !s.done; }
    if (maybe(0.15) && d.exercises.length > 1) d.exercises.splice(Math.floor(rnd() * d.exercises.length), 1);
    if (maybe(0.1)) d.exercises[0].sets.push({ weight: 0, reps: 0, done: true });
    if (maybe(0.1)) d.exercises.push(genEx());
    op.name = maybe(0.3) ? '  Renamed ' + i + ' ' : '';
    op.draft = JSON.parse(JSON.stringify(d));
    fields.weName.value = op.name; fields.weDate.value = op.dayKey || '';
    ctx.__save(target.id, d);
  } else ctx.__del(target.id);
  const expected = {}; KEYS.forEach(k => { if (k in store) expected[k] = JSON.parse(store[k]); });
  cases.push({ name: 'case' + i, raw, op, expected });
}
fs.writeFileSync(path.join(here, 'histrepair-fixtures.json'), JSON.stringify(cases));
console.log('node ran', cases.length, 'edits/deletes');
