// Parity fixtures for the Swift badge port (ios/Jacked/Data/BadgeMath.swift): runs the PWA's REAL
// computeBadges() and helpers (no copy), writes badges-fixtures.json. Derived from metrics-gen.mjs.
// Since 2026-11-16 (Mr. Roni): imported (Hevy CSV) workouts never count toward any badge, and a kg user's weight tier
// follows the whole kg the page shows. Every account here is also run with its imported workouts removed and must give
// the same badges (imports present but not counted).
//   BADGES_ACCOUNT=<raw.json> [JACKED_HTML=<index.html>] [BADGES_NOW=<iso>] node badges-gen.mjs <exercises.json>
//     prints one account's badges and exits (before/after impact check; JACKED_HTML points at another build of the web app).
// (metrics-gen header follows)
// Parity fixtures for the Swift Metrics port (ios/Jacked/Data/MetricsMath.swift).
// Runs the PWA's REAL stats functions (topPRSet, recapData, muscleUsage, exCredits, musclePerf and
// their helpers, pulled out of jacked-pwa/index.html, no copy) over seeded random accounts with the
// real exercise-db loaded the way loadDB() filters it, the clock pinned to NOW, and writes
// badges-fixtures.json = [{name, now, raw, expected}]. The card bodies themselves (cardOverview,
// cardSummary, cardLifetime) are HTML in the PWA, so their few lines of arithmetic are mirrored here.
//   TZ=America/Denver node metrics-gen.mjs <exercises.json> [count]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(process.env.JACKED_HTML || path.join(here, '../../../jacked-pwa/index.html'), 'utf8');
function extract(name) {
  const fn = html.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  if (fn >= 0) {
    let i = html.indexOf('{', html.indexOf(')', fn)), depth = 0;
    for (; i < html.length; i++) { const c = html[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
    return html.slice(fn, i + 1);
  }
  const at = html.search(new RegExp(`^(const|let) ${name}\\s*=`, 'm')); if (at < 0) throw new Error('not found: ' + name);
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
const OPTIONAL = new Set(['isImportedW', 'badgeHist', 'wReached', 'wTierOf', 'HEVY_BADGE_NAME', 'BADGE_SMITH_IDS', '_stdByName']);   // differ between builds (impact mode)
const names = ['S', 'gH', 'histClean', 'gPR', 'gProf', 'gSet', 'gBW', 'gBWlog', 'gCEx', '_cexMemo', 'cexById', 'gRenameEx', 'exName', 'gExOverride',
  'exOverride', 'WARMUPS', 'MACHINES', 'RUNS', 'prettyDB', 'EQUIP_TAG', 'EQUIP_FIX', 'mapMuscle', 'TIMED_HOLDS', 'dbTracking', 'byId', 'dayKey',
  'isWT', 'isCardio', 'isHold', 'isPlainBW', 'bwMode', 'bwCapable', 'isBodyweightEx', 'NOT_BW_IDS', 'effWeight', 'e1rm', 'IMPORTED_ID',
  'topPRSet', 'MONTHS', '_pad2', 'recapData', 'muscleGroup', 'guessMuscle', 'logMuscle', 'logGroup', 'strGroup', 'MGROUPS', 'MGNAME',
  'CREDIT_SET_SHARE', 'CREDIT_REF', 'CREDIT_PAIR', 'LOWER', 'CREDIT_LIFTS', 'CREDIT_NAME', 'CREDIT_NAME_ONLY', 'CREDIT_NOT',
  'STR_EQUIP_FACTOR', 'STR_EQUIP_ALIAS', 'strEquip', 'exStrengthFactor', 'exCredits', 'muscleUsage', 'TIER_CUT', 'STRENGTH_STD',
  'STR_WINDOW_DAYS', 'STR_BEST_ONLY', 'STR_REF_ISOLATION', 'TRI_ISO_STD', 'TRI_ONE_ARM', 'TRI_COMPOUND', 'BW_IS_LOAD', 'strLoad',
  'ladderScore', 'strengthScore', 'badgeAgeFactor', 'ageFromBirthday', 'gAge', 'muscleStrengthRatio', 'creditStrength', 'triStrength',
  'musclePerf', 'EXCLUDED_CATS', 'MECH_FIX', '_EXID_RE', '_EXIMG_RE'];
for (const n of ["computeBadges", "bestWeekTotal", "bestStreak", "liftVariant", "BADGE_DB_BONUS", "LIFT_VARIANTS", "creditLb", "isStdEx", "badgeStdId", "BADGE_STD", "isImportedW", "badgeHist", "wReached", "wTierOf", "badgeT", "benchLadder", "benchBasis", "thresholds_lb", "GL_BENCH", "BENCH_POINTS", "MCCULLOCH", "mccullochFactor", "BENCH_FALLBACK_LB", "stdLadder", "interpStd", "SQUAT_STD", "OHP_STD", "repLadder", "repInterp", "REP_STD_AGES", "PULLUP_STD", "PUSHUP_STD", "cardioLadder", "wmaMileFactor", "CARDIO_STD", "WMA_MILE", "benchTierOf", "liftVariantsOf", "tierOfLive", "tierOfLiveLow", "TIER_RANK", "lbTxt", "lbN", "uL", "wUnit", "ohpTierOf", "repTierOf", "repBadgeEx", "bwMode", "cardioBreakdown", "CARDIO_LEGS", "stdRun", "mileEquiv", "fmtClock", "MCOL", "resolveExercise", "normName", "allEx", "isCustomEx", "isCardioCat", "RESOLVE_ALIAS", "RESOLVE_SOFT", "guessMuscle", "impId"]) if (!names.includes(n)) names.push(n);
if (process.env.JACKED_HTML) names.push('HEVY_BADGE_NAME', 'BADGE_SMITH_IDS', '_stdByName');
const extractOpt = n => { try { return extract(n); } catch (e) { if (OPTIONAL.has(n)) return ''; throw e; } };
const store = {};
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  console, shapeOk: () => true, storageFullWarn: () => {}, crownCodes: () => new Set(), __NOW: 0, __RAWDB: null };
vm.createContext(ctx);
vm.runInContext(`const __RD=Date; Date=class extends __RD{ constructor(...a){ if(a.length===0) super(__NOW); else super(...a); } static now(){ return __NOW; } };
let allDB=[]; let dbLoaded=true;\nvar document={documentElement:{hasAttribute:()=>false,toggleAttribute(){}}};\n` + names.map(extractOpt).join('\n') + `
globalThis.__loadDB=raw=>{ allDB=raw.filter(e=>{ const cat=(e.category||'').toLowerCase(); if(EXCLUDED_CATS.has(cat)) return false; if(!_EXID_RE.test(e.id||'')) return false; return true; })
  .map(e=>{ const fixed=MECH_FIX[e.id]?{...e,mechanic:MECH_FIX[e.id]}:e; const images=(Array.isArray(fixed.images)?fixed.images:[]).filter(im=>typeof im==='string'&&_EXIMG_RE.test(im)); return {...fixed,images}; }); return allDB.length; };
globalThis.__run=()=>{
  const strip=x=>x==null?null:String(x).replace(/<[^>]*>/g,'');
  const list=computeBadges().map(b=>({name:b.name,earned:!!b.earned,tier:b.tier||null,curV:b.curV===undefined?null:b.curV,
    all:b.all?{v:b.all.v,tier:b.all.tier===undefined?'(none)':(b.all.tier||null)}:null,desc:strip(b.desc),detail:strip(b.detail||null),
    sections:(b.sections||[]).map(x=>({t:x.t,met:!!x.met,rows:x.rows.map(r=>r.map(String))})),
    lifts:(b.lifts||[]).map(l=>({key:l.key,tier:l.tier||null,disp:l.disp})),months:b.months||0,everYM:b.everYM||null}));
  return {list, mb:S.g('monthBadges')||{}, T:badgeT()};
};`, ctx);
const dbPath = process.argv[2]; if (!dbPath) throw new Error('usage: badges-gen.mjs <exercises.json> [count]');
const rawDB = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
console.log('allDB', ctx.__loadDB(rawDB));
const RESET = "_cexMemo={raw:undefined,map:null}; if(typeof _stdByName!=='undefined') _stdByName.clear()";
const IMPORTED = /^w\d+_\d+$/;
function runRaw(raw, now) {
  for (const k of Object.keys(store)) delete store[k];
  for (const [k, v] of Object.entries(raw)) store[k] = JSON.stringify(v);
  vm.runInContext(RESET, ctx); ctx.__NOW = now;
  return JSON.parse(JSON.stringify(ctx.__run()));
}
// Imports present but not counted: the same account without its imported workouts must give the same badges.
let noImpBad = 0;
function checkNoImports(name, raw, now, expected) {
  const hist = raw.jk_hist || []; if (!hist.some(w => w && IMPORTED.test(w.id || ''))) return;
  const e2 = runRaw({ ...raw, jk_hist: hist.filter(w => !(w && IMPORTED.test(w.id || ''))) }, now);
  if (JSON.stringify(e2) !== JSON.stringify(expected)) { noImpBad++; if (noImpBad <= 3) console.log('IMPORT COUNTED', name); }
}
if (process.env.BADGES_ACCOUNT) {   // impact mode: one account, print and exit
  const raw = JSON.parse(fs.readFileSync(process.env.BADGES_ACCOUNT, 'utf8')), now = +new Date(process.env.BADGES_NOW || Date.now());
  const r = runRaw(raw, now);
  for (const b of r.list) console.log((b.earned ? 'EARNED ' : '-      ') + b.name + (b.tier ? ' [' + b.tier + ']' : '') + ' | ' + b.desc);
  process.exit(0);
}

let seed = 20261108; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], maybe = (p = 0.5) => rnd() < p;
const dbIds = rawDB.filter(e => !['stretching', 'plyometrics', 'cardio', 'olympic weightlifting'].includes((e.category || '').toLowerCase())).map(e => e.id);
const NAMED = ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Squat', 'Barbell_Deadlift', 'Romanian_Deadlift', 'Pullups', 'Dips_-_Triceps_Version',
  'Triceps_Pushdown', 'Hammer_Curls', 'Seated_Cable_Rows', 'Leg_Press', 'Standing_Military_Press', 'Barbell_Hip_Thrust', 'Lying_Triceps_Press',
  'Close-Grip_Barbell_Bench_Press', 'Cable_Crunch', 'Push_Press', 'Wide-Grip_Lat_Pulldown', 'Front_Barbell_Squat', 'Dumbbell_Lunges', 'Plank',
  'Pushups', 'Dumbbell_Bench_Press', 'Smith_Machine_Bench_Press', 'Standing_Dumbbell_Press', 'Barbell_Full_Squat', 'Bench_Press_-_Powerlifting'].filter(id => dbIds.includes(id));
