// Compound-credit table (Mr. Roni, 2026-09-27: glutes read Untrained on a squat-heavy log). Loads the real app + the
// real exercise-db and dumps, for EVERY library exercise (exercise-db + warm-ups + built-in machines) plus a set of
// custom/imported names, which other groups it credits (exCredits) and at what factor, then flags odd ones.
// Not part of run.mjs; run on its own:
//   JK_PORT=8797 PW=<playwright> node tests/e2e/credit-table.mjs [out.md]
import fs from 'fs';
import { startServer, stopServer, launch, close, phone } from './harness.mjs';

const OUT = process.argv[2] || '/tmp/jacked-multi-muscle-credit.md';
// Names as a custom exercise or an import would carry them: no exercise-db secondaries, the name rules decide.
const CUSTOM = [['Back Squat', 'quadriceps', 'barbell'], ['Squat (Barbell)', 'quadriceps', 'barbell'], ['Deadlift (Barbell)', 'lower back', 'barbell'], ['Romanian Deadlift (Dumbbell)', 'hamstrings', 'dumbbell'],
  ['Walking Lunge (Dumbbell)', 'quadriceps', 'dumbbell'], ['Leg Press', 'quadriceps', 'machine'], ['Hip Thrust (Barbell)', 'glutes', 'barbell'], ['Step Up', 'quadriceps', 'dumbbell'],
  ['Bench Press (Barbell)', 'chest', 'barbell'], ['Incline Bench Press (Dumbbell)', 'chest', 'dumbbell'], ['Chest Press (Machine)', 'chest', 'machine'], ['Overhead Press (Barbell)', 'shoulders', 'barbell'],
  ['Shoulder Press (Dumbbell)', 'shoulders', 'dumbbell'], ['Triceps Dip', 'triceps', 'body only'], ['Close Grip Bench Press', 'triceps', 'barbell'], ['Bent Over Row (Barbell)', 'middle back', 'barbell'],
  ['Seated Cable Row', 'middle back', 'cable'], ['Lat Pulldown (Cable)', 'lats', 'cable'], ['Pull Up', 'lats', 'body only'], ['Chin Up', 'lats', 'body only'],
  ['Bicep Curl (Dumbbell)', 'biceps', 'dumbbell'], ['Chest Fly (Machine)', 'chest', 'machine'], ['Lateral Raise (Dumbbell)', 'shoulders', 'dumbbell'], ['Triceps Pushdown', 'triceps', 'cable'],
  ['Leg Extension (Machine)', 'quadriceps', 'machine'], ['Calf Press on Leg Press', 'calves', 'machine'], ['Shrug (Dumbbell)', 'traps', 'dumbbell']];
