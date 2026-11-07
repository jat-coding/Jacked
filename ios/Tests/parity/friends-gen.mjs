// Parity fixtures for the Swift Friends port (ios/Jacked/Data/FriendsMath.swift): runs the PWA's REAL
// yourStats / myActivity / monthStats / friendWorkoutSummary / monthOf / crownCodes (no copy) and builds the
// exact columns syncMe() writes to profiles, writes friends-fixtures.json. Derived from badges-gen.mjs.
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
const html = fs.readFileSync(path.join(here, '../../../jacked-pwa/index.html'), 'utf8');
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
const names = ['S', 'gH', 'histClean', 'gPR', 'gProf', 'gSet', 'gBW', 'gBWlog', 'gCEx', '_cexMemo', 'cexById', 'gRenameEx', 'exName', 'gExOverride',
  'exOverride', 'WARMUPS', 'MACHINES', 'RUNS', 'prettyDB', 'EQUIP_TAG', 'EQUIP_FIX', 'mapMuscle', 'TIMED_HOLDS', 'dbTracking', 'byId', 'dayKey',
  'isWT', 'isCardio', 'isHold', 'isPlainBW', 'bwMode', 'bwCapable', 'isBodyweightEx', 'NOT_BW_IDS', 'effWeight', 'e1rm', 'IMPORTED_ID',
  'topPRSet', 'MONTHS', '_pad2', 'recapData', 'muscleGroup', 'guessMuscle', 'logMuscle', 'logGroup', 'strGroup', 'MGROUPS', 'MGNAME',
  'CREDIT_SET_SHARE', 'CREDIT_REF', 'CREDIT_PAIR', 'LOWER', 'CREDIT_LIFTS', 'CREDIT_NAME', 'CREDIT_NAME_ONLY', 'CREDIT_NOT',
  'STR_EQUIP_FACTOR', 'STR_EQUIP_ALIAS', 'strEquip', 'exStrengthFactor', 'exCredits', 'muscleUsage', 'TIER_CUT', 'STRENGTH_STD',
  'STR_WINDOW_DAYS', 'STR_BEST_ONLY', 'STR_REF_ISOLATION', 'TRI_ISO_STD', 'TRI_ONE_ARM', 'TRI_COMPOUND', 'BW_IS_LOAD', 'strLoad',
  'ladderScore', 'strengthScore', 'badgeAgeFactor', 'ageFromBirthday', 'gAge', 'muscleStrengthRatio', 'creditStrength', 'triStrength',
  'musclePerf', 'EXCLUDED_CATS', 'MECH_FIX', '_EXID_RE', '_EXIMG_RE'];
