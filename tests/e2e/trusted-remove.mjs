// Remove Trusted Programs from the Routines strip (Mr. Roni 2026-11-18). x on a card hides it, jk_hiddenCurated
// holds the program names (synced), the pick of the day skips hidden programs, "Restore removed programs (n)" brings them back.
// Run: PW=<node_modules/playwright> node tests/e2e/trusted-remove.mjs
import { startServer, stopServer, launch, close, phone, check, results } from './harness.mjs';
const SHOTS = process.env.SHOTS || '/tmp/trp/shots';
import fs from 'fs'; fs.mkdirSync(SHOTS, { recursive: true });
await startServer(); await launch();
const { page, ctx, errors } = await phone({ seed: {}, width: 390, height: 844 });
await page.evaluate(() => sp('routines'));
await page.waitForTimeout(400);
const N = await page.evaluate(() => CURATED.length);
const cards = () => page.locator('#curatedList .cur-card').count();
check('trp: every program has a card + x', (await cards()) === N && (await page.locator('#curatedList .cur-x').count()) === N);
check('trp: restore button hidden at start', !(await page.locator('#curatedRestore').isVisible()));
await page.screenshot({ path: SHOTS + '/trp-1-before.png' });
// Make today's pick come from program 0, then remove program 0: pick must move off it.
await page.evaluate(() => { const t = dayKey(new Date()); S.s('sugToday', { day: t, curated: { pi: 0, ri: 0, name: CURATED[0].routines[0].name, program: CURATED[0].name, source: CURATED[0].source } }); });
const name0 = await page.evaluate(() => CURATED[0].name);
await page.locator('#curatedList .cur-x').first().click();
check('trp: tap hides card immediately', (await cards()) === N - 1);
check('trp: stored in jk_hiddenCurated as names', await page.evaluate(n => JSON.stringify(JSON.parse(localStorage.getItem('jk_hiddenCurated'))) === JSON.stringify([n]), name0));
check('trp: restore button shows (1)', (await page.locator('#curatedRestore').innerText()) === 'Restore removed programs (1)');
const pick = await page.evaluate(() => todaysCuratedPick(dayKey(new Date())));
check('trp: cached pick from removed program is dropped', pick && pick.pi !== 0, JSON.stringify(pick));
// Many days of picks never land on a hidden program.
const bad = await page.evaluate(() => { let b = 0; for (let d = 1; d <= 60; d++) { localStorage.removeItem('jk_sugToday'); const p = todaysCuratedPick('2027-01-' + String(d % 28 + 1).padStart(2, '0') + (d > 28 ? '' : '')); if (!p || p.pi === 0) b++; } return b; });
check('trp: 60 picks never from hidden program', bad === 0, 'bad=' + bad);
// Survives a round trip through the backup bundle (unknown-to-nothing key: collectBackup -> mergeBackup -> restoreKeys).
const rt = await page.evaluate(() => { const b = collectBackup(); const m = mergeBackup({ jk_hiddenCurated: ['X'] }, b); return { inBackup: b.jk_hiddenCurated, merged: m.jk_hiddenCurated, shape: shapeOk('hiddenCurated', {}) }; });
check('trp: key in backup bundle', Array.isArray(rt.inBackup) && rt.inBackup[0] === name0, JSON.stringify(rt));
check('trp: merge keeps local list (not cloud)', rt.merged.length === 1 && rt.merged[0] === name0);
check('trp: wrong-shape value rejected', rt.shape === false);
// Remove all.
for (let i = 0; i < N - 1; i++) await page.locator('#curatedList .cur-x').first().click();
check('trp: all removed -> strip + title hidden', !(await page.locator('#curatedList').isVisible()) && !(await page.locator('#curatedHead').isVisible()));
check('trp: all removed -> restore (N) visible', (await page.locator('#curatedRestore').innerText()) === `Restore removed programs (${N})`);
check('trp: all hidden -> pick is null, no crash', await page.evaluate(() => { localStorage.removeItem('jk_sugToday'); return todaysCuratedPick('2027-02-01') === null; }));
await page.evaluate(() => renderSuggest());
await page.screenshot({ path: SHOTS + '/trp-2-all-removed.png' });
await page.locator('#curatedRestore').click();
check('trp: restore brings all back', (await cards()) === N && !(await page.locator('#curatedRestore').isVisible()));
check('trp: restore writes [] (not delete) so empty list wins merge', await page.evaluate(() => localStorage.getItem('jk_hiddenCurated') === '[]' && mergeBackup({ jk_hiddenCurated: ['X'] }, collectBackup()).jk_hiddenCurated.length === 0));
await page.locator('#curatedList .cur-x').nth(1).click();
await page.screenshot({ path: SHOTS + '/trp-3-one-removed.png' });
check('trp: no page errors', errors.length === 0, errors.join(' | '));
await ctx.close(); await close(); stopServer();
const badR = results.filter(r => !r.ok);
console.log(badR.length ? 'FAILED ' + badR.length : 'ALL PASSED ' + results.length);
process.exit(badR.length ? 1 : 0);
