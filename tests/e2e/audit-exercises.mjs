// Exercise categorization audit (Mr. Roni, 2026-09-27): loads the real app + the real exercise-db, and for
// EVERY library exercise (exercise-db + warm-ups + built-in machines) dumps how the app resolves it:
// muscle -> group -> filter chip, cardio flag, Suggested-today groups, strength group + factor, bodyweight
// handling, triceps press credit, which badge ladders its name can feed, and what the import guesser would say.
// Flags the classes of mistake the audit looks for. Not part of run.mjs; run on its own:
//   JK_PORT=8797 PW=<playwright> node tests/e2e/audit-exercises.mjs [out.md]
import fs from 'fs';
import { startServer, stopServer, launch, close, phone } from './harness.mjs';

const OUT = process.argv[2] || '/tmp/jacked-exercise-audit.md';
await startServer();
await launch();
let rows, chips, summary;
try {
  const { page, ctx, errors } = await phone({ seed: { prof: { name: 'T', username: '@t', code: '@t', sex: 'male' }, bw: 80 } });
  await page.evaluate(async () => { sp('exercises'); for (let i = 0; i < 200 && !dbLoaded; i++) await new Promise(r => setTimeout(r, 100)); });
  ({ rows, chips } = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#muscleChips .chip')].map(b => b.dataset.muscle);
    const inChip = (e, c) => c === 'warmup' ? (e.category || '').toLowerCase() === 'warmup' : c === 'cardio' ? isCardioCat(e) : (e.muscle || '').toLowerCase() === c;
    const rows = allEx().map(e => {
      const d = allDB.find(x => x.id === e.id);
      const log = { exId: e.id, name: e.name, muscle: e.muscle, equip: e.equip, tracking: e.tracking, assist: e.assist || false };
      const g = muscleGroup(e.muscle), sg = strGroup(log);
      const f = flatNm(e.name), nm = e.name.toLowerCase();
      const feeds = [];
      const key = exerciseBadgeKey(log); if (key) feeds.push(key);
      if (typeof liftClass === 'function') { const c = liftClass(log); if (c) feeds.push('1000lb:' + c); }
      else { if (nm.includes('bench press')) feeds.push('1000lb:bench'); else if (nm.includes('squat')) feeds.push('1000lb:squat'); else if (nm.includes('deadlift')) feeds.push('1000lb:dead'); }
      return {
        id: e.id, name: e.name, raw: d ? (d.primaryMuscles || [])[0] || '' : (e._w ? 'warm-up' : 'built-in'),
        sec: d ? (d.secondaryMuscles || []).join('/') : (e.secondary || []).join('/'),
        equip: (d && d.equipment) || e.equip || '', mech: (d && d.mechanic) || e.mechanic || '', cat: (d && d.category) || e.category || '',
        muscle: e.muscle, group: g, sug: SUGNAME[g] || '', chips: chips.filter(c => inChip(e, c)).join('/'),
        cardio: isCardioCat(e), exGroups: [...exGroups(log)].join('/'), strGroup: sg,
        factor: sg ? +exStrengthFactor(e.id, sg).toFixed(2) : '', triPress: pressCreditsTriceps(e.id, e.name, sg),
        bw: isBodyweightEx(log), bwCap: bwCapable(log), plainBW: isPlainBW(log), feeds: feeds.join(' '), bwScores: typeof strLoad === 'function' ? strLoad(log, { weight: 0, reps: 10 }) > 0 : bwCapable(log) || isBodyweightEx(log),
        guess: guessMuscle(e.name), guessGroup: muscleGroup(guessMuscle(e.name)) || (guessMuscle(e.name) === 'cardio' ? 'cardio' : ''),
        resolve: resolveExercise(d ? d.name : e.name),
      };
    });
    return { rows, chips };
  }));
  if (errors.length) console.log('page errors:', errors);
  await ctx.close();
} finally { await close(); stopServer(); }

