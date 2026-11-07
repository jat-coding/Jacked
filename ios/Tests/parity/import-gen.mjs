// Parity fixtures for Import (ios/Jacked/Data/ImportMath.swift). Runs the PWA's REAL importWorkoutCsv (with
// parseCSV, parseImportDate, resolveExercise, guessMuscle, allEx/byId over the real exercise library) and
// importJsonBackup / applyBundle, pulled out of jacked-pwa/index.html, no copy, over seeded random accounts and
// random Hevy / Strong / plain CSV files and backup files. Writes import-fixtures.json =
// [{name, kind, raw, text, unit, expected}] with expected = the jk_ blob after the import plus the toast.
//   TZ=America/Denver node import-gen.mjs [count] [exercises.json]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../../../jacked-pwa/index.html'), 'utf8');
const dbPath = process.argv[3] || '/tmp/exercises.json';
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
const names = ['KEY_SHAPE', 'shapeOk', 'S', 'histClean', 'gH', 'gPR', 'gPRSug', 'gCardioPR', 'gHoldPR', 'gCEx', 'gRenameEx', 'gExOverride',
  'exName', 'exOverride', 'cexById', 'byId', 'allEx', 'WARMUPS', 'MACHINES', 'RUNS', 'EQUIP_FIX', 'EQUIP_TAG', 'prettyDB', 'mapMuscle',
  'TIMED_HOLDS', 'dbTracking', 'EXPHOTO_KEY', 'gExPhotos', 'getExPhoto', 'IMG_BASE', 'imgUrl', 'histImgUrl', 'isCardioCat', 'guessMuscle',
  'normName', 'RESOLVE_ALIAS', 'RESOLVE_SOFT', 'resolveExercise', 'impId', 'isCardio', 'isHold', 'isWT', 'e1rm', 'prE1rm', 'mileEquiv',
  'SUG_EPS', 'sugStands', 'pruneSug', 'prBest', 'effWeight', 'isBodyweightEx', 'bwMode', 'bwCapable', 'NOT_BW_IDS', 'gBW', 'setSingle',
  'SINGLE_DEFAULT_IDS', 'SINGLE_BOTH_IDS', 'parseCSV', 'parseImportDate', 'importWorkoutCsv',
  'BACKEXT_REPAIR_FLAG', 'DIP_REPAIR_FLAG', 'RELABEL_FLAG', 'CH_REPAIR_FLAG', 'restoreKeys', 'applyBundle', 'importJsonBackup'];
let store = {}, toasts = [], unitAnswer = null;
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } },
  console: { ...console, info: () => {}, warn: () => {} }, storageFullWarn: () => {}, _prMemo: null, toast: (m) => { toasts.push(m); },
  loadDB: () => {}, syncMe: () => {}, cm: () => {}, renderHome: () => {}, setTimeout: () => {}, window: { location: { reload: () => {} } },
  APP_VERSION: 'test', showConfirm: () => Promise.resolve(true), askImportUnit: async () => unitAnswer };
vm.createContext(ctx);
// localStorage keys must be enumerable through Object.keys(localStorage) (collectBackup / applyBundle): proxy the store.
ctx.localStorage = new Proxy(ctx.localStorage, { ownKeys: () => Object.keys(store), getOwnPropertyDescriptor: (t, k) => (k in store ? { enumerable: true, configurable: true, value: store[k] } : Reflect.getOwnPropertyDescriptor(t, k)) });
const src = names.map(extract).join('\n').replace(/^async function askImportUnit[\s\S]*?^}/m, '');
vm.runInContext('var dbLoaded=true, dbLoading=false, allDB=[], _cexMemo={};\n' + src + '\nglobalThis.__setDB=d=>{allDB=d;};', ctx);
ctx.__setDB(JSON.parse(fs.readFileSync(dbPath, 'utf8')));

// ONE_RAW=<blob.json> ONE_CSV=<file> [ONE_UNIT=lb|kg] ONE_OUT=<out.json>: the PWA's result for one real file instead.
if (process.env.ONE_CSV) {
  const raw = JSON.parse(fs.readFileSync(process.env.ONE_RAW, 'utf8')); seedStore(raw); toasts = []; unitAnswer = process.env.ONE_UNIT || null;
  await ctx.importWorkoutCsv(fs.readFileSync(process.env.ONE_CSV, 'utf8'));
  fs.writeFileSync(process.env.ONE_OUT, JSON.stringify({ blob: blob(), toast: toasts.join(' | ') })); console.log(toasts.join(' | ')); process.exit(0);
}
let seed = 20261107; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], maybe = (p = 0.5) => rnd() < p, int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const EXN = ['Bench Press (Barbell)', 'Squat (Barbell)', 'Deadlift (Barbell)', 'Overhead Press (Barbell)', 'Bicep Curl (Dumbbell)', 'Hammer Curl (Dumbbell)',
  'Lat Pulldown (Cable)', 'Seated Cable Row - V Grip (Cable)', 'Pull Up', 'Chin Up', 'Triceps Pushdown', 'Skullcrusher (Barbell)', 'Leg Press (Machine)',
  'Leg Extension (Machine)', 'Lying Leg Curl (Machine)', 'Romanian Deadlift (Dumbbell)', 'RDL', 'Lateral Raise (Dumbbell)', 'Face Pull',
  'Incline Bench Press (Dumbbell)', 'Plank', 'Side Plank', 'Crunch', 'Hanging Leg Raise', 'Running', 'Treadmill', 'Walking', 'Cycling',
  'Hip Thrust (Barbell)', 'Calf Raise (Machine)', 'Shrug (Dumbbell)', 'Dips', 'Push Up', 'Bulgarian Split Squat', 'Décliné Bench Press',
  'Arnold Press (Dumbbell)', 'Preacher Curl (EZ Bar)', 'Cable Fly Crossovers', 'Some Weird Machine Thing', 'Assisted Pull Up (Machine)', 'Jump Rope'];
