// The sliding nav pill (#navInd) must sit exactly over the active tab (2026-11-12: pill stuck over Home while Library
// was active). Checked after every tab switch and after rotate (landscape and back) at three iPhone sizes.
import { phone, check } from './harness.mjs';
import { now, SEED } from './nav-screens.mjs';

const VIEWPORTS = [['iPhone SE', 375, 667], ['iPhone 16', 393, 852], ['iPhone 16 Pro Max', 440, 956]];
const TABS = ['routines', 'exercises', 'home', 'metrics', 'leaderboard'];

function measure() {
  const i = document.getElementById('navInd').getBoundingClientRect();
  const a = document.querySelector('nav .nb.active');
  if (!a) return { err: 'no active tab' };
  const r = a.getBoundingClientRect();
  return { id: a.id, dl: Math.abs(i.left - r.left), dw: Math.abs(i.width - r.width), dt: Math.abs(i.top - r.top), dh: Math.abs(i.height - r.height),
    op: getComputedStyle(document.getElementById('navInd')).opacity };
}
async function aligned(page, label) {
  await page.waitForTimeout(600);   // let the .38s glide finish
  const m = await page.evaluate(measure);
  check(`navPill ${label}: pill over active tab`, !m.err && m.dl < 1.5 && m.dw < 1.5 && m.dt < 1.5 && m.dh < 1.5 && m.op === '1', JSON.stringify(m));
}
async function navPill() {
  for (const [name, w, h] of VIEWPORTS) {
    const { page, ctx, errors } = await phone({ width: w, height: h, seed: SEED, now });
    await page.waitForTimeout(300);
    await aligned(page, `[${name}] boot`);
    for (const t of [...TABS, 'exercises', 'home', 'exercises']) {
      await page.evaluate(t => sp(t), t);
      await aligned(page, `[${name}] after sp(${t})`);
      // rotate to landscape and back with this tab active
      await page.setViewportSize({ width: h, height: w });
      await aligned(page, `[${name}] ${t} rotated landscape`);
      await page.setViewportSize({ width: w, height: h });
      await aligned(page, `[${name}] ${t} rotated back`);
    }
    // nav box changes that fire neither sp() nor window resize (the root cause): hide/show nav, change its inset
    await page.evaluate(() => sp('exercises'));
    await page.evaluate(() => { const n = document.querySelector('nav'); n.style.display = 'none'; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { const n = document.querySelector('nav'); n.style.display = 'flex'; n.style.left = '40px'; n.style.right = '40px'; });
    await aligned(page, `[${name}] nav re-shown with new inset, no resize event`);
    check(`navPill [${name}]: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
export const NAV_PILL_SUITES = [navPill];