// ---- flags ----
const flag = (r, why) => (r.flags = r.flags || []).push(why);
const CARDIO_NAME = /\b(run|running|jog|treadmill|bike|cycling|rowing machine|elliptical|stair|sprint|swim)\b/i;
const BW_NAME = /\b(push-?ups?|pull-?ups?|pullups|chin-?ups?|dips?|muscle.?up|inverted row|pistol)\b/i;
const ISO_NAME = /\b(curl|raise|fly|flye|flyes|kickback|extension|pushdown|crossover|shrug|pullover|pec deck)\b/i;
const COMP_NAME = /\b(press|squat|deadlift|row|pull-?up|chin-?up|dip|lunge|clean|snatch|thrust)\b/i;
const seen = new Map();
for (const r of rows) {
  if (!r.group && r.muscle !== 'cardio' && r.muscle !== 'full body') flag(r, 'unmapped group');
  if (!r.chips) flag(r, 'no filter chip');
  if (r.cardio && !CARDIO_NAME.test(r.name) && r.muscle !== 'cardio') flag(r, 'cardio false positive');
  if (!r.cardio && CARDIO_NAME.test(r.name)) flag(r, 'cardio name, not cardio');
  if (r.guessGroup && r.group && r.guessGroup !== r.group) flag(r, `import guess ${r.guess} (${r.guessGroup}) != ${r.group}`);
  if (r.guess === 'cardio') flag(r, 'import guess says cardio');
  if (/\b(bodyweight|body only)\b/i.test(r.equip) && !r.bw && !r.bwCap && !/weighted/i.test(r.name)) flag(r, 'body-only equipment treated as weighted');
  if (BW_NAME.test(r.name) && !r.bw && !r.bwCap && !/weighted|machine|assist|band|bar(bell)?|dumbbell|cable/i.test(r.name + ' ' + r.equip)) flag(r, 'bodyweight-looking name treated as weighted');
  if (r.mech === 'isolation' && COMP_NAME.test(r.name) && !ISO_NAME.test(r.name)) flag(r, 'isolation? name looks compound');
  if (r.mech === 'compound' && ISO_NAME.test(r.name) && !COMP_NAME.test(r.name)) flag(r, 'compound? name looks isolation');
  if (/\bassist/i.test(r.name) && /pullup|pushup/.test(r.feeds)) flag(r, 'assisted feeds a rep badge');
  if (/(split|lunge|pistol|single.?leg|one.?leg|step.?up|calf)/i.test(r.name) && /\bsquat\b|1000lb:squat/.test(r.feeds)) flag(r, 'unilateral/non-squat feeds Leg badge');
  if (/dumbbell|kettlebell/i.test(r.equip) && /1000lb/.test(r.feeds)) flag(r, 'per-hand weight feeds 1000lb');
  const k = r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen.has(k)) { flag(r, 'duplicate display name of ' + seen.get(k)); } else seen.set(k, r.id);
}
const flagged = rows.filter(r => r.flags);
const byFlag = {};
flagged.forEach(r => r.flags.forEach(f => { const k = f.replace(/ of .*| guess .*/, m => m.startsWith(' guess') ? ' guess mismatch' : ''); (byFlag[k] = byFlag[k] || []).push(r.name); }));
summary = Object.entries(byFlag).map(([k, v]) => `| ${k} | ${v.length} | ${v.slice(0, 8).join('; ')}${v.length > 8 ? ' ...' : ''} |`);

const cols = ['name', 'id', 'raw', 'sec', 'equip', 'mech', 'muscle', 'group', 'sug', 'chips', 'cardio', 'exGroups', 'strGroup', 'factor', 'triPress', 'bw', 'bwCap', 'plainBW', 'bwScores', 'feeds', 'guess', 'flags'];
const cell = v => Array.isArray(v) ? v.join('; ') : v === true ? 'Y' : v === false ? '' : String(v ?? '').replace(/\|/g, '/');
const md = [
  `# Jacked exercise categorization audit`, '',
  `Generated ${new Date().toISOString()} by tests/e2e/audit-exercises.mjs against the live exercise-db.`, '',
  `Library exercises audited: ${rows.length} (exercise-db ${rows.filter(r => !['warm-up', 'built-in'].includes(r.raw)).length}, warm-ups ${rows.filter(r => r.raw === 'warm-up').length}, built-in ${rows.filter(r => r.raw === 'built-in').length}). Filter chips: ${chips.join(', ')}.`, '',
  `## Flag summary`, '', '| flag | count | examples |', '|---|---|---|', ...summary, '',
  `## Every exercise`, '',
  `Columns: raw = exercise-db primary muscle; muscle = what the app stores; group = muscleGroup(); sug = Suggested-today label; chips = filter chips that show it; exGroups = groups Suggested-today credits; strGroup/factor = strength-ratio group and scale; triPress = counts toward triceps as a press; bw/bwCap/plainBW = bodyweight handling; bwScores = a plain bodyweight set scores body weight in the strength ratio; feeds = badge ladders its name can feed; guess = what the import guesser says from the name alone.`, '',
  '| ' + cols.join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|',
  ...rows.map(r => '| ' + cols.map(c => cell(r[c])).join(' | ') + ' |'),
];
fs.writeFileSync(OUT, md.join('\n') + '\n');
fs.writeFileSync(OUT.replace(/\.md$/, '.json'), JSON.stringify(rows, null, 1));
console.log(`audited ${rows.length}; flagged ${flagged.length}`);
console.log(['| flag | count | examples |', ...summary].join('\n'));