for (const n of ["computeBadges", "bestWeekTotal", "bestStreak", "liftVariant", "BADGE_DB_BONUS", "LIFT_VARIANTS", "creditLb", "isStdEx", "badgeStdId", "BADGE_STD", "HEVY_BADGE_NAME", "BADGE_SMITH_IDS", "_stdByName", "badgeT", "benchLadder", "benchBasis", "thresholds_lb", "GL_BENCH", "BENCH_POINTS", "MCCULLOCH", "mccullochFactor", "BENCH_FALLBACK_LB", "stdLadder", "interpStd", "SQUAT_STD", "OHP_STD", "repLadder", "repInterp", "REP_STD_AGES", "PULLUP_STD", "PUSHUP_STD", "cardioLadder", "wmaMileFactor", "CARDIO_STD", "WMA_MILE", "benchTierOf", "liftVariantsOf", "tierOfLive", "tierOfLiveLow", "TIER_RANK", "lbTxt", "lbN", "uL", "wUnit", "ohpTierOf", "repTierOf", "repBadgeEx", "bwMode", "cardioBreakdown", "CARDIO_LEGS", "stdRun", "mileEquiv", "fmtClock", "MCOL", "yourStats", "myActivity", "monthStats", "monthDayStats", "monthBadgeCount", "earnedBadgeCount", "myBadgeList", "friendWorkoutSummary", "workoutDistance", "workoutPace", "pacePerMile", "ymKey", "monthBounds", "calcStreak", "monthOf", "crownCodes", "gCB"]) if (!names.includes(n)) names.push(n);
const store = {};
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  console, shapeOk: () => true, storageFullWarn: () => {}, friendSrc: () => globalThis.__FR || [], __NOW: 0, __RAWDB: null };
vm.createContext(ctx);
vm.runInContext(`const __RD=Date; Date=class extends __RD{ constructor(...a){ if(a.length===0) super(__NOW); else super(...a); } static now(){ return __NOW; } };
let allDB=[]; let dbLoaded=false;\nvar document={documentElement:{hasAttribute:()=>false,toggleAttribute(){}}};\n` + names.map(extract).join('\n') + `
globalThis.__loadDB=raw=>{ allDB=raw.filter(e=>{ const cat=(e.category||'').toLowerCase(); if(EXCLUDED_CATS.has(cat)) return false; if(!_EXID_RE.test(e.id||'')) return false; return true; })
  .map(e=>{ const fixed=MECH_FIX[e.id]?{...e,mechanic:MECH_FIX[e.id]}:e; const images=(Array.isArray(fixed.images)?fixed.images:[]).filter(im=>typeof im==='string'&&_EXIMG_RE.test(im)); return {...fixed,images}; }); return allDB.length; };
globalThis.__run=(friends)=>{
  const p=gProf(), s=yourStats(), act=myActivity();
  const pub={name:p.name||'Lifter', username:p.username||'', total_volume:Math.round(s.totalVolume), workouts:s.workouts, prs:s.prs,
    streak:s.streak, consistency:s.consistency, badges:s.badges, avatar_url:s.avatarUrl||'', data:{days:act.days, recent:act.recent, wd:act.wd, m:act.m, badgeList:act.badgeList}};
  const mo=friends.map(f=>{ const m=monthOf(f); return {v:m.v,w:m.w,p:m.p,pv:m.pv,st:m.st,c:m.c,b:m.b}; });
  const board=[{isYou:true,code:p.code,pmVol:monthStats(true).pv},...friends];
  return {pub, monthOf:mo, crown:[...crownCodes(board)].sort()};
};`, ctx);
const dbPath = process.argv[2]; if (!dbPath) throw new Error('usage: badges-gen.mjs <exercises.json> [count]');
const rawDB = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
console.log('allDB', ctx.__loadDB(rawDB));

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
  raw.jk_prof = { ...(raw.jk_prof || {}), code: '@me_' + i, username: maybe(0.8) ? '@me_' + i : undefined, name: maybe(0.8) ? 'Me ' + i : '' };
  const ymOf = off => { const x = new Date(now); const y = new Date(x.getFullYear(), x.getMonth() + off, 1); return y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0'); };
  const rows = [];
  for (let f = 0, nf = Math.floor(rnd() * 5); f < nf; f++) {
    const wd = [], nwd = Math.floor(rnd() * 8);
    for (let j = 0; j < nwd; j++) { const d = new Date(now - Math.floor(rnd() * 75 * 864e5)); wd.push({ name: 'F', date: maybe(0.05) ? 'bad' : d.toISOString(), vol: pick([0, 500, 1234, 8000, 20000]), sets: 3, ex: [] }); }
    const m = maybe(0.7) ? { ym: pick([ymOf(0), ymOf(0), ymOf(-1), ymOf(-2), '']), v: pick([0, 0, 5000, 12000, 40000]), w: 3, p: 2, pv: pick([0, 9000, 12000, 40000]), st: 2, c: 30, b: 1 } : {};
    const days = [...new Set(wd.filter(w => w.date !== 'bad').map(w => w.date.slice(0, 10)))];
    if (maybe(0.4)) days.push(ymOf(0) + '-01', ymOf(0) + '-02');
    rows.push({ code: '@fr_' + f, name: 'Friend ' + f, username: '@fr_' + f, total_volume: 1000, workouts: 4, prs: 1, streak: 1, consistency: 10, badges: 2,
      data: { days, recent: maybe(0.5) ? [{ name: 'R', date: new Date(now - 864e5 * Math.floor(rnd() * 40)).toISOString(), totalVolume: 10, sets: 1 }] : [], wd, m } });
  }
  const mk = pr => { const data = pr.data || {}; const m = data.m || {}; return { id: pr.code, code: pr.code, name: pr.name || pr.username || 'Lifter', username: pr.username || '',
    totalVolume: pr.total_volume || 0, workouts: pr.workouts || 0, prs: pr.prs || 0, streak: pr.streak || 0, consistency: pr.consistency || 0, badges: pr.badges || 0,
    days: data.days || [], recent: data.recent || [], wd: data.wd || [], badgeList: data.badgeList || [],
    mVol: m.v || 0, mWorkouts: m.w || 0, mPRs: m.p || 0, pmVol: m.pv || 0, mYm: m.ym || '', mStreak: m.st || 0, mCons: m.c || 0, mBadges: m.b || 0, pending: false }; };
  const friends = rows.map(mk);
  for (const k of Object.keys(store)) delete store[k];
  for (const [k, v] of Object.entries(raw)) store[k] = JSON.stringify(v);
  ctx._cexMemo = { raw: undefined, map: null };
  vm.runInContext('_cexMemo={raw:undefined,map:null}', ctx);
  ctx.__NOW = now;
  cases.push({ name: 'case' + i, now, raw, rows, expected: JSON.parse(JSON.stringify(ctx.__run(friends))) });
}
fs.writeFileSync(path.join(here, 'friends-fixtures.json'), JSON.stringify(cases));
console.log('node finished', cases.length, 'accounts');
