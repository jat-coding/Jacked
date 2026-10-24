// Shared Playwright harness for the Jacked PWA. Lives in the repo (not /tmp) so it
// survives /tmp purges -- the old /tmp/jk16 suites were lost that way.
// Run: PW=<path to node_modules/playwright> node tests/e2e/run.mjs
// Supabase and the supabase-js CDN are blocked, so the app runs fully local and
// never touches the production backend. Service workers are blocked too.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { readFile } from 'fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(HERE, '../../jacked-pwa');
export const PORT = Number(process.env.JK_PORT || 8765);
export const URL = `http://127.0.0.1:${PORT}/index.html`;

// Standing-questions 2026-10-17 item 10 (memory/context/mistake-fix-queue.md "2026-09-26
// 19:00", [[jacked-e2e-silently-tested-old-code-on-busy-port]]): an orphan python3
// http.server on :8765, left over from a prior run, passed e2e three times (9/25 21:45,
// 9/25 23:53, 9/26 19:00) against OLD code -- the readiness loop below only checks "does
// something answer at URL", which an orphan does immediately, so it can't tell "my spawned
// server became ready" from "something else was already here". Two checks fix that: (1)
// refuse outright if anything already answers on PORT before spawning at all, and (2)
// after spawn, verify the bytes actually served are the real index.html on disk, not a
// stale/cached copy -- catches the case where something IS this test's own spawn but is
// somehow serving the wrong directory or a cached response.
async function alreadyServing() {
  try { const r = await fetch(URL); return r.ok; } catch { return false; }
}

let server;
export async function startServer() {
  if (await alreadyServing()) {
    throw new Error(`port ${PORT} is already serving something -- refusing to test against it `
      + `(an orphan server here tested old code 3 times in a row on 2026-09-25/26). Kill the `
      + `existing process (lsof -ti :${PORT} | xargs kill) or run with a different JK_PORT.`);
  }
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', APP_DIR], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(URL); if (r.ok) { ready = true; break; } } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  if (!ready) throw new Error('server did not start');
  const [served, onDisk] = await Promise.all([
    fetch(URL).then(r => r.arrayBuffer()).then(Buffer.from),
    readFile(path.join(APP_DIR, 'index.html')),
  ]);
  if (!served.equals(onDisk)) {
    stopServer();
    throw new Error(`server on port ${PORT} is serving ${served.length} bytes but the real `
      + `index.html on disk is ${onDisk.length} bytes -- refusing to test against stale content`);
  }
}
export function stopServer() { if (server) server.kill(); }

let browser;
export async function launch() { browser = await chromium.launch(); return browser; }
export async function close() { if (browser) await browser.close(); }

// A phone-shaped page. seed = { key: value } written as jk_<key> (JSON) before boot.
// now = fixed wall-clock (Date) so date-window badges are deterministic.
// angle = physical rotation to report: 0 | 90 | 270 (window.orientation 90 = turned counter-clockwise, -90 = clockwise),
// or 'none' = a browser that reports no orientation at all. via: 'wo' (window.orientation, iOS) or 'so' (screen.orientation only).
// Playwright's screenshot() resets CDP metrics, so orientation is spoofed in an init script rather than via CDP.
export async function phone({ width = 390, height = 844, seed = {}, now = null, videoDir = null, angle = null, via = 'wo' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    timezoneId: 'America/Denver', serviceWorkers: 'block',
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width, height } } } : {}),
  });
  if (angle !== null) await ctx.addInitScript(([a, via]) => {
    const wo = a === 270 ? -90 : a;
    if (a === 'none') { try { delete window.orientation; } catch (_) {} Object.defineProperty(window, 'orientation', { value: undefined, configurable: true });
      Object.defineProperty(screen, 'orientation', { value: undefined, configurable: true }); return; }
    if (via === 'wo') Object.defineProperty(window, 'orientation', { get: () => wo, configurable: true });
    else { Object.defineProperty(window, 'orientation', { value: undefined, configurable: true });
      Object.defineProperty(screen, 'orientation', { value: { angle: a, type: 'landscape-primary', addEventListener() {} }, configurable: true }); }
  }, [angle, via]);
  await ctx.route(/supabase/, r => r.abort());
  // standing-questions 2026-10-20 item 11 (queue 2026-09-24 nightly, "Jacked mockups didn't
  // look like the app" -- real fonts were opt-in via JK_FONTS=1, so a mockup generated with
  // no flags rendered in a fallback font and looked wrong against the live app
  // [[mockups-must-render-like-the-live-app]]). Default flipped: real fonts load unless
  // explicitly blocked with JK_BLOCK_FONTS=1 (a fast run that doesn't care about rendering
  // fidelity). JK_FONTS=1 is still accepted as a no-op for any existing caller that sets it.
  if (process.env.JK_BLOCK_FONTS) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
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
// Badges count one standard library exercise each (2026-09-30), so the plain names the suites use for those lifts
// get the real library ids; anything else keeps a made-up slug id.
export const STD_ID = { 'Barbell Bench Press': 'Barbell_Bench_Press_-_Medium_Grip', 'Barbell Squat': 'Barbell_Squat', 'Barbell Deadlift': 'Barbell_Deadlift',
  'Barbell Overhead Press': 'Standing_Military_Press', 'Pull-up': 'Pullups', 'Push-up': 'Pushups', 'Run': 'bi_run_outdoor' };
export function ex(name, sets, tracking = 'weight_reps', exId) {
  return { exId: exId || STD_ID[name] || name.toLowerCase().replace(/[^a-z]+/g, '-'), name, muscle: 'chest', tracking, sets: sets.map(([lb, reps]) => ({ weight: tracking === 'distance' ? lb : lb / LB, reps, done: true })) };
}
export function days(start, n) { const out = []; const d = new Date(start + 'T12:00:00'); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return out; }

// Minimal valid 1x1 RGB PNG, built by hand (no deps beyond zlib) so tests can
// drive a real <input type=file> upload without any fixture files on disk.
const CRC_TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(buf) { let crc = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
export function pngPixel(r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB, no interlace
  const raw = Buffer.from([0, r, g, b]);   // filter-none + one RGB pixel
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
