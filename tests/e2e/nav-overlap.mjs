// Nothing interactive may sit behind the fixed bottom nav (Mr. Roni, 2026-11-11: "There should never be a
// stuck button behind the nav bar. It should always be aware of where the nav bar is"). One suite opens
// EVERY sheet / full-screen overlay / tab page from nav-screens.mjs at iPhone viewports (with the real
// home-indicator inset), scrolls each scroller to its true bottom, and bounding-box asserts that no visible
// interactive element or text leaf overlaps the nav. Fixed bars (resume / rest / install banner) are checked
// against the nav too, in every state they can show. Chromium here; tests/e2e/nav-buffer-audit.mjs does the
// same walk in real WebKit on a machine that has it.
import { phone, check } from './harness.mjs';
import { now, SEED, SCREENS } from './nav-screens.mjs';

function scan(sel) {
  const nav = document.querySelector('nav');
  const navR = nav.getBoundingClientRect();
  const vis = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const scrollable = el => el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY);
  let scope;
  if (sel === 'page') {
    scope = document.querySelector('.page.active') || document.body;
    window.scrollTo(0, document.body.scrollHeight);
    const root = document.getElementById('jkRoot'); if (root) root.scrollTop = root.scrollHeight;
  } else {
    scope = document.querySelector(sel);
    if (!scope) return { error: 'container not found: ' + sel };
    [scope, ...scope.querySelectorAll('*')].filter(scrollable).forEach(e => { e.scrollTop = e.scrollHeight; });
  }
  const isInt = el => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.hasAttribute('onclick') || el.getAttribute('role') === 'button';
  const bad = [];
  for (const el of scope.querySelectorAll('*')) {
    if (nav.contains(el) || !vis(el)) continue;
    const leaf = !el.children.length;
    if (!isInt(el) && !leaf) continue;
    const r = el.getBoundingClientRect();
    if (r.height > innerHeight * 0.5 || r.top >= innerHeight) continue;   // backdrops / wrappers / scrolled-off
    if (r.bottom > navR.top + 0.5 && r.top < navR.bottom) {
      bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')) + ` bottom=${Math.round(r.bottom)} navTop=${Math.round(navR.top)}`);
    }
  }
  return { bad: bad.slice(0, 4), n: bad.length };
}

const VIEWPORTS = [['iPhone SE', 375, 667, 20, 0], ['iPhone 16', 393, 852, 59, 34], ['iPhone 16 Pro Max', 440, 956, 59, 34]];

async function navOverlap() {
  for (const [name, width, height, sat, sab] of VIEWPORTS) {
    const { page, ctx, errors } = await phone({ width, height, seed: SEED, now });
    await page.addStyleTag({ content: `html{--sat:${sat}px!important;--sab:${sab}px!important}` });
    await page.waitForTimeout(200);
    // nav-height variable really is the nav's footprint (the one shared mechanism).
    const foot = await page.evaluate(() => { const r = document.querySelector('nav').getBoundingClientRect(); const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;bottom:var(--navTop);height:0;width:1px'; document.body.appendChild(probe); const t = probe.getBoundingClientRect().bottom; probe.remove(); return { navTop: r.top, varTop: t }; });
    check(`navOverlap [${name}]: --navTop equals the nav's real top edge`, Math.abs(foot.navTop - foot.varTop) < 1.5, JSON.stringify(foot));
    for (const [scr, sel, open] of SCREENS) {
      try { await page.evaluate(open); } catch (e) { check(`navOverlap [${name}] ${scr}: opens`, false, String(e).split('\n')[0]); continue; }
      await page.waitForTimeout(250);
      const m = await page.evaluate(scan, sel);
      check(`navOverlap [${name}] ${scr}: nothing overlaps the nav`, !m.error && m.n === 0, m.error || m.bad.join(' | '));
      await page.evaluate(() => {
        document.querySelectorAll('.mo.open').forEach(e => e.classList.remove('open'));
        ['achFull', 'badgeFull', 'recapFull', 'gymYears'].forEach(id => document.getElementById(id)?.classList.remove('open'));
        const lb = document.getElementById('avLightbox'); if (lb) lb.classList.remove('open');
        if (typeof aw !== 'undefined' && aw) { try { aw = null; } catch (_) {} }
        sp('home');
      });
      await page.waitForTimeout(80);
    }
    // Fixed bars that float above the nav: every state must clear it, with a visible gap.
    const bars = await page.evaluate(() => {
      const out = {}; const navTop = document.querySelector('nav').getBoundingClientRect().top;
      const st = (id, show, cls) => { const el = document.getElementById(id); el.style.display = show; if (cls) document.body.classList.add(cls); const r = el.getBoundingClientRect(); out[id + (cls ? '+' + cls : '')] = { bottom: Math.round(r.bottom), navTop: Math.round(navTop), ok: r.bottom <= navTop + 0.5 }; el.style.display = ''; if (cls) document.body.classList.remove(cls); };
      st('resumeBar', 'block'); st('restBar', 'flex'); st('resumeBar', 'block', 'resting'); st('installBanner', 'flex');
      document.getElementById('installBanner').classList.remove('hidden');
      st('installBanner', 'flex');
      return out;
    });
    for (const [k, v] of Object.entries(bars)) check(`navOverlap [${name}] fixed bar ${k}: above the nav`, v.ok, JSON.stringify(v));
    check(`navOverlap [${name}]: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
export const NAV_OVERLAP_SUITES = [navOverlap];
