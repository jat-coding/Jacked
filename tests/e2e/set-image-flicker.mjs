// Mr. Roni 2026-11-15: tapping "+ Add Set" / "- Set" made the exercise thumbnail flicker. Cause: renderWS rebuilt
// the whole card via innerHTML, so the <img> was a new node that reloaded. The same node must survive.
import { phone, check } from './harness.mjs';
const PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
async function setImageFlicker() {
  const { page, ctx, errors } = await phone();
  await page.waitForFunction(() => dbLoaded, null, { timeout: 30000 });
  await page.evaluate(px => { startEmpty(); addExToWorkout('Pullups'); aw.exercises[0].imgUrl = px; renderWS(); }, PX);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const im = document.querySelector('#eb0 img.ebi'); window.__img = im; window.__vis = []; 
    new MutationObserver(m => m.forEach(r => window.__vis.push(r.attributeName))).observe(im, { attributes: true }); });
  const state = () => page.evaluate(() => { const im = document.querySelector('#eb0 img.ebi');
    return { same: im === window.__img, loaded: !!im && im.complete && im.naturalWidth > 0, shown: !!im && im.style.display !== 'none' && im.isConnected, sets: aw.exercises[0].sets.length }; });
  const before = (await state()).sets;
  for (const [label, fn] of [['add set', () => addSet(0)], ['add set again', () => addSet(0)], ['remove set', () => removeSet(0)]]) {
    await page.evaluate(fn); await page.waitForTimeout(150);
    const s = await state();
    check(`setImage [${label}]: same <img> node kept, loaded, visible`, s.same && s.loaded && s.shown, JSON.stringify(s));
  }
  check('setImage: set count actually changed (+2 -1)', (await state()).sets === before + 1);
  check('setImage: img attributes never mutated', (await page.evaluate(() => window.__vis.length)) === 0);
  check('setImage: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
export const SET_IMAGE_SUITES = [setImageFlicker];