const BUILT = ['Running_Treadmill', 'bi_run_outdoor', 'bi_lateral_raise_machine', 'bi_hip_thrust_machine', 'bi_assisted_pullup_machine', 'bi_assisted_dip_machine', 'bi_run_outdoor', 'wu_back'];
const CUSTOM = [
  { id: 'cex_1', name: 'Landmine Press', muscle: 'shoulders', equip: 'barbell', tracking: 'weight_reps' },
  { id: 'cex_2', name: 'Kettlebell Swing Row', muscle: 'back', equip: 'kettlebell', tracking: 'weight_reps' },
  { id: 'cex_3', name: 'Weighted Dip Belt', muscle: 'triceps', equip: 'bodyweight', tracking: 'bodyweight_reps' },
  { id: 'cex_4', name: 'One Arm Cable Pushdown', muscle: 'triceps', equip: 'cable', tracking: 'weight_reps' },
];
const IMPORTS = [{ exId: 'imp_cable_crunch', name: 'Cable Crunch', muscle: 'cardio' }, { exId: 'imp_squat', name: 'Squat (Barbell)', muscle: '' },
  { exId: 'imp_run', name: 'Running', muscle: 'cardio', tracking: 'distance' }, { exId: '', name: 'Mystery Row', muscle: 'back' }];
