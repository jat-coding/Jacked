// Routines with no section (or in a legacy "Unsorted" section) are grouped by muscle group,
// same rule as iOS RoutineMath.sections/groupLabel (2026-11-17 parity decision).
// Run: PW=<node_modules/playwright> node tests/e2e/routine-groups.mjs
import { startServer, stopServer, launch, close, phone, check, results } from './harness.mjs';
const SHOTS = process.env.SHOTS || '/tmp/jk16/shots';
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip', SQUAT = 'Barbell_Squat', PULL = 'Pullups';
const seed = {
  routineSections: [{ id: 's1', name: 'Unsorted', order: null }, { id: 's2', name: 'My Split', order: null }, { id: 's3', name: 'Chest', order: null }],
  routines: [
    { id: 'rA', name: 'A Bench Only', desc: '', exercises: [BENCH, BENCH], sectionId: 's1' },
    { id: 'rB', name: 'B Squat Only', desc: '', exercises: [SQUAT], sectionId: 's1' },
    { id: 'rC', name: 'C Pullups', desc: '', exercises: [PULL], sectionId: 'gone' },
    { id: 'rD', name: 'D Empty', desc: '', exercises: [] },
    { id: 'rE', name: 'E Mixed In Split', desc: '', exercises: [BENCH, SQUAT], sectionId: 's2' },
    { id: 'rF', name: 'F Tie', desc: '', exercises: [BENCH, SQUAT], sectionId: 's1' },
  ],
};
await startServer(); await launch();
const { page, ctx, errors } = await phone({ seed });
await page.waitForFunction(() => byId('Barbell_Squat').muscle && byId('Pullups').muscle, null, { timeout: 30000 });
await page.evaluate(() => { migrateRoutineSections(); sp('routines'); renderRoutines(); });
await page.waitForTimeout(300);
const blocks = await page.evaluate(() => [...document.querySelectorAll('#routinesList .rsec')].map(s => ({
  name: s.querySelector('.blk-t').textContent.trim(), editable: s.querySelector('.blk-t').isContentEditable,
  routines: [...s.querySelectorAll('.rc, [onclick*="startRW"]')].length ? [...new Set([...s.innerHTML.matchAll(/startRW\('(r\w+)'\)/g)].map(m => m[1]))] : [] })));
console.log(JSON.stringify(blocks));
const find = n => blocks.find(b => b.name === n);
check('groups: no "Unsorted" block', !find('Unsorted'));
check('groups: no "Unfiled" block', !find('Unfiled'));
check('groups: bench-only routine in Unsorted joins the existing Chest section', find('Chest')?.routines.includes('rA'));
check('groups: tie (bench+squat) files under Chest, first group in order', find('Chest')?.routines.includes('rF'));
check('groups: squat-only routine in Unsorted shows under Legs', find('Legs')?.routines.includes('rB'));
check('groups: Legs block made for it is read-only (no saved section yet)', find('Legs') && !find('Legs').editable);
check('groups: routine whose section vanished files under Back', find('Back')?.routines.includes('rC'));
check('groups: routine with no exercises files under Full Body', find('Full Body')?.routines.includes('rD'));
check('groups: routine in a real section stays put', find('My Split')?.routines.includes('rE') && find('My Split').editable);
const sug = await page.evaluate(() => [suggestSectionId({ exercises: ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Squat'] }), suggestSectionId({ exercises: [] })]
  .map(id => gRS().find(s => s.id === id).name));
check('groups: new routine auto-suggest: tie -> Chest, none -> Full Body', sug[0] === 'Chest' && sug[1] === 'Full Body', sug.join(','));
await page.screenshot({ path: SHOTS + '/routine-groups.png', fullPage: true });
// Collapse works on a read-only group block.
await page.locator('#routinesList .rsec[data-secid="auto:Legs"] .blk-head').click();
check('groups: read-only group block collapses', await page.evaluate(() => document.querySelector('#routinesList .rsec[data-secid="auto:Legs"]').classList.contains('collapsed')));
await page.evaluate(() => openRoutineOrder()); await page.waitForTimeout(200);
const ro = await page.evaluate(() => [...document.querySelectorAll('#routineOrderList .rosec-name')].map(e => e.textContent.trim()));
check('groups: Reorder popup hides the Unsorted section', !ro.includes('Unsorted'), ro.join(','));
await page.screenshot({ path: SHOTS + '/routine-groups-reorder.png' });
check('groups: no page errors', errors.length === 0, errors.join(' | '));
await ctx.close(); await close(); stopServer();
const bad = results.filter(r => !r.ok);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