const TITLES = ['Push Day', 'Pull Day', 'Legs', 'Upper', 'Full Body', 'Morning run', ''];
const pad = n => String(n).padStart(2, '0'), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(d, style) {
  const Y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate(), h = d.getHours(), m = d.getMinutes();
  switch (style) {
    case 'hevy': return `${D} ${MON[M - 1]} ${Y}, ${pad(h)}:${pad(m)}`;
    case 'strong': return `${Y}-${pad(M)}-${pad(D)} ${pad(h)}:${pad(m)}:00`;
    case 'iso': return d.toISOString();
    case 'isolocal': return `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(m)}`;
    case 'us': return `${M}/${D}/${Y} ${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
    case 'eu': return `${D}.${M}.${Y}`;
    case 'slash2': return `${pad(M)}/${pad(D)}/${String(Y).slice(2)}`;
    case 'bare': return `${Y}-${pad(M)}-${pad(D)}`;
    case 'long': return `${MON[M - 1]} ${D}, ${Y} ${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'PM'.replace('P', 'A') : 'PM'}`;
    case 'ymdslash': return `${Y}/${pad(M)}/${pad(D)} ${pad(h)}:${pad(m)}`;
    case 'bad': return pick(['yesterday', '31/02/2024', '2024-13-01', '', 'n/a']);
  }
}
const csvq = v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function randCSV() {
  const fmtKind = pick(['hevy', 'hevy', 'strong', 'plain', 'plainunit']);
  const style = fmtKind === 'hevy' ? (maybe(0.85) ? 'hevy' : pick(['us', 'iso'])) : fmtKind === 'strong' ? 'strong'
    : pick(['iso', 'isolocal', 'us', 'eu', 'slash2', 'bare', 'long', 'ymdslash', 'hevy', 'strong']);
  const lb = maybe();
  const header = fmtKind === 'hevy' ? ['title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id', 'exercise_notes', 'set_index', 'set_type', lb ? 'weight_lbs' : 'weight_kg', 'reps', maybe() ? 'distance_km' : 'distance_miles', 'duration_seconds', 'rpe']
    : fmtKind === 'strong' ? ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE', 'Weight Unit']
      : fmtKind === 'plainunit' ? ['Date', 'Workout', 'Exercise', 'Weight (lbs)', 'Reps'] : ['date', 'workout', 'exercise', 'weight', 'reps'];
  const rows = [header.join(',')];
  const nW = int(1, 6);
  for (let wi = 0; wi < nW; wi++) {
    const d = new Date(2024, int(0, 11), int(1, 28), int(5, 21), int(0, 59));
    const startS = maybe(0.05) ? fmt(d, 'bad') : fmt(d, style), endS = fmt(new Date(+d + int(0, 5400) * 1000), style);
    const title = pick(TITLES);
    for (let e = 0, ne = int(1, 4); e < ne; e++) {
      const ex = pick(EXN), cardio = /Running|Treadmill|Walking|Cycling|Jump/.test(ex), hold = /Plank/.test(ex);
      for (let s = 0, ns = int(1, 4); s < ns; s++) {
        const w = cardio || hold ? '' : maybe(0.1) ? pick(['-5', 'abc', '']) : String(Math.round(rnd() * 300 * 4) / 4);
        const reps = cardio || hold ? '' : maybe(0.05) ? pick(['-2', '8.5', 'x']) : String(int(1, 15));
        const dist = cardio ? (Math.round(rnd() * 800) / 100).toString() : '', dur = cardio || hold ? String(int(20, 3600)) : '';
        const type = maybe(0.1) ? 'warmup' : maybe(0.1) ? 'dropset' : 'normal';
        let row;
        if (fmtKind === 'hevy') row = [title, startS, endS, '', ex, '', maybe(0.1) ? 'note, with "quotes"\nand newline' : '', s, type, w, reps, dist, dur, ''];
        else if (fmtKind === 'strong') row = [startS, title, '1h', ex, s + 1, w, reps, dist, dur, '', '', '', pick(['lbs', 'kg', ''])];
        else row = [startS, title, ex, w, reps];
        rows.push(row.map(csvq).join(','));
      }
    }
  }
  return { text: rows.join(maybe(0.3) ? '\r\n' : '\n') + (maybe() ? '\n' : ''), unit: fmtKind === 'plain' ? pick(['lb', 'kg', null]) : null };
}
function randRaw() {
  const raw = {}, hist = [];
  for (let i = 0, n = int(0, 5); i < n; i++) {
    const d = new Date(2024, int(0, 11), int(1, 28), 12);
    hist.push({ id: 'w' + (+d), name: pick(TITLES) || 'Workout', date: d.toISOString(), exercises: [{ exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Bench', tracking: 'weight_reps', sets: [{ weight: int(20, 120), reps: int(1, 10), done: true }] }], sets: 1, totalVolume: 100 });
  }
  hist.sort((a, b) => new Date(a.date) - new Date(b.date));
  raw.jk_hist = hist;
  if (maybe()) raw.jk_prs = { 'Barbell_Bench_Press_-_Medium_Grip': { weight: int(40, 140), reps: int(1, 8), date: '2024-01-01T12:00:00.000Z' } };
  if (maybe(0.3)) raw.jk_cardioPR = { bi_run_outdoor: { dist: 3, time: 27, date: '2024-01-01T12:00:00.000Z' } };
  if (maybe(0.3)) raw.jk_holdPR = { Plank: { sec: int(30, 200), date: '2024-01-01T12:00:00.000Z' } };
  if (maybe(0.3)) raw.jk_prSug = { 'Barbell_Bench_Press_-_Medium_Grip': { weight: 100, reps: 5 }, Barbell_Squat: { weight: 60, reps: 3 } };
  if (maybe(0.2)) raw.jk_cex = [{ id: 'cex1', name: 'Some Weird Machine Thing', muscle: 'chest', equip: 'machine', tracking: 'weight_reps' }];
  return raw;
}
function seedStore(raw) { store = {}; Object.keys(raw).forEach(k => { store[k] = JSON.stringify(raw[k]); }); }
function blob() { const o = {}; Object.keys(store).filter(k => k.startsWith('jk_') && !['jk_activeWorkout', 'jk_appVersion', 'jk_friendsCache'].includes(k)).forEach(k => { o[k] = JSON.parse(store[k]); }); return o; }

const N = +(process.argv[2] || 300), out = [];
// Date strings on their own, so a parser gap shows by name.
const DATES = ['15 Oct 2024, 18:05', '15 Oct 2024 18:05', 'Oct 15, 2024 6:05 PM', 'October 15, 2024', '2024-10-15 18:05:00', '2024-10-15T18:05:00',
  '2024-10-15T18:05:00Z', '2024-10-15T18:05:00.123+02:00', '2024/10/15 18:05', '2024/10/15', '15 October 2024', 'Oct 15 2024', '2024-10-15 18:05',
  '15-Oct-2024', 'garbage', '2024-10-15T18:05', '1729000000', '12 Oct 2024 10:00 pm', 'Oct 15, 2024, 6:05:12 PM', '2024-1-5', '2024-10-15 6:05 PM',
  '10/15/2024', '15/10/2024', '15.10.2024 18:05', '01/02/24', '2/30/2024', '2024-10-15', '9 Mar 2025, 01:30', '3 Nov 2024, 01:30', ' 7 Nov 2026, 08:00 '];
for (const s of DATES) for (const df of [false, true]) { const d = ctx.parseImportDate(s, df); out.push({ name: `date ${JSON.stringify(s)} df=${df}`, kind: 'date', text: s, dayFirst: df, expected: { ms: d ? +d : null } }); }
for (let c = 0; c < N; c++) {
  const raw = randRaw();
  if (c % 5 === 4) {   // a backup file
    const b = randRaw(); if (maybe(0.2)) b.jk_hist = { bad: 1 }; if (maybe(0.2)) b.jk_settings = JSON.stringify({ wUnit: 'kg' }); if (maybe(0.1)) b.jk_activeWorkout = { x: 1 };
    const text = maybe(0.1) ? '{bad json' : JSON.stringify(maybe() ? { _app: 'jacked', data: b } : maybe(0.1) ? { foo: 1 } : b);
    seedStore(raw); toasts = [];
    ctx.importJsonBackup(text.trim()); await new Promise(r => setImmediate(r));
    out.push({ name: `json #${c}`, kind: 'json', raw, text, unit: null, expected: { blob: blob(), toast: toasts.join(' | ') } });
    continue;
  }
  const { text, unit } = randCSV();
  seedStore(raw); toasts = []; unitAnswer = unit;
  await ctx.importWorkoutCsv(text);
  out.push({ name: `csv #${c}`, kind: 'csv', raw, text, unit, expected: { blob: blob(), toast: toasts.filter(t => t !== 'Reading workouts…').join(' | ') } });
}
fs.writeFileSync(path.join(here, 'import-fixtures.json'), JSON.stringify(out));
console.log(`node wrote ${out.length} import cases`);