const kg = () => pick([0, 0, 2.5, 5, 10, 20, 22.68, 40, 45.36, 60, 61.235, 80, 100, 102.06, 140, 180]);
function genEx() {
  const r = rnd(); let e;
  if (r < 0.45) { const id = maybe(0.6) ? pick(NAMED) : pick(dbIds); e = { exId: id, name: ctx.byId ? id : id, muscle: maybe(0.7) ? '' : pick(['chest', 'lats', 'quadriceps', 'abdominals', 'triceps', 'cardio']), tracking: id === 'Plank' ? 'duration' : 'weight_reps' }; }
  else if (r < 0.6) { const id = pick(BUILT); e = { exId: id, name: id.replace(/_/g, ' '), muscle: '', tracking: /run|Running/.test(id) ? 'distance' : 'weight_reps', assist: id.includes('assisted') }; }
  else if (r < 0.75) { const c = pick(CUSTOM); e = { exId: c.id, name: c.name, muscle: c.muscle, equip: c.equip, tracking: c.tracking }; }
  else { const c = pick(IMPORTS); e = { exId: c.exId || undefined, name: c.name, muscle: c.muscle, tracking: c.tracking || 'weight_reps' }; }
  if (maybe(0.3)) e.equip = pick(['barbell', 'dumbbell', 'body only', 'cable', 'machine', '']);
  if (maybe(0.15)) e.bwMode = pick(['body', 'added', 'assist']);
  if (maybe(0.1)) delete e.name;
  e.sets = []; const n = Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) e.sets.push({ weight: e.tracking === 'distance' ? pick([1, 3.1]) : kg(), reps: e.tracking === 'distance' ? pick([0, 6, 7.5, 9, 14, 20, 26]) : pick([0, 1, 1, 3, 5, 8, 10, 12, 15, 22, 30, 45]), done: maybe(0.75) });
  return e;
}
const N = +(process.argv[3] || 300), cases = [];
for (let i = 0; i < N; i++) {
  const now = Date.UTC(2026, 10, 7, 15, 0, 0) - Math.floor(rnd() * 40) * 864e5 - Math.floor(rnd() * 864e5);
  const hist = []; const nw = Math.floor(rnd() * 40);
  for (let j = 0; j < nw; j++) {
    const d = new Date(now - Math.floor(rnd() * 420 * 864e5));
    const w = { id: maybe(0.15) ? 'w1700000000000_' + j : 'w' + (+d), name: 'W', date: maybe(0.03) ? 'garbage' : d.toISOString(),
      duration: pick(['45:30', '62:00', '—', '', '0:00', '30:x', '12:05']), sets: Math.floor(rnd() * 25), totalVolume: Math.floor(rnd() * 20000), exercises: [] };
    if (maybe(0.6)) w.prCount = Math.floor(rnd() * 4);
    const ne = Math.floor(rnd() * 6); for (let k = 0; k < ne; k++) w.exercises.push(genEx());
    hist.push(w);
  }
  if (maybe(0.3)) { const L = 6 + Math.floor(rnd() * 4), end = now - Math.floor(rnd() * 60) * 864e5;
    for (let j = 0; j < L; j++) { const d = new Date(end - j * 864e5); hist.push({ id: 'w' + (+d), name: 'Run', date: d.toISOString(), duration: '30:00', sets: 3, totalVolume: 100, prCount: Math.floor(rnd() * 3), exercises: [genEx(), genEx()] }); } }
  hist.sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
  const raw = { jk_hist: hist };
  if (maybe(0.75)) raw.jk_bw = pick([55, 70, 81.6, 95.25, 120]);
  if (maybe(0.8)) raw.jk_prof = { name: 'T', sex: pick(['male', 'female', undefined]), birthday: pick(['1990-05-01', '2009-12-31', '1960-11-07', '1980-11-08', '', undefined]) };
  if (maybe(0.6)) raw.jk_prs = Object.fromEntries(NAMED.filter(() => maybe(0.3)).map(id => [id, { weight: 50, reps: 5 }]));
  if (maybe(0.7)) raw.jk_cex = CUSTOM;
  if (maybe(0.1)) raw.jk_exOverride = { Barbell_Squat: { muscle: 'glutes' } };
  if (maybe(0.1)) raw.jk_exRename = { Barbell_Squat: 'My Squat' };
  if (maybe(0.5)) raw.jk_settings = { wUnit: pick(['lb', 'kg']) };
  if (maybe(0.5)) { const dd = new Date(now), ym = k => { const x = new Date(dd.getFullYear(), dd.getMonth() + k, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
    raw.jk_monthBadges = {}; raw.jk_monthBadges[ym(-1)] = { group: pick(['chest', 'back', 'legs', 'core']), target: 5, done: maybe(), comeback: maybe() };
    if (maybe(0.4)) raw.jk_monthBadges[ym(0)] = { group: pick(['chest', 'triceps', 'biceps']), target: pick([4, 6, 10]), done: maybe(0.3) };
    if (maybe(0.3)) raw.jk_monthBadges._jackedMonths = [ym(-2)]; }
  for (const k of Object.keys(store)) delete store[k];
  for (const [k, v] of Object.entries(raw)) store[k] = JSON.stringify(v);
  ctx._cexMemo = { raw: undefined, map: null };
  vm.runInContext('_cexMemo={raw:undefined,map:null}', ctx);
  ctx.__NOW = now;
  const expected = JSON.parse(JSON.stringify(ctx.__run()));
  checkNoImports('case' + i, raw, now, expected);
  cases.push({ name: 'case' + i, now, raw, expected });
}

// Clock-change fixtures (Mr. Roni, 2026-11-10): PR-Maxing counts calendar days, so 7 PRs inside 7 calendar days earn it even when
// the window crosses a DST change (noon-to-noon is 6d+/-1h there). Transition days: Denver spring 03-08 / fall 11-01, London
// spring 03-29 / fall 10-25 (every zone sees all four; only its own matter). `want` is an ABSOLUTE expectation checked by
// badges-compare.py, since web and Swift shared the bug and agreed with each other. Run under each zone (badges-run.sh does).
for (const [label, m, d] of [['denver-spring', 2, 8], ['denver-fall', 10, 1], ['london-spring', 2, 29], ['london-fall', 9, 25]]) {
  for (const [gap, want] of [[6, true], [7, false]]) {   // days from first PR day to second: 6 = same 7-day window, 7 = just outside
    const a = new Date(2026, m, d - 1, 12), b = new Date(2026, m, d - 1 + gap, 12), now = +new Date(2026, m, d - 1 + gap + 2, 15);
    const mk = (dt, n, i) => ({ id: 'w' + (+dt), name: 'W', date: dt.toISOString(), duration: '45:00', sets: 3, totalVolume: 100, prCount: n, exercises: [] });
    const raw = { jk_hist: [mk(a, 3), mk(b, 4)] };
    for (const k of Object.keys(store)) delete store[k];
    for (const [k, v] of Object.entries(raw)) store[k] = JSON.stringify(v);
    vm.runInContext('_cexMemo={raw:undefined,map:null}', ctx); ctx.__NOW = now;
    cases.push({ name: `clock-${label}-gap${gap}`, now, raw, want, expected: JSON.parse(JSON.stringify(ctx.__run())) });
  }
}

// ---- Hevy imports (never counted, 2026-11-16) + tier-threshold fixtures (cases from artifacts achievements-audit bugs 2, 3, 4) ----
// `wants` = ABSOLUTE expectations [[badge, field, value]] checked on web AND ios by badges-compare.py (the web rulebook).
const KP = 2.20462, L = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const BASE = { jk_prof: { name: 'T', sex: 'male', birthday: '1990-05-01' }, jk_bw: 80, jk_settings: { wUnit: 'lb' } };
function addCase(name, nowIso, hist, raw = {}, wants) {
  const now = +new Date(nowIso); hist = hist.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const k of Object.keys(store)) delete store[k];
  const r = { ...BASE, ...raw, jk_hist: hist }; for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  for (const [k, v] of Object.entries(r)) store[k] = JSON.stringify(v);
  vm.runInContext(RESET, ctx); ctx.__NOW = now;
  const expected = JSON.parse(JSON.stringify(ctx.__run()));
  checkNoImports(name, r, now, expected);
  const c = { name, now, raw: r, expected }; if (wants) c.wants = wants; cases.push(c); return expected;
}
const badge = (e, n) => e.list.find(b => b.name === n);
const R = n => vm.runInContext(`resolveExercise(${JSON.stringify(n)})||impId(${JSON.stringify(n)})`, ctx);   // the id the CSV import stores
const impEx = (name, sets, extra = {}) => ({ exId: R(name), name, muscle: '', tracking: 'weight_reps', sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })), ...extra });
const IW = (exs, date = L(2026, 11, 7), j = 1) => ({ id: 'w1700000000000_' + j, name: 'Hevy', date, duration: '45:00', sets: 3, totalVolume: 100, exercises: exs });
const NOW8 = L(2026, 11, 8);
const EX = (exId, sets) => ({ exId, name: exId.replace(/_/g, ' '), muscle: '', tracking: 'weight_reps', sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })) });
const AW = exs => ({ id: 'w' + (+new Date(L(2026, 11, 7))), name: 'W', date: L(2026, 11, 7), duration: '45:00', sets: 3, totalVolume: 100, exercises: exs });
const EXI = { bench: 'Barbell_Bench_Press_-_Medium_Grip', ohp: 'Standing_Military_Press', squat: 'Barbell_Squat', dbBench: 'Dumbbell_Bench_Press', smith: 'Smith_Machine_Bench_Press' };
// (a) Hevy names, each as its own imported account: none of it counts, whatever the name or the stored id
const NOTHING = [['Bench-Maxing', 'tier', null], ['Shoulder-Maxing', 'tier', null], ['Leg-Maxing', 'tier', null], ['Pull-up-Maxing', 'tier', null], ['Push-up-Maxing', 'tier', null],
  ['Cardio-Maxing', 'tier', null], ['1000lb Club', 'earned', false], ['Variety-Maxing', 'desc', '0 / 100 different exercises logged'], ['PR-Maxing', 'earned', false], ['Consistency-Maxing', 'earned', false], ['Coward-Maxing', 'earned', false]];
