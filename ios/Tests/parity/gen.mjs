// Parity fixtures for the Swift merge port (ios/Jacked/Data/BackupMerge.swift).
// Pulls the REAL mergeBackup() and its helpers out of jacked-pwa/index.html (no copy), runs
// hand-written cases plus seeded random cloud/local pairs through it, and writes
// fixtures.json = [{name, cloud, local, pending, expected}]. run.sh feeds the same inputs to
// the Swift port and compares key-order-insensitively.
//   TZ=America/Denver node gen.mjs [count]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../../../jacked-pwa/index.html'), 'utf8');

function extract(name) {
  const fn = html.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
  if (fn >= 0) {   // brace-match the body
    let i = html.indexOf('{', html.indexOf(')', fn)), depth = 0;
    for (; i < html.length; i++) { const c = html[i]; if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
    return html.slice(fn, i + 1);
  }
  const m = html.match(new RegExp(`^const ${name}\\s*=.*$`, 'm'));
  if (!m) throw new Error('not found: ' + name);
  return m[0];
}
const names = ['e1rm', 'prE1rm', 'histInsert', 'mileEquiv', 'SUG_EPS', 'sugStands', 'pruneSug', 'dropPreReset', '_prDate',
  'mergePRReset', 'prOkAfterRepair', 'prHeavier', 'prImpliesMore', 'mergePRs', 'mergePRRepair', '_chT', 'chRepairedWinner',
  'mergeHoldPRs', 'mergeCardioPRs', 'EXNOTES_PENDING_KEY', 'getExNotesPending', 'markExNotePending', 'EXNOTES_BOOT_KEY',
  'bootstrapExNotesPending', 'mergeExNotes', 'EMPTY_LOCAL_YIELDS', 'isEmptyish', 'mergeBackup', 'mergeBWlog'];
const src = names.map(extract).join('\n');
const store = {};
const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } }, console };
vm.createContext(ctx);
// The bootstrap is a one-time migration for PWA devices that had notes before the pending
// rule shipped; the iPhone app starts from the cloud copy, so mark it as already done.
vm.runInContext(src + '\nlocalStorage.setItem(EXNOTES_BOOT_KEY,"1");\nglobalThis.__merge=mergeBackup;', ctx);
const merge = (c, l, p) => JSON.parse(JSON.stringify(ctx.__merge(JSON.parse(JSON.stringify(c)), JSON.parse(JSON.stringify(l)), p)));

// ---- seeded random generator
let seed = 20261107; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)], maybe = (p = 0.5) => rnd() < p;
const dates = ['2026-09-01T18:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-02T07:30:15.250Z', '2026-10-20T12:00:00+00:00',
  '2026-10-20T05:00:00-07:00', '2026-11-05', '2026-11-05T18:00', '2026-08-08T23:59:59Z', 'not a date', '', '2026-11-06T01:02:03.4Z'];
const exIds = ['bench', 'squat', 'run', 'plank', 'row'];
const wid = () => pick([1, 2, 3, 4, 5, '6', '7', 'w8', 'w9', 10]);
const workout = () => { const w = { id: wid(), date: pick(dates), name: pick(['Push', 'Pull', 'Legs', 'Renamed']), sets: Math.floor(rnd() * 20) };
  if (maybe(0.3)) w.lrev = pick([0, 1, 2, '3', 5]); if (maybe(0.3)) w.hrSeries = [120, 130, { t: 1 }]; if (maybe(0.2)) w.extra = { nested: { keep: true } };
  if (maybe(0.5)) w.exercises = [{ exId: pick(exIds), sets: [{ weight: 100, reps: 5, done: true, x: 'k' }] }]; return w; };
const pr = () => { const r = { weight: pick([0, 60, 100, 100, 102.5, 140]), reps: pick([0, 1, 3, 5, 8]), date: pick(dates) };
  if (maybe(0.2)) r.repaired = pick(dates); if (maybe(0.1)) delete r.date; return r; };
const prMap = () => Object.fromEntries(exIds.filter(() => maybe(0.6)).map(e => [e, pr()]));
const cardio = () => { const r = { dist: pick([0, 1, 3.1, 5]), time: pick([0, 7, 25, 40]), date: pick(dates) };
  if (maybe(0.7)) { r.maxDist = pick([1, 3.1, 6.2]); r.maxDate = pick(dates); } if (maybe(0.2)) r.repaired = pick(dates); if (maybe(0.1)) delete r.date; return r; };
