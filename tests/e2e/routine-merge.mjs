// Per-routine jk_routines merge (Mr. Roni 2026-11-18, WATCH_BRIDGE.md "Routines"): each routine carries updatedAt,
// newest wins per id, cloud-only/local-only kept, deletions remembered in jk_routinesDel, legacy (no updatedAt) safe.
// Also: every PWA write path (create / edit / delete / reorder / update-from-workout) stamps updatedAt.
import { phone, check } from './harness.mjs';

const R = (id, name, updatedAt, extra = {}) => ({ id, name, exercises: ['x'], ...(updatedAt === undefined ? {} : { updatedAt }), ...extra });
const names = m => (m.jk_routines || []).map(r => r.id + ':' + r.name).sort().join(',');

async function routineMergeRules() {
  const { page, ctx, errors } = await phone();
  const merge = (cloud, local) => page.evaluate(([c, l]) => mergeBackup(c, l, []), [cloud, local]);
  let m;
  m = await merge({ jk_routines: [R('r1', 'cloud', 200)] }, { jk_routines: [R('r1', 'local', 100)] });
  check('routineMerge: newer cloud wins', names(m) === 'r1:cloud', names(m));
  m = await merge({ jk_routines: [R('r1', 'cloud', 100)] }, { jk_routines: [R('r1', 'local', 200)] });
  check('routineMerge: newer local wins', names(m) === 'r1:local', names(m));
  m = await merge({ jk_routines: [R('r1', 'cloud', 100)] }, { jk_routines: [R('r1', 'local', 100)] });
  check('routineMerge: tie keeps local', names(m) === 'r1:local', names(m));
  m = await merge({ jk_routines: [R('w1', 'watch new', 5)] }, { jk_routines: [R('p1', 'phone new', 6)] });
  check('routineMerge: cloud-only routine kept AND local-only routine kept', names(m) === 'p1:phone new,w1:watch new', names(m));
  m = await merge({ jk_routines: [R('r1', 'x', 100)] }, { jk_routines: [], jk_routinesDel: { r1: 200 } });
  check('routineMerge: deletion not resurrected (local tombstone vs cloud copy)', names(m) === '' && m.jk_routinesDel.r1 === 200, JSON.stringify(m));
  m = await merge({ jk_routines: [R('r1', 'x', 100)], jk_routinesDel: { r1: 100 } }, { jk_routines: [] });
  check('routineMerge: deletion not resurrected (cloud tombstone, tie = deleted)', names(m) === '', JSON.stringify(m));
  m = await merge({ jk_routines: [R('r1', 'watch edit', 300)] }, { jk_routines: [], jk_routinesDel: { r1: 200 } });
  check('routineMerge: an edit NEWER than the deletion brings the routine back', names(m) === 'r1:watch edit', names(m));
  m = await merge({ jk_routinesDel: { r1: 200, r2: 50 } }, { jk_routinesDel: { r1: 100, r3: 9 } });
  check('routineMerge: tombstones unioned, latest wins', JSON.stringify(m.jk_routinesDel) === JSON.stringify({ r1: 200, r2: 50, r3: 9 }), JSON.stringify(m.jk_routinesDel));
  m = await merge({ jk_routines: [R('r1', 'cloud'), R('r2', 'c2')] }, { jk_routines: [R('r1', 'local'), R('r3', 'l3')] });
  check('routineMerge: legacy (no updatedAt) both sides: local wins, nothing lost', names(m) === 'r1:local,r2:c2,r3:l3', names(m));
  m = await merge({ jk_routines: [R('r1', 'cloud', 1)] }, { jk_routines: [R('r1', 'local')] });
  check('routineMerge: legacy local loses to a stamped cloud copy', names(m) === 'r1:cloud', names(m));
  m = await merge({ jk_routines: [R('r1', 'cloud')] }, { jk_routines: [R('r1', 'local', 1)] });
  check('routineMerge: stamped local beats legacy cloud', names(m) === 'r1:local', names(m));
  m = await merge({ jk_routines: [R('r1', 'legacy')], jk_routinesDel: { r1: 5 } }, { jk_routines: [R('r1', 'legacy')] });
  check('routineMerge: tombstone beats a legacy routine', names(m) === '', names(m));
  m = await merge({ jk_routines: [R('r1', 'cloud', 5)] }, { jk_routines: [] });
  check('routineMerge: empty local list (never deleted) yields to cloud', names(m) === 'r1:cloud', names(m));
  m = await merge({ jk_routines: [R('r1', 'c', 5, { watchField: { a: 1 } })] }, { jk_routines: [] });
  check('routineMerge: unknown fields on a watch routine survive verbatim', m.jk_routines[0].watchField.a === 1);
  m = await merge({ jk_routines: [null, 7, { name: 'no id' }, R('r1', 'ok', 1)] }, { jk_routines: [null, { name: 'no id local' }] });
  check('routineMerge: junk entries never crash', Array.isArray(m.jk_routines) && m.jk_routines.some(r => r && r.id === 'r1'));
  m = await merge({ jk_routines: {} }, { jk_routines: 'oops' });
  check('routineMerge: non-array garbage never crashes', m != null);
  check('routineMerge: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function routineWritesStamp() {
  const t0 = Date.now();
  const seed = { routines: [R('a', 'A'), R('b', 'B'), R('c', 'C')], routineSections: [{ id: 's1', name: 'S', order: null }] };
  seed.routines.forEach(r => (r.sectionId = 's1'));
  const { page, ctx, errors } = await phone({ seed });
  const rs = () => page.evaluate(() => JSON.parse(localStorage.getItem('jk_routines')));
  const del = () => page.evaluate(() => JSON.parse(localStorage.getItem('jk_routinesDel') || '{}'));
  // delete -> tombstone, and the next merge against a cloud that still has it does not bring it back
  await page.evaluate(() => { window.showConfirm = () => Promise.resolve(true); delR('a'); });
  await page.waitForTimeout(200);
  check('routineWrites: delete removes the routine and writes a tombstone', (await rs()).every(r => r.id !== 'a') && (await del()).a >= t0, JSON.stringify(await del()));
  const merged = await page.evaluate(() => mergeBackup({ jk_routines: [{ id: 'a', name: 'A', exercises: ['x'] }] }, collectBackup(), []));
  check('routineWrites: deleted routine does not return from a stale cloud copy', !merged.jk_routines.some(r => r.id === 'a'));
  // edit via saveR
  await page.evaluate(() => { editR('b'); document.getElementById('rName').value = 'B2'; saveR(); });
  await page.waitForTimeout(200);
  const b = (await rs()).find(r => r.id === 'b');
  check('routineWrites: editing stamps updatedAt', b && b.name === 'B2' && b.updatedAt >= t0, JSON.stringify(b));
  // create via saveR
  await page.evaluate(() => { openCR(); document.getElementById('rName').value = 'New'; saveR(); });
  await page.waitForTimeout(200);
  const n = (await rs()).find(r => r.name === 'New');
  check('routineWrites: creating stamps updatedAt', n && n.updatedAt >= t0, JSON.stringify(n));
  // update from workout
  await page.evaluate(() => updateRoutineFromWorkout('c', 'x,y'));
  const c = (await rs()).find(r => r.id === 'c');
  check('routineWrites: update-from-workout stamps updatedAt', c && c.exercises.length === 2 && c.updatedAt >= t0, JSON.stringify(c));
  // save as new routine from finished workout
  await page.evaluate(() => { window.showConfirm = () => Promise.resolve('Saved One'); saveAsNewRoutine('x,y'); });
  await page.waitForTimeout(200);
  const s1 = (await rs()).find(r => r.name === 'Saved One');
  check('routineWrites: save-as-new-routine stamps updatedAt', s1 && s1.updatedAt >= t0, JSON.stringify(s1));
  check('routineWrites: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const ROUTINE_MERGE_SUITES = [routineMergeRules, routineWritesStamp];