const HEVY = [
  ['Pull Up (Assisted)', [[0, 25]]], ['Pull Up (Band)', [[0, 25]]],
  ['Pull Up', [[0, 25]]], ['Pull Up (Weighted)', [[10, 25]]], ['Pull Up (Bodyweight)', [[0, 25]]], ['Chin Up', [[0, 25]]], ['Band Assisted Pull Up', [[0, 25]]],
  ['Push Up', [[0, 40]]], ['Push Up (Knee)', [[0, 40]]], ['Knee Push Up', [[0, 40]]], ['Push Up (Weighted)', [[10, 40]]],
  ['Bench Press (Smith Machine)', [[100, 1]]], ['  bench  PRESS (smith machine) ', [[100, 1]]],
  ['Bench Press (Barbell)', [[100, 1]]], ['Bench Press (Dumbbell)', [[50, 1]]], ['Bench Press (Cable)', [[100, 1]]], ['Bench Press (Machine)', [[100, 1]]],
  ['Bench Press', [[100, 1]]], ['Incline Bench Press (Barbell)', [[100, 1]]], ['Single Arm Bench Press (Dumbbell)', [[50, 1]]], ['Chest Press (Machine)', [[100, 1]]],
  ['Overhead Press (Dumbbell)', [[40, 1]]], ['Overhead Press (Barbell)', [[60, 1]]], ['Overhead Press (Smith Machine)', [[60, 1]]], ['Overhead Press', [[60, 1]]],
  ['Single Arm Dumbbell Overhead Press', [[30, 1]]], ['One-Arm Overhead Press (Dumbbell)', [[30, 1]]], ['Alternating Dumbbell Press', [[30, 1]]],
  ['Standing Military Press (Dumbbell)', [[40, 1]]], ['Shoulder Press (Dumbbell)', [[40, 1]]], ['Seated Overhead Press (Barbell)', [[60, 1]]],
  ['Squat (Barbell)', [[120, 1]]], ['Squat (Machine)', [[120, 1]]], ['Squat (Smith Machine)', [[120, 1]]], ['Squat (Dumbbell)', [[60, 1]]], ['Squat (Band)', [[20, 1]]],
  ['Squat', [[120, 1]]], ['Full Squat', [[120, 1]]], ['Deadlift (Barbell)', [[150, 1]]], ['Deadlift (Trap Bar)', [[150, 1]]], ['Deadlift (Dumbbell)', [[60, 1]]], ['Deadlift', [[150, 1]]],
  ['Running', [[3.1, 28]]], ['Treadmill', [[1, 7]]], ['Running (Treadmill)', [[1, 7]]], ['Mystery Lift (Barbell)', [[100, 1]]], ['Décliné Bench Press', [[100, 1]]],
];
for (const [name, sets] of HEVY) {
  const run = /^(Running|Treadmill)/.test(name);
  addCase('hevy_' + name.trim().replace(/\W+/g, '_'), NOW8, [IW([impEx(name, sets, run ? { tracking: 'distance' } : {})])], {}, NOTHING);
}
// the same names with the same stored id inside a workout made in Jacked: counts, the stored id decides
for (const name of ['Pull Up (Assisted)', 'Bench Press (Smith Machine)', 'Overhead Press (Dumbbell)'])
  addCase('nothevy_' + name.replace(/\W+/g, '_'), NOW8, [{ ...IW([impEx(name, [[60, 12]])]), id: 'w' + (+new Date(L(2026, 11, 7))) }]);