const hold = () => { const r = { sec: pick([0, 30, 60, 90]), date: pick(dates) }; if (maybe(0.2)) r.repaired = pick(dates); return r; };
const dmap = () => Object.fromEntries(exIds.filter(() => maybe(0.3)).map(e => [e, pick(dates)]));
const bwlog = () => Array.from({ length: Math.floor(rnd() * 4) }, () => pick([{ d: pick(['2026-11-01', '2026-11-02', '2026-11-03']), kg: pick([80, 81.5, '82', 0]) }, { d: 'bad', kg: 80 }, null]));
function side() {
  const b = {};
  if (maybe(0.9)) b.jk_hist = Array.from({ length: Math.floor(rnd() * 6) }, () => maybe(0.95) ? workout() : pick([null, 5, { name: 'no id' }]));
  if (maybe(0.4)) b.jk_deleted = Array.from({ length: 1 + Math.floor(rnd() * 2) }, wid);
  if (maybe(0.6)) b.jk_prs = prMap(); if (maybe(0.3)) b.jk_prSug = prMap();
  if (maybe(0.4)) b.jk_cardioPR = { run: cardio(), ...(maybe() ? { row: cardio() } : {}) };
  if (maybe(0.3)) b.jk_holdPR = { plank: hold() };
  if (maybe(0.25)) b.jk_prRepair = dmap(); if (maybe(0.25)) b.jk_prReset = dmap();
  if (maybe(0.4)) b.jk_exNotes = Object.fromEntries(exIds.filter(() => maybe(0.4)).map(e => [e, pick(['go deeper', '', 'elbows in'])]));
  if (maybe(0.5)) b.jk_bwlog = bwlog(); if (maybe(0.5)) b.jk_bw = pick([80, 79]);
  for (const k of ['jk_cex', 'jk_routines', 'jk_friends']) if (maybe(0.4)) b[k] = maybe() ? [] : maybe() ? {} : [{ id: k + rnd().toFixed(3) }];
  if (maybe(0.6)) b.jk_settings = { wUnit: pick(['lb', 'kg']), restDefault: pick([60, 90]), future: 'x' };
  if (maybe(0.3)) b.jk_unknownFutureKey = { a: [1, 2, { b: null }] };
  if (maybe(0.3)) b.jk_prof = { name: pick(['A', 'B']), code: '@ios_dev_test' };
  return b;
}

const cases = [
  ['empty both', {}, {}, []],
  ['rename local wins on id clash', { jk_hist: [{ id: 1, name: 'Push', date: '2026-11-01T18:00:00.000Z', hrSeries: [1] }] }, { jk_hist: [{ id: 1, name: 'Push Renamed', date: '2026-11-01T18:00:00.000Z' }] }, []],
  ['cloud higher lrev beats local', { jk_hist: [{ id: 1, name: 'A', lrev: 2 }] }, { jk_hist: [{ id: 1, name: 'B', lrev: 1 }] }, []],
  ['cloud-only workout inserted by date', { jk_hist: [{ id: 'c', date: '2026-11-02T10:00:00.000Z' }] }, { jk_hist: [{ id: 'a', date: '2026-11-01T10:00:00.000Z' }, { id: 'b', date: '2026-11-03T10:00:00.000Z' }] }, []],
  ['tombstone on cloud removes local copy', { jk_deleted: [2] }, { jk_hist: [{ id: 1 }, { id: 2 }] }, []],
  ['number id vs string id are different', { jk_hist: [{ id: '1', n: 'c' }] }, { jk_hist: [{ id: 1, n: 'l' }] , jk_deleted: ['1'] }, []],
  ['empty local routines yield to cloud', { jk_routines: [{ id: 'r1' }], jk_cex: { x: 1 } }, { jk_routines: [], jk_cex: {} }, []],
  ['notes: pending overlay and delete', { jk_exNotes: { bench: 'cloud', squat: 'cloud2' } }, { jk_exNotes: { bench: 'local', row: 'new' } }, ['bench', 'squat']],
  ['notes: nothing pending follows cloud', { jk_exNotes: { bench: 'watch note' } }, { jk_exNotes: { bench: 'old phone' } }, []],
  ['PR heavier wins, never downgrade', { jk_prs: { bench: { weight: 100, reps: 5, date: '2026-09-01T00:00:00.000Z' } } }, { jk_prs: { bench: { weight: 90, reps: 10, date: '2026-10-01T00:00:00.000Z' } } }, []],
  ['PR repair drops stale heavier', { jk_prs: { bench: { weight: 147, reps: 1, date: '2026-09-01T00:00:00.000Z' } }, jk_prRepair: { bench: '2026-10-01T00:00:00.000Z' } }, { jk_prs: { bench: { weight: 100, reps: 1, date: '2026-09-02T00:00:00.000Z', repaired: '2026-10-01T00:00:00.000Z' } } }, []],
  ['PR reset drops pre-reset records', { jk_prs: { bench: { weight: 200, reps: 1, date: '2026-09-01T00:00:00.000Z' } } }, { jk_prs: { bench: { weight: 100, reps: 1, date: '2026-10-05T00:00:00.000Z' } }, jk_prReset: { bench: '2026-10-01T00:00:00.000Z' } }, []],
  ['bodyweight log union, jk_bw derived', { jk_bwlog: [{ d: '2026-11-03', kg: 81 }], jk_bw: 81 }, { jk_bwlog: [{ d: '2026-11-01', kg: 80 }], jk_bw: 80 }, []],
  ['unknown keys pass through', { jk_badges: { a: 1 }, jk_new: [1, { deep: { x: null } }] }, { jk_settings: { wUnit: 'kg', zzz: 1 } }, []],
];
const N = Number(process.argv[2] || 400);
for (let i = 0; i < N; i++) cases.push([`fuzz ${i}`, side(), side(), exIds.filter(() => maybe(0.2))]);
const out = cases.map(([name, cloud, local, pending]) => ({ name, cloud, local, pending, expected: merge(cloud, local, pending) }));
fs.writeFileSync(path.join(here, 'fixtures.json'), JSON.stringify(out));
console.log(`wrote ${out.length} cases (${src.length} chars of index.html code)`);
