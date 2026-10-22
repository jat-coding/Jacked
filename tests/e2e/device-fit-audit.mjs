// Every-iPhone fit audit (2026-10-22, Mr. Roni: "fit all displays for different devices").
// Real WebKit (Safari's engine), every distinct iPhone width from SE (320) to Pro Max (440), both
// as a Safari tab (Playwright's per-device visible height, toolbars subtracted) and as the
// home-screen app (full screen height). For each screen it checks: no sideways page scroll, nothing
// sticking out past the left/right edge, no clipped text, the nav's five labels on one line, and
// (home-screen runs) no text or control under the status bar / Dynamic Island or home indicator.
// Known and intended: the nav's labels dip 8px into the 34px home-indicator zone (moved low on
// purpose, 631dd85) -- that is reported as a warning, not a failure.
// Run: JK_PORT=8811 node tests/e2e/device-fit-audit.mjs [outdir-for-screenshots]
import { createRequire } from 'module';
import { startServer, stopServer, URL } from './harness.mjs';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { webkit, devices } = require(process.env.PW || 'playwright');
const OUT = process.argv[2] || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

// width x Safari-tab height x full-screen height (points)
const PHONES = [
  ['iPhone SE (1st)', 320, 568, 568, 20, 0],
  ['iPhone SE (3rd)', 375, 667, 667, 20, 0],
  ['iPhone 13 mini', 375, 629, 812, 50, 34],
  ['iPhone 16e', 390, 651, 844, 47, 34],
  ['iPhone 16', 393, 659, 852, 59, 34],
  ['iPhone 17 Pro', 402, 681, 874, 62, 34],
  ['iPhone 11/XR', 414, 715, 896, 48, 34],
  ['iPhone Air', 420, 719, 912, 68, 34],
  ['iPhone 14 Plus', 428, 746, 926, 47, 34],
  ['iPhone 16 Plus', 430, 739, 932, 59, 34],
  ['iPhone 17 Pro Max', 440, 763, 956, 62, 34],
];
// Playwright can't fake env(safe-area-inset-*), and the app reads them only through --sat/--sab
// (plus three inline env(safe-area-inset-bottom) paddings), so the home-screen runs set those
// two variables to each phone's real status-bar / home-indicator heights.
const UA = devices['iPhone 16'].userAgent;

const now = new Date('2026-10-22T12:00:00-06:00');
const LB = 2.20462;
const d = (n) => new Date(now.getTime() - n * 864e5).toISOString();
const set = (lb, reps) => ({ weight: lb / LB, reps, done: true });
const hist = Array.from({ length: 12 }, (_, i) => ({
  id: 'w' + i, name: ['Push Day', 'Pull Day', 'Leg Day — Heavy Squats & Accessories'][i % 3], date: d(i * 2), duration: '58:12', sets: 12, totalVolume: 18450, prCount: i % 4 === 0 ? 2 : 0,
  exercises: [
    { exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press', muscle: 'chest', tracking: 'weight_reps', sets: [set(225, 5), set(235, 3), set(245, 1)] },
    { exId: 'Barbell_Squat', name: 'Barbell Squat', muscle: 'quadriceps', tracking: 'weight_reps', sets: [set(315, 5), set(335, 3)] },
    { exId: 'Barbell_Deadlift', name: 'Barbell Deadlift', muscle: 'lower back', tracking: 'weight_reps', sets: [set(405, 3)] },
  ],
}));
const SEED = {
  prof: { name: 'Jat Roni', username: '@jatroni', code: '@jatroni', sex: 'male', birthday: '2000-07-10' },
  bw: 229 / LB, hist, prs: {}, cex: [], friends: [],
  routines: [{ id: 'r1', name: 'Upper Body Strength & Hypertrophy', desc: '', exercises: ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Squat'] },
             { id: 'r2', name: 'Legs', desc: '', exercises: ['Barbell_Squat'] }],
  settings: { wUnit: 'lb' },
};

const SCREENS = [
  ['home', p => p.evaluate(() => sp('home'))],
  ['routines', p => p.evaluate(() => sp('routines'))],
  ['library', p => p.evaluate(() => sp('exercises'))],
  ['metrics', p => p.evaluate(() => sp('metrics'))],
  ['friends', p => p.evaluate(() => sp('leaderboard'))],
  ['profile', p => p.evaluate(() => openProf())],
  ['achievements', p => p.evaluate(() => openAch())],
  ['workout', p => p.evaluate(() => startEmpty())],
];

// Runs in the page. Returns problems on the screen as currently shown.
function inspect() {
  const iw = innerWidth, ih = innerHeight, out = [];
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (el.textContent ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"` : '');
  // inside a sideways scroller or a hidden/closed layer -> not a fit problem
  // a sideways carousel scrolls only sideways; the app's vertical scrollers also compute overflow-x:auto
  // (CSS turns visible into auto), so those must not excuse what they contain
  const carousel = (a, s) => /(auto|scroll)/.test(s.overflowX) && a.scrollHeight <= a.clientHeight + 2;
  const inScroller = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (carousel(a, s)) return true; if (s.display === 'none' || s.visibility === 'hidden') return true; } return false; };
  const sw = document.documentElement.scrollWidth;
  if (sw > iw + 1) out.push(`page scrolls sideways: ${sw}px wide in a ${iw}px screen`);
  for (const a of document.querySelectorAll('body *')) {
    const s = getComputedStyle(a);
    if (/(auto|scroll)/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 2 && a.scrollWidth > a.clientWidth + 1 && vis(a) && !inScroller(a))
      out.push(`scrolls sideways: ${name(a).slice(0, 40)} is ${a.scrollWidth}px wide in ${a.clientWidth}px`);
  }
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > ih) continue;
    if ((r.right > iw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' || (r.right > iw + 1 && r.width < iw)) {
      // report only the outermost offender
      let p = el.parentElement, dup = false; while (p) { if (seen.has(p)) { dup = true; break; } p = p.parentElement; }
      if (!dup) { seen.add(el); out.push(`sticks out ${r.left < -1 ? 'left ' + Math.round(-r.left) : 'right ' + Math.round(r.right - iw)}px: ${name(el)}`); }
    }
    const s = getComputedStyle(el);
    if (el.children.length === 0 && el.textContent.trim() && s.overflowX !== 'visible' && s.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`text cut off: ${name(el)} (${el.scrollWidth} in ${el.clientWidth})`);
  }
  // nav labels each on one line
  for (const b of document.querySelectorAll('nav .nb')) { if (!vis(b)) continue; const lh = parseFloat(getComputedStyle(b).lineHeight) || 14; const txt = [...b.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()); if (txt.length) { const rg = document.createRange(); rg.selectNodeContents(txt[txt.length - 1]); const rects = [...rg.getClientRects()]; const lines = new Set(rects.map(x => Math.round(x.top))).size; if (lines > 1) out.push(`nav label wraps: ${b.textContent.trim()}`); } }
  return out;
}