// imported workout whose exercise has no name, or sits next to a same-named custom: still nothing
addCase('hevy_noname', NOW8, [IW([{ exId: 'Pullups', muscle: '', tracking: 'weight_reps', sets: [{ weight: 0, reps: 25, done: true }] }])], {}, NOTHING);
addCase('hevy_custom_same_name', NOW8, [IW([impEx('Pull Up', [[0, 12]]), impEx('Bench Press (Barbell)', [[100, 1]])])],
  { jk_cex: [{ id: 'cex_9', name: 'Pull Up', muscle: 'lats', equip: 'bodyweight', tracking: 'bodyweight_reps' }, { id: 'cex_10', name: 'Bench Press', muscle: 'chest', equip: 'barbell', tracking: 'weight_reps' }] }, NOTHING);
addCase('hevy_all_in_one_club', NOW8, [IW([impEx('Bench Press (Smith Machine)', [[160, 1]]), impEx('Squat (Barbell)', [[170, 1]]), impEx('Deadlift (Barbell)', [[190, 1]])])], {}, NOTHING);
// the same lifts by library id: counted in a workout made in Jacked, not counted in an imported one, and an import never adds to a Jacked workout
{ const big = () => [EX('Smith_Machine_Bench_Press', [[160, 1]]), EX('Barbell_Squat', [[170, 1]]), EX('Barbell_Deadlift', [[190, 1]]), EX('Pullups', [[0, 30]]), EX('Pushups', [[0, 60]]),
    EX('Standing_Military_Press', [[90, 1]]), { ...EX('bi_run_outdoor', [[1, 6]]), tracking: 'distance' }];
  const YES = ['Bench-Maxing', 'Shoulder-Maxing', 'Leg-Maxing', 'Pull-up-Maxing', 'Push-up-Maxing', 'Cardio-Maxing', '1000lb Club'].map(n => [n, 'earned', true]);
  addCase('imp_ids_native', NOW8, [AW(big())], {}, YES);
  addCase('imp_ids_imported', NOW8, [IW(big())], {}, NOTHING);
  addCase('imp_ids_mixed', NOW8, [AW([EX('Barbell_Bench_Press_-_Medium_Grip', [[40, 1]])]), IW(big())], {}, [['Bench-Maxing', 'tier', null], ['1000lb Club', 'earned', false], ['Pull-up-Maxing', 'tier', null], ['Variety-Maxing', 'desc', '1 / 100 different exercises logged']]);
  // PR-Maxing and Consistency-Maxing: 7 PRs / 7 days in a row count only from workouts made in Jacked
  const wk = imp => Array.from({ length: 7 }, (_, j) => { const d = new Date(2026, 10, 1 + j, 12);
    return { id: imp ? 'w1700000000000_' + j : 'w' + (+d), name: 'W', date: d.toISOString(), duration: '45:00', sets: 3, totalVolume: 100, prCount: 1, exercises: [EX('Leg_Press', [[100, 8]])] }; });
  addCase('imp_week_native', NOW8, wk(false), {}, [['PR-Maxing', 'earned', true], ['Consistency-Maxing', 'earned', true]]);
  addCase('imp_week_imported', NOW8, wk(true), {}, NOTHING);
  addCase('imp_week_half', NOW8, wk(false).slice(0, 4).concat(wk(true).slice(4)), {}, [['PR-Maxing', 'earned', false], ['Consistency-Maxing', 'earned', false]]);
}
// (b) random Hevy-style accounts: imported and app workouts mixed, names from the pool, stored id = what the import wrote
const POOL = HEVY.map(x => x[0]).concat(['Lat Pulldown (Cable)', 'Bicep Curl (Dumbbell)', 'Leg Press (Machine)', 'Triceps Pushdown', 'Romanian Deadlift (Barbell)',
  'Incline Bench Press (Dumbbell)', 'Seated Cable Row - V Grip (Cable)', 'Lateral Raise (Dumbbell)', 'Hip Thrust (Barbell)', 'Plank', 'Dip', 'Front Squat', 'Push Press']);
