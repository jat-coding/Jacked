// iOS 26.1+ standalone viewport shortfall (WebKit bug 301994): when installed to the home
// screen, window.innerHeight is ~59px less than the real screen height, so anything anchored
// via 100vh / fixed bottom:0/inset:0 stops short of the real bottom and a bare strip of page
// background shows under it. A debug ruler build (0e7b929) confirmed on his real phone
// (IMG_0858) that even a plain position:fixed;bottom:0 line stops at the short, reported
// bottom, not the real one -- so EVERY bottom-anchored fixed element needs --standaloneGap,
// including ordinary bars like nav. (An earlier attempt at this, 3750df9, reasoned
// viewport-fit=cover alone should already fix plain bottom:Npx bars and removed their
// compensation; the ruler disproved that.) The head script measures the gap into
// --standaloneGap and the stylesheet lets every bottom-anchored fixed layer reach down by it.
// Real hardware can't be driven from here; this suite spoofs navigator.standalone plus a
// screen/innerHeight mismatch in Chromium and asserts the variable is set and consumed by the
// right elements. The spoofed screen stays in portrait terms (390 x 903) like iOS does.
import { phone, check } from './harness.mjs';

const GAP = 59;
const SCREEN = { w: 390, h: 844 + GAP };
const spoof = ({ standalone, w, h }) => {
  if (standalone) Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
  Object.defineProperty(screen, 'width', { get: () => w, configurable: true });
  Object.defineProperty(screen, 'height', { get: () => h, configurable: true });
};
const measure = page => page.evaluate(() => {
  const r = el => el.getBoundingClientRect();
  return {
    gap: getComputedStyle(document.documentElement).getPropertyValue('--standaloneGap').trim(),
    fn: typeof window.jkStandaloneGap === 'function' ? window.jkStandaloneGap() : null,
    ih: innerHeight, iw: innerWidth,
    body: r(document.body).height, root: r(document.getElementById('jkRoot')).height,
    nav: r(document.querySelector('nav')).bottom,
  };
});
const booted = page => page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex');

async function standaloneGap() {
  // 1) A browser tab (no navigator.standalone), same screen mismatch: must NOT be touched.
  const tab = await phone({});
  await tab.ctx.addInitScript(spoof, { standalone: false, ...SCREEN });
  await tab.page.reload(); await booted(tab.page);
  const t = await measure(tab.page);
  check('standalone gap: tab -> --standaloneGap stays 0px even with a taller screen', t.gap === '0px' && t.fn === 0, JSON.stringify(t));
  check('standalone gap: tab -> body and #jkRoot are exactly viewport-tall', t.body === t.ih && t.root === t.ih, JSON.stringify(t));
  check('standalone gap: tab -> nav sits 8px above the viewport bottom', Math.round(t.nav) === t.ih - 8, JSON.stringify(t));
  check('standalone gap: tab -> no page errors', tab.errors.length === 0, tab.errors.join(' | '));
  await tab.ctx.close();

  // 2) iOS standalone with the bug: screen 59px taller than innerHeight.
  const { page, ctx, errors } = await phone({});
  await ctx.addInitScript(spoof, { standalone: true, ...SCREEN });
  await page.reload(); await booted(page);
  const s = await measure(page);
  check('standalone gap: standalone -> --standaloneGap is 59px on <html>', s.gap === `${GAP}px` && s.fn === GAP, JSON.stringify(s));
  check('standalone gap: standalone -> body and #jkRoot reach the real screen bottom', s.body === s.ih + GAP && s.root === s.ih + GAP, JSON.stringify(s));
  check('standalone gap: standalone -> nav moved down by the gap (8px above the real bottom)', Math.round(s.nav) === s.ih + GAP - 8, JSON.stringify(s));
  // Full-screen layers: bottom sheet modal, achievements page, badge page, resume/rest bars.
  const layers = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    om('qsModal'); document.getElementById('achFull').classList.add('open'); document.getElementById('badgeFull').classList.add('open');
    document.getElementById('resumeBar').style.display = 'block'; document.getElementById('restBar').style.display = 'flex';
    const out = { mo: r(document.getElementById('qsModal')).bottom, md: r(document.querySelector('#qsModal .md')).bottom,
      ach: r(document.getElementById('achFull')).bottom, badge: r(document.getElementById('badgeFull')).bottom,
      resume: r(document.getElementById('resumeBar')).bottom, rest: r(document.getElementById('restBar')).bottom,
      pageMin: parseFloat(getComputedStyle(document.querySelector('.page.active')).minHeight), ih: innerHeight };
    cm('qsModal'); document.getElementById('achFull').classList.remove('open'); document.getElementById('badgeFull').classList.remove('open');
    document.getElementById('resumeBar').style.display = ''; document.getElementById('restBar').style.display = '';
    return out;
  });
  const full = layers.ih + GAP;
  check('standalone gap: standalone -> modal backdrop reaches the real bottom', Math.round(layers.mo) === full, JSON.stringify(layers));
  check('standalone gap: standalone -> bottom sheet sits on the real bottom (no bare strip under it)', Math.round(layers.md) === full, JSON.stringify(layers));
  check('standalone gap: standalone -> achievements full page reaches the real bottom', Math.round(layers.ach) === full, JSON.stringify(layers));
  check('standalone gap: standalone -> badge full page reaches the real bottom', Math.round(layers.badge) === full, JSON.stringify(layers));
  check('standalone gap: standalone -> resume/rest bars moved down with the nav', Math.round(layers.resume) === full - 78 && Math.round(layers.rest) === full - 78, JSON.stringify(layers));
  check('standalone gap: standalone -> --ah (page min-height) covers the real screen height', Math.round(layers.pageMin) === full, JSON.stringify(layers));

  // 3) Keyboard up (viewport shrinks far more than a status bar): gap must read 0, then come back on resize.
  await page.evaluate(() => { Object.defineProperty(screen, 'height', { get: () => innerHeight + 300, configurable: true }); dispatchEvent(new Event('resize')); });
  const kb = await measure(page);
  check('standalone gap: a >100px shortfall (keyboard) is not this bug -> 0px', kb.gap === '0px', JSON.stringify(kb));
  await page.evaluate(g => { Object.defineProperty(screen, 'height', { get: () => innerHeight + g, configurable: true }); dispatchEvent(new Event('resize')); }, GAP);
  check('standalone gap: resize re-measures back to 59px', (await measure(page)).gap === `${GAP}px`);

  // 4) Landscape: iOS keeps screen.* in portrait terms, so the short edge is the one to compare against.
  await page.setViewportSize({ width: 844, height: SCREEN.w - GAP });
  await page.waitForTimeout(100);
  const ls = await measure(page);
  check('standalone gap: landscape compares innerHeight to the short screen edge -> 59px', ls.gap === `${GAP}px` && ls.iw > ls.ih, JSON.stringify(ls));
  check('standalone gap: standalone -> no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const STANDALONE_GAP_SUITES = [standaloneGap];
