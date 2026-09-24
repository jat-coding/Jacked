// Shared Playwright harness for the Jacked PWA. Lives in the repo (not /tmp) so it
// survives /tmp purges -- the old /tmp/jk16 suites were lost that way.
// Run: PW=<path to node_modules/playwright> node tests/e2e/run.mjs
// Supabase and the supabase-js CDN are blocked, so the app runs fully local and
// never touches the production backend. Service workers are blocked too.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(HERE, '../../jacked-pwa');
export const PORT = Number(process.env.JK_PORT || 8765);
export const URL = `http://127.0.0.1:${PORT}/index.html`;

let server;
export async function startServer() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', APP_DIR], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(URL); if (r.ok) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
export function stopServer() { if (server) server.kill(); }

let browser;
export async function launch() { browser = await chromium.launch(); return browser; }
export async function close() { if (browser) await browser.close(); }

// A phone-shaped page. seed = { key: value } written as jk_<key> (JSON) before boot.
// now = fixed wall-clock (Date) so date-window badges are deterministic.
export async function phone({ width = 390, height = 844, seed = {}, now = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    timezoneId: 'America/Denver', serviceWorkers: 'block',
  });
  await ctx.route(/supabase/, r => r.abort());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  if (now) await page.clock.setFixedTime(now);
  await page.goto(URL);
  await page.evaluate(seed => {
    localStorage.clear();
    localStorage.setItem('jk_appVersion', 'v1.0.0');
    const base = { prof: { name: 'Tester', username: '@tester', code: '@tester' }, hist: [], prs: {}, routines: [], cex: [], friends: [], settings: { wUnit: 'lb' } };
    for (const [k, v] of Object.entries({ ...base, ...seed })) localStorage.setItem('jk_' + k, JSON.stringify(v));
  }, seed);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex');
  return { page, ctx, errors };
}

// Tiny assertion collector.
export const results = [];
export function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && detail ? ' -- ' + detail : ''}`);
}

// History helpers. d = 'YYYY-MM-DD' local; hour local (Denver).
export function wk(d, exercises = [], extra = {}) {
  const iso = new Date(`${d}T${String(extra.hour ?? 12).padStart(2, '0')}:00:00-06:00`).toISOString();
  return { id: 'w' + d + (extra.hour ?? 12) + Math.random().toString(36).slice(2, 6), name: 'W', date: iso, exercises, duration: '30:00', sets: 1, totalVolume: 0, prCount: extra.pr ? 1 : 0 };
}
export const LB = 2.20462;
export function ex(name, sets, tracking = 'weight_reps', exId) {
  return { exId: exId || name.toLowerCase().replace(/[^a-z]+/g, '-'), name, muscle: 'chest', tracking, sets: sets.map(([lb, reps]) => ({ weight: tracking === 'distance' ? lb : lb / LB, reps, done: true })) };
}
export function days(start, n) { const out = []; const d = new Date(start + 'T12:00:00'); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; }