const stored = Object.fromEntries(POOL.map(n => [n, R(n)]));
for (let i = 0; i < +(process.env.PARITY_HEVY_N || 200); i++) {
  const now = Date.UTC(2026, 10, 7, 15, 0, 0) - Math.floor(rnd() * 40) * 864e5 - Math.floor(rnd() * 864e5);
  const hist = [], nw = 1 + Math.floor(rnd() * 14);
  for (let j = 0; j < nw; j++) {
    const d = new Date(now - Math.floor(rnd() * 200 * 864e5)), exs = [], ne = 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < ne; k++) {
      const name = pick(POOL), run = /^(Running|Treadmill)/.test(name), e = { exId: stored[name], name, muscle: '', tracking: run ? 'distance' : 'weight_reps', sets: [] };
      if (maybe(0.1)) e.bwMode = pick(['body', 'added', 'assist']);
      if (maybe(0.05)) e.assist = true;
      const n = 1 + Math.floor(rnd() * 4);
      for (let q = 0; q < n; q++) e.sets.push(run ? { weight: pick([1, 3.1]), reps: pick([0, 6, 7.5, 9, 14, 26]), done: maybe(0.85) }
        : { weight: maybe(0.5) ? Math.round(pick([45, 95, 135, 185, 215, 225, 300, 315, 350, 405]) / KP * 100) / 100 : kg(), reps: pick([0, 1, 1, 3, 5, 8, 12, 22, 45]), done: maybe(0.85) });
      exs.push(e);
    }
    hist.push({ id: maybe(0.75) ? 'w1700000000000_' + j : 'w' + (+d), name: 'W', date: d.toISOString(), duration: '45:30', sets: 5, totalVolume: 1000, prCount: Math.floor(rnd() * 3), exercises: exs });
  }
  addCase('hevyrand' + i, new Date(now).toISOString(), hist, { jk_bw: pick([55, 70, 81.6, 95.25, 120, undefined]),
    jk_prof: { name: 'T', sex: pick(['male', 'female', undefined]), birthday: pick(['1990-05-01', '1960-11-07', '', undefined]) }, jk_settings: maybe(0.6) ? { wUnit: pick(['lb', 'kg']) } : undefined });
}
// (c) tier thresholds. Imported (Hevy lb file) weights at every step: never a tier. App-typed lb weights: the tier the typed number names.
// kg user (2026-11-16): lifting exactly the whole kg the page shows for a rung reaches it; one kg less is the tier below. Asserted on web AND ios.
const tierFor = (lb, T) => lb >= T[2] ? 'gold' : lb >= T[1] ? 'silver' : lb >= T[0] ? 'bronze' : null;
const webLow = { hevy2dp: [], app: [], kg: [] };
for (let lb = 5; lb <= 1000; lb += 5) for (const mode of ['app', 'hevy']) {
  const w = mode === 'app' ? lb / KP : Math.round(lb / KP * 100) / 100;
  const e = mode === 'app' ? addCase(`thr_app_${lb}`, NOW8, [AW([EX(EXI.bench, [[w, 1]]), EX(EXI.ohp, [[w, 1]]), EX(EXI.squat, [[w, 1]])])])
    : addCase(`thr_hevy_${lb}`, NOW8, [IW([impEx('Bench Press (Barbell)', [[w, 1]]), impEx('Overhead Press (Barbell)', [[w, 1]]), impEx('Squat (Barbell)', [[w, 1]])])]);
  for (const [bn, k] of [['Bench-Maxing', 'bench'], ['Shoulder-Maxing', 'ohpFrac'], ['Leg-Maxing', 'squatFrac']]) {
    const T = e.T[k] || e.T[k.replace('Frac', '')], t = tierFor(lb, T), got = badge(e, bn).tier;
    if (mode === 'hevy' ? got !== null : t !== got) (mode === 'app' ? webLow.app : webLow.hevy2dp).push(`${bn} ${lb} lb: typed number names ${t}, web gives ${got}`);
  }
}
// every rung of several ladders (body weight / sex / age vary the rungs), typed exactly: lb user via Hevy 2dp, kg user at the shown whole kg
for (const [tag, prof] of [['m80', {}], ['f60', { jk_bw: 60, jk_prof: { name: 'T', sex: 'female', birthday: '1995-02-01' } }], ['m100', { jk_bw: 100 }], ['m70age50', { jk_bw: 70, jk_prof: { name: 'T', sex: 'male', birthday: '1976-01-01' } }],
  ['f75', { jk_bw: 75, jk_prof: { name: 'T', sex: 'female', birthday: '1985-06-01' } }], ['m90', { jk_bw: 90 }], ['m120', { jk_bw: 120 }]]) {
  const T = addCase(`thr_probe_${tag}`, NOW8, [], prof).T;
  for (const [bn, key, id, hevyName] of [['Bench-Maxing', 'bench', EXI.bench, 'Bench Press (Barbell)'], ['Shoulder-Maxing', 'ohp', EXI.ohp, 'Overhead Press (Barbell)'], ['Leg-Maxing', 'squat', EXI.squat, 'Squat (Barbell)']]) {
    const rungs = T[key] || T[key + 'Frac'];
    rungs.forEach((rungLb, i) => {
      const tierName = ['bronze', 'silver', 'gold'][i];
      const TN = ['bronze', 'silver', 'gold'], kgU = { ...prof, jk_settings: { wUnit: 'kg' } }, one = kgv => [AW([EX(id, [[kgv, 1]])])];
      addCase(`thr_rung_hevy_${tag}_${key}_${i}`, NOW8, [IW([impEx(hevyName, [[Math.round(rungLb / KP * 100) / 100, 1]])])], prof, [[bn, 'tier', null]]);
      const shownKg = Math.round(rungLb / KP);
      const e = addCase(`thr_rung_kg_${tag}_${key}_${i}`, NOW8, one(shownKg), kgU, [[bn, 'tier', tierName]]);
      if (badge(e, bn).tier !== tierName) webLow.kg.push(`${bn} ${tag} ${tierName} rung shows ${shownKg} kg (${rungLb} lb): lifting ${shownKg} kg gives ${badge(e, bn).tier}`);
      addCase(`thr_rung_kg_minus1_${tag}_${key}_${i}`, NOW8, one(shownKg - 1), kgU, [[bn, 'tier', i ? TN[i - 1] : null]]);
      addCase(`thr_rung_kg_plus1_${tag}_${key}_${i}`, NOW8, one(shownKg + 1), kgU, [[bn, 'tier', Math.round(rungLb / KP) + 1 >= Math.round((rungs[i + 1] || Infinity) / KP) ? TN[i + 1] : tierName]]);
      for (const d of [-0.6, -0.5, -0.4, 0.4, 0.5]) addCase(`thr_rung_kg_frac${d}_${tag}_${key}_${i}`, NOW8, one(shownKg + d), kgU);   // parity only: rounding to the shown kg
      addCase(`thr_rung_lbuser_kgw_${tag}_${key}_${i}`, NOW8, one(shownKg), prof);   // an lb user is compared exactly, as before
      addCase(`thr_rung_lbuser_exact_${tag}_${key}_${i}`, NOW8, one(rungLb / KP), prof);
    });
  }
  // dumbbell (+15%) and Smith (-15%) credited weights right at the bench rungs
  T.bench.forEach((rungLb, i) => { addCase(`thr_rung_db_${tag}_${i}`, NOW8, [AW([EX(EXI.dbBench, [[rungLb / 1.15 / KP, 1]])])], prof);
    addCase(`thr_rung_smith_${tag}_${i}`, NOW8, [AW([EX(EXI.smith, [[rungLb / 0.85 / KP, 1]])])], prof); });
}
// 1000lb Club at exactly 1000 from a Hevy lb file, and one below
addCase('thr_club_1000_hevy', NOW8, [IW([impEx('Bench Press (Barbell)', [[Math.round(300 / KP * 100) / 100, 1]]), impEx('Squat (Barbell)', [[Math.round(350 / KP * 100) / 100, 1]]), impEx('Deadlift (Barbell)', [[Math.round(350 / KP * 100) / 100, 1]])])], {}, [['1000lb Club', 'earned', false]]);
addCase('thr_club_1000_app', NOW8, [AW([EX(EXI.bench, [[300 / KP, 1]]), EX(EXI.squat, [[350 / KP, 1]]), EX('Barbell_Deadlift', [[350 / KP, 1]])])], {}, [['1000lb Club', 'earned', true]]);
addCase('thr_club_999_app', NOW8, [AW([EX(EXI.bench, [[300 / KP, 1]]), EX(EXI.squat, [[350 / KP, 1]]), EX('Barbell_Deadlift', [[349 / KP, 1]])])], {}, [['1000lb Club', 'earned', false]]);
fs.writeFileSync(path.join(here, 'badges-web-threshold-findings.json'), JSON.stringify(webLow, null, 1));
console.log('WEB threshold findings (web answer below the tier the typed number names): hevy 2dp', webLow.hevy2dp.length, '| app storage', webLow.app.length, '| kg shown rung', webLow.kg.length);
console.log('accounts whose imported workouts changed a badge:', noImpBad);
if (noImpBad || webLow.hevy2dp.length || webLow.app.length || webLow.kg.length) { console.error('WEB RULE BROKEN: imports counted', noImpBad, '| imported weight got a tier', webLow.hevy2dp.length, '| app lb', webLow.app.length, '| kg shown rung', webLow.kg.length); process.exitCode = 1; }
fs.writeFileSync(path.join(here, 'badges-fixtures.json'), JSON.stringify(cases));
console.log('node finished', cases.length, 'accounts');