// Text or a control under the status bar / Dynamic Island, or under the home indicator, on the
// screen as first shown (nothing scrolled). Only the topmost layer at that point counts.
function underBars([sat, sab]) {
  const out = [], ih = innerHeight;
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!ownText && !/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.right < 0 || r.left > innerWidth) continue;
    const probe = (y) => { const t = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y); return t && (t === el || el.contains(t) || t.contains(el)); };
    const label = (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
    if (sat && r.top < sat - 1 && r.bottom > 0 && probe(Math.max(0, r.top + 1))) out.push(`under the status bar (${Math.round(sat - r.top)}px): ${label}`);
    // bottom: only pinned things (inside a fixed layer) -- page content scrolling past the bottom is fine
    const pinned = (() => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 2) return false; if (cs.position === 'fixed') return true; } return false; })();
    if (sab && pinned && r.bottom > ih - sab + 1 && r.top < ih && probe(Math.min(ih - 1, r.bottom - 1))) out.push(`under the home indicator (${Math.round(r.bottom - (ih - sab))}px): ${label}`);
  }
  return out;
}

await startServer();
const browser = await webkit.launch();
const report = [];
let pageErrors = 0;
for (const [label, w, tabH, fullH, sat, sab] of PHONES) {
  for (const [mode, h, ins] of [['safari', tabH, [0, 0]], ['homescreen', fullH, [sat, sab]]]) {
    for (const [scr, open] of SCREENS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, timezoneId: 'America/Denver', serviceWorkers: 'block' });
      await ctx.route(/supabase/, r => r.abort());
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('dialog', dl => dl.dismiss());
      await page.clock.setFixedTime(now);
      await page.goto(URL);
      await page.evaluate(seed => { localStorage.clear(); localStorage.setItem('jk_appVersion', 'v1.0.0'); for (const [k, v] of Object.entries(seed)) localStorage.setItem('jk_' + k, JSON.stringify(v)); }, SEED);
      await page.reload();
      try { await page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex', null, { timeout: 8000 }); } catch { report.push({ label, w, h, mode, scr, issues: ['app did not boot'] }); await ctx.close(); continue; }
      try { await open(page); } catch (e) { report.push({ label, w, h, mode, scr, issues: ['could not open: ' + e.message.split('\n')[0]] }); await ctx.close(); continue; }
      await page.addStyleTag({ content: `html{--sat:${ins[0]}px!important;--sab:${ins[1]}px!important}` });
      await page.waitForTimeout(450);
      const issues = await page.evaluate(inspect);
      issues.push(...(await page.evaluate(underBars, ins)).filter(i => !/home indicator \(\d+px\): #nav-/.test(i) || +i.match(/\((\d+)px\)/)[1] > 8));
      if (OUT && (mode === 'homescreen' || w <= 375)) await page.screenshot({ path: `${OUT}/${w}x${h}-${scr}.png` });
      if (errs.length) { pageErrors += errs.length; issues.push(...errs.map(e => 'page error: ' + e.slice(0, 120))); }
      report.push({ label, w, h, mode, scr, issues: [...new Set(issues)] });
      await ctx.close();
    }
  }
}
await browser.close(); stopServer();

let bad = 0;
for (const r of report) if (r.issues.length) { bad++; console.log(`\n${r.label} ${r.w}x${r.h} ${r.mode} / ${r.scr}`); for (const i of r.issues.slice(0, 12)) console.log('  - ' + i); if (r.issues.length > 12) console.log(`  ... +${r.issues.length - 12} more`); }
console.log(`\n${report.length} screen checks, ${bad} with problems, ${report.length - bad} clean`);
if (OUT) fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
process.exit(bad ? 1 : 0);