await startServer();
await launch();
let rows;
try {
  const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', sex: 'male' }, bw: 80 } });
  await page.evaluate(async () => { loadDB(); for (let i = 0; i < 200 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  rows = await page.evaluate(CUSTOM => {
    const cex = CUSTOM.map(([name, muscle, equip], i) => ({ id: 'cexCredit' + i, name, muscle, equip, tracking: 'weight_reps', category: 'strength', notes: '', images: [], _c: true }));
    S.s('cex', cex);
    const one = (e, kind) => {
      const d = allDB.find(x => x.id === e.id);
      const log = { exId: e.id, name: e.name, muscle: e.muscle, equip: e.equip, tracking: e.tracking, assist: e.assist || false };
      const cr = exCredits(log), src = strGroup(log);
      return { kind, id: e.id, name: e.name, sec: d ? (d.secondaryMuscles || []).join('/') : (e.secondary || []).join('/'), mech: (d && d.mechanic) || e.mechanic || '',
        equip: (d && d.equipment) || e.equip || '', src, srcF: src ? +exStrengthFactor(e.id, src).toFixed(2) : '',
        credits: Object.entries(cr).filter(([, c]) => c.f > 0).map(([g, c]) => `${g} ${c.f.toFixed(2)} (${c.why})`),
        stab: Object.entries(cr).filter(([, c]) => !(c.f > 0)).map(([g]) => g) };
    };
    return [...allEx().filter(e => !e._c || e._w || e._b).map(e => one(e, e._w ? 'warm-up' : e._b ? 'machine' : 'exercise-db')), ...cex.map(e => one(byId(e.id), 'custom'))];
  }, CUSTOM);
  if (errors.length) console.log('page errors:', errors);
  await ctx.close();
} finally { await close(); stopServer(); }

const flag = (r, why) => (r.flags = r.flags || []).push(why);
const COMP = /\b(press|squat|deadlift|row|pull-?up|chin-?up|dip|lunge|thrust|pulldown)\b/i;
for (const r of rows) {
  const has = g => r.credits.some(c => c.startsWith(g + ' '));
  const fs_ = r.credits.map(c => +c.split(' ')[1]);
  if (r.mech === 'isolation' && r.credits.length) flag(r, 'isolation lift credits');
  if (r.src === 'biceps' && (has('chest') || has('back'))) flag(r, 'curl credits chest/back');
  if (/squat|lunge|deadlift|leg press|step.?up/i.test(r.name) && !/calf|sissy/i.test(r.name) && r.src !== 'glutes' && !has('glutes')) flag(r, 'squat/hinge with no glute credit');
  if (/bench press|overhead press|shoulder press|military press|\bdips?\b/i.test(r.name) && r.src !== 'triceps' && !has('triceps')) flag(r, 'press with no triceps credit');
  if (/\brows?\b|pull-?ups?|pullups|chin-?ups?|pulldown/i.test(r.name) && r.src === 'back' && !has('biceps')) flag(r, 'pull with no biceps credit');
  if (fs_.some(f => f > 2)) flag(r, 'factor above 2 (per-hand dumbbell or light Strength Level lift)');
  if (COMP.test(r.name) && r.mech === 'compound' && !r.credits.length && r.src) flag(r, 'compound with no credit');
}
const count = {}; rows.forEach(r => (r.flags || []).forEach(f => { (count[f] = count[f] || []).push(r.name); }));
const byPair = {}; rows.forEach(r => r.credits.forEach(c => { const k = `${r.src} -> ${c.split(' ')[0]}`; byPair[k] = (byPair[k] || 0) + 1; }));
const cols = ['kind', 'name', 'id', 'src', 'srcF', 'credits', 'stab', 'mech', 'equip', 'sec', 'flags'];
const cell = v => Array.isArray(v) ? v.join('; ') : String(v ?? '').replace(/\|/g, '/');
const md = [
  '# Jacked compound-credit table', '',
  `Generated ${new Date().toISOString()} by tests/e2e/credit-table.mjs against the live exercise-db (${rows.filter(r => r.kind === 'exercise-db').length} exercise-db, ${rows.filter(r => r.kind === 'warm-up').length} warm-ups, ${rows.filter(r => r.kind === 'machine').length} machines, ${rows.filter(r => r.kind === 'custom').length} custom/import names).`, '',
  'src = the group the lift scores for directly; srcF = its equipment/isolation scale on that ladder; credits = other groups it credits, "group factor (why)": one lb of the lift is worth `factor` lb of that group\'s reference lift (glutes = hip thrust, triceps = close-grip bench, biceps = barbell curl, back = bent-over row, legs = squat, shoulders = overhead press, chest = bench). Dumbbell factors are per hand (the equipment x2 is folded in). stab = secondary groups it works as a stabiliser (no strength credit). A credit is also capped at the tier the lift earns on its own group.', '',
  '## Credits by group pair', '', '| pair | exercises |', '|---|---|', ...Object.entries(byPair).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '',
  '## Flags', '', '| flag | count | exercises |', '|---|---|---|', ...Object.entries(count).map(([k, v]) => `| ${k} | ${v.length} | ${v.slice(0, 40).join('; ')}${v.length > 40 ? ' ...' : ''} |`), '',
  '## Every exercise', '', '| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|',
  ...rows.map(r => '| ' + cols.map(c => cell(r[c])).join(' | ') + ' |'),
];
fs.writeFileSync(OUT, md.join('\n') + '\n');
console.log(`rows ${rows.length}`); console.log(Object.entries(byPair).map(([k, v]) => k + ' ' + v).join('\n'));
console.log(Object.entries(count).map(([k, v]) => `${k}: ${v.length}`).join('\n'));
