// iOS 26.1+ home-screen bottom strip (WebKit bug 301994). With a black-translucent status bar
// plus viewport-fit=cover, iOS paints a viewport one status bar short of the screen, and the
// bottom strip is outside anything the page can paint. The first fix (9b3b255..004e91f) measured
// that shortfall into --standaloneGap and pushed the nav and overlays down by it; on his real
// iPhone (2026-10-22 6:01pm screenshot) that slid the nav into the unpainted strip and sliced it.
// The fix now is an opaque `black` status bar: the page starts below it and its viewport runs to
// the real bottom, so nothing needs pushing. Real hardware can't be driven from here; this suite
// pins the two things that make that true: the status-bar meta is opaque, and a home-screen
// install whose screen reads taller than innerHeight leaves every bottom layer where it is.
import { phone, check } from './harness.mjs';

const SCREEN = { w: 390, h: 844 + 59 };
const spoof = ({ w, h }) => {
  Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
  Object.defineProperty(screen, 'width', { get: () => w, configurable: true });
  Object.defineProperty(screen, 'height', { get: () => h, configurable: true });
};
const booted = page => page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex');

async function standaloneGap() {
  const { page, ctx, errors } = await phone({});
  await ctx.addInitScript(spoof, SCREEN);
  await page.reload(); await booted(page);
  const m = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    om('qsModal'); document.getElementById('achFull').classList.add('open'); document.getElementById('badgeFull').classList.add('open');
    document.getElementById('resumeBar').style.display = 'block'; document.getElementById('restBar').style.display = 'flex';
    const out = {
      doc: document.documentElement.classList.contains('jk-doc'), rootPos: getComputedStyle(document.getElementById('jkRoot')).position,
      rootOy: getComputedStyle(document.getElementById('jkRoot')).overflowY, bodyPos: getComputedStyle(document.body).position,
      bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
      gap: getComputedStyle(document.documentElement).getPropertyValue('--standaloneGap').trim(),
      ih: innerHeight, body: r(document.body).height, root: r(document.getElementById('jkRoot')).height, nav: r(document.querySelector('nav')).bottom,
      mo: r(document.getElementById('qsModal')).bottom, md: r(document.querySelector('#qsModal .md')).bottom,
      ach: r(document.getElementById('achFull')).bottom, badge: r(document.getElementById('badgeFull')).bottom,
      resume: r(document.getElementById('resumeBar')).bottom, rest: r(document.getElementById('restBar')).bottom,
    };
    cm('qsModal'); document.getElementById('achFull').classList.remove('open'); document.getElementById('badgeFull').classList.remove('open');
    document.getElementById('resumeBar').style.display = ''; document.getElementById('restBar').style.display = '';
    return out;
  });
  const j = JSON.stringify(m), ih = m.ih;
  check('standalone: status bar is opaque black, not black-translucent (the bug needs translucent)', m.bar === 'black', j);
  check('standalone: --standaloneGap stays 0px even when the screen reads 59px taller', m.gap === '0px', j);
  check('standalone: body and #jkRoot are exactly viewport-tall (nothing pushed past the painted area)', m.body === ih && m.root === ih, j);
  check('standalone: nav sits 8px above the viewport bottom, fully inside it', Math.round(m.nav) === ih - 8, j);
  check('standalone: modal backdrop and bottom sheet end at the viewport bottom', Math.round(m.mo) === ih && Math.round(m.md) === ih, j);
  check('standalone: achievements and badge pages end at the viewport bottom', Math.round(m.ach) === ih && Math.round(m.badge) === ih, j);
  check('standalone: resume/rest bars sit above the nav, inside the viewport', Math.round(m.resume) === ih - 78 && Math.round(m.rest) === ih - 78, j);
  check('standalone: home-screen app keeps the pinned layout (no jk-doc; body fixed, #jkRoot is the scroller)', !m.doc && m.bodyPos === 'fixed' && m.rootPos === 'absolute' && m.rootOy === 'auto', j);
  check('standalone: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

export const STANDALONE_GAP_SUITES = [standaloneGap];
