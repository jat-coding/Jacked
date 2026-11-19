// End-of-scroll bottom-buffer audit with a workout OPEN (Return-to-workout bar showing), iPhone size.
// Standing rule (Mr. Roni 2026-11-18): the floating nav capsule AND the resume bar must never cover the last
// row/button of any tab or full-screen list. For each screen: scroll its real scroller to the very end, then the
// lowest visible leaf must end above min(nav top, resume bar top). Also screenshots the bottom of each tab.
// Run: PW=<node_modules/playwright> node tests/e2e/nav-resume-audit.mjs [shotsdir]
import { startServer, stopServer, launch, close, phone, check, results } from './harness.mjs';
import { SEED, SCREENS } from './nav-screens.mjs';
import fs from 'fs';
const SHOTS = process.argv[2] || '/tmp/trp/shots'; fs.mkdirSync(SHOTS, { recursive: true });
await startServer(); await launch();
const { page, ctx, errors } = await phone({ seed: SEED, width: 390, height: 844 });
await page.waitForTimeout(500);
const probe = (sel) => {
  const nav = document.querySelector('nav').getBoundingClientRect();
  const bar = document.getElementById('resumeBar'); const br = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect() : null;
  const limit = Math.min(nav.top, br ? br.top : Infinity);
  let sc;
  if (sel === 'page') { window.scrollTo(0, document.body.scrollHeight); sc = document.getElementById('jkRoot'); if (sc && sc.scrollHeight > sc.clientHeight) sc.scrollTop = sc.scrollHeight; }
  else { const root = document.querySelector(sel); sc = root; root.scrollTop = root.scrollHeight; }
  const scope = sel === 'page' ? (document.querySelector('.page.active')) : document.querySelector(sel);
  let low = -1, what = '';
  for (const el of scope.querySelectorAll('*')) {
    if (el.children.length) continue; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (!r.height || !r.width) continue;
    if (r.bottom > low) { low = r.bottom; what = (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' ' + (el.textContent || '').trim().slice(0, 24); }
  }
  return { gap: Math.round(limit - low), barShown: !!br, what, limit: Math.round(limit) };
};
const manyHist = () => { const base = gH(); const extra = []; for (let y = 0; y < 3; y++) for (let i = 0; i < 90; i++) extra.push({ ...base[0], id: 'mh' + y + '_' + i, date: new Date(Date.now() - (y * 400 + i * 4) * 864e5).toISOString() }); S.s('hist', [...base, ...extra]); };
await page.evaluate(manyHist);
// open a workout, then leave it so the resume bar shows
await page.evaluate(() => { startEmpty(); });
await page.waitForTimeout(300);
const tabs = [['home', () => sp('home')], ['routines', () => sp('routines')], ['library', () => sp('exercises')], ['metrics', () => sp('metrics')], ['friends', () => sp('leaderboard')]];
for (const [n, open] of tabs) {
  await page.evaluate(open); await page.waitForTimeout(500);
  const m = await page.evaluate(probe, 'page');
  check(`inset tab ${n}: last content clears nav+resume bar (gap ${m.gap}px, bar=${m.barShown})`, m.barShown && m.gap >= 0, JSON.stringify(m));
  await page.screenshot({ path: `${SHOTS}/tab-${n}-end.png` });
}
const full = SCREENS.filter(s => ['#achFull', '#badgeFull', '#recapFull', '#gymYears'].includes(s[1]));
for (const [name, sel, open] of full) {
  await page.evaluate(open); await page.waitForTimeout(400);
  const m = await page.evaluate(probe, sel);
  check(`inset ${name}: last content clears nav+resume bar (gap ${m.gap}px)`, m.gap >= 0, JSON.stringify(m));
  if (/recap|Gym years|Achievements/.test(name)) await page.screenshot({ path: `${SHOTS}/full-${name.replace(/[^a-z0-9]+/gi, '_')}-end.png` });
  await page.evaluate(() => { ['achFull', 'badgeFull', 'recapFull', 'gymYears'].forEach(id => document.getElementById(id)?.classList.remove('open')); });
}
// Without a workout the --resumeX var must be 0 (no extra dead space).
await page.evaluate(() => { aw = null; sp('home'); updateResumeBar(); });
check('inset: resume var back to 0 when no workout', await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--resumeX').trim() === '0px'));
check('inset: no page errors', errors.length === 0, errors.join(' | '));
await ctx.close(); await close(); stopServer();
const bad = results.filter(r => !r.ok);
console.log(bad.length ? 'FAILED ' + bad.length : 'ALL PASSED ' + results.length);
process.exit(bad.length ? 1 : 0);
