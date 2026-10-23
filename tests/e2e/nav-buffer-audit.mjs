// Nav-bar buffer audit (2026-10-23, 3rd report from Mr. Roni: content/buttons still hidden
// behind the fixed bottom nav after two prior fixes -- a6b675c, d857676). This does NOT trust
// static CSS reasoning (the last report's "achFull/badgeFull/recapFull/gymYears have a higher
// z-index than nav so the nav isn't visible under them, no buffer needed" turned out to be an
// incomplete read -- see the task brief). Instead it renders every screen in real WebKit, scrolls
// each one's own real scroll container to its true bottom, and asks the browser itself two
// questions with getBoundingClientRect + elementFromPoint: (1) does the nav bar actually PAINT
// on top of the last interactive element (ground truth for "is nav visible/active here"), and
// (2) does that last element's own bottom edge clear the nav's reserved zone, independent of
// whether nav happens to be painted over right now. WebKit, not Chromium -- real-device-visible
// stacking bugs with position:fixed have recurred in this file (WebKit bug 301994 and others
// documented at the top of index.html) and would not reproduce in Chromium.
// (No chromium/firefox launch config is needed here -- webkit does not take --no-sandbox or
// executablePath, unlike the Mac-Chromium path in scripts/browser.mjs.)
// Run: node tests/e2e/nav-buffer-audit.mjs [outdir-for-screenshots]
import { createRequire } from 'module';
import { startServer, stopServer, URL } from './harness.mjs';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { webkit, devices } = require(process.env.PW || 'playwright');
const OUT = process.argv[2] || '/tmp/navaudit/shots';
fs.mkdirSync(OUT, { recursive: true });

// width x Safari-tab height x full-screen height x status-bar x home-indicator (points) --
// two representative real phones, as asked: a small one (SE) and a current one (16).
const PHONES = [
  ['iPhone SE (3rd)', 375, 667, 667, 20, 0],
  ['iPhone 16', 393, 659, 852, 59, 34],
];
const UA = devices['iPhone 16'].userAgent;

const now = new Date('2026-10-23T02:00:00-06:00');
const LB = 2.20462;
const d = (n) => new Date(now.getTime() - n * 864e5).toISOString();
const set = (lb, reps) => ({ weight: lb / LB, reps, done: true });
const hist = Array.from({ length: 24 }, (_, i) => ({
  id: 'w' + i, name: ['Push Day', 'Pull Day', 'Leg Day — Heavy Squats & Accessories'][i % 3], date: d(i * 3), duration: '58:12', sets: 12, totalVolume: 18450, prCount: i % 4 === 0 ? 2 : 0,
  exercises: [
    { exId: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press', muscle: 'chest', tracking: 'weight_reps', sets: [set(225, 5), set(235, 3), set(245, 1)] },
    { exId: 'Barbell_Squat', name: 'Barbell Squat', muscle: 'quadriceps', tracking: 'weight_reps', sets: [set(315, 5), set(335, 3)] },
    { exId: 'Barbell_Deadlift', name: 'Barbell Deadlift', muscle: 'lower back', tracking: 'weight_reps', sets: [set(405, 3)] },
  ],
}));
const SEED = {
  prof: { name: 'Jat Lifter', username: '@jatlift', code: '@jatlift', sex: 'male', birthday: '2000-07-10' },
  bw: 229 / LB, hist, prs: {}, cex: [], friends: [{ code: '@buddy1', name: 'Training Buddy', days: ['2026-10-01', '2026-10-03', '2026-10-05'] }],
  routines: [{ id: 'r1', name: 'Upper Body Strength & Hypertrophy', desc: '', exercises: ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Squat'] },
             { id: 'r2', name: 'Legs', desc: '', exercises: ['Barbell_Squat'] }],
  settings: { wUnit: 'lb' },
};

// Each opener runs in-page. `sel` is the real scroll container for that screen (scrolled to its
// true bottom before measuring) -- the .md child for a .mo sheet, the overlay itself for a
// full-screen one, #jkRoot for an ordinary tab page.
const SCREENS = [
  ['home (tab)', 'page', () => sp('home')],
  ['routines (tab)', 'page', () => sp('routines')],
  ['exercise library (tab)', 'page', () => sp('exercises')],
  ['metrics (tab)', 'page', () => sp('metrics')],
  ['friends/leaderboard (tab)', 'page', () => sp('leaderboard')],
  ['active workout', 'page', () => startEmpty()],
  ['Profile / Settings', '#profModal .md', () => openProf()],
  ['Achievements list', '#achFull', () => openAch()],
  ['Badge detail: Bench-Maxing (tiered)', '#badgeFull', () => badgeInfo('Bench-Maxing')],
  ['Badge detail: Jacked (hero/teaser)', '#badgeFull', () => badgeInfo('Jacked')],
  ['Badge detail: PR-Maxing (sections)', '#badgeFull', () => badgeInfo('PR-Maxing')],
  ['Badge detail: Consistency-Maxing', '#badgeFull', () => badgeInfo('Consistency-Maxing')],
  ['Monthly recap', '#recapFull', () => openRecapNow()],
  ['Gym years (your calendar)', '#gymYears', () => openGymYears()],
  ['Routine 3-dot action sheet', '#rMenuModal .md', () => openRMenu('r1')],
  ['Generic action sheet (long)', '#actMenu .md', () => openActMenu('Workout', [
    { id: 'a', label: 'Edit Workout', icon: 'pencil', fn: () => {} },
    { id: 'b', label: 'Save as Routine', fn: () => {} },
    { id: 'c', label: 'Duplicate', fn: () => {} },
    { id: 'd', label: 'Share', fn: () => {} },
    { id: 'e', label: 'Delete Workout', icon: 'trash', del: true, fn: () => {} },
  ])],
  ['Quick Start sheet', '#qsModal .md', () => openQS()],
  ['Create Routine', '#crModal .md', () => openCR()],
  ['Create Exercise', '#ceModal .md', () => openCE()],
  ['Add Exercise picker', '#aeModal .md', () => openAEModal('routine')],
  ['Workout detail', '#wdModal .md', () => openWD(hist[0].id)],
  ['Edit Workout', '#weModal .md', () => openWE(hist[0].id)],
  ['Reorder exercises', '#reorderModal .md', () => { startEmpty(); openReorder(); }],
  ['Finish-workout summary', '#fsModal .md', () => showFinishSummary({ name: 'Push Day', dur: '58:12', ts: 12, vol: 18450, prList: [{ name: 'Barbell Bench Press', weight: 245, reps: 1 }], sugList: [], progressNotes: [] })],
  ['Plate calculator', '#pcModal .md', () => openPlate()],
  ['Reorder metric cards', '#cardOrderModal .md', () => openCardOrder()],
  ['Reorder routine sections', '#routineOrderModal .md', () => openRoutineOrder()],
  ['Friend profile', '#fpModal .md', () => openFriend('@buddy1')],
  ['Friend badges list', '#fbModal .md', () => showFriendBadges('@buddy1')],
  ['Friend streak calendar (day)', '#dayModal .md', () => openFriendDay('@buddy1', '2026-10-01')],
  ['Exercise info', '#exInfoModal .md', () => openExInfo('Barbell_Bench_Press_-_Medium_Grip')],
  ['Add Friend', '#afModal .md', () => openAF()],
  ['Badge-earned-live popup', '#achModal .md', () => om('achModal')],
  ['Generic confirm dialog', '#confirmModal .md', () => showConfirm('Delete this?', {})],
  ['Cloud-sync prompt', '#cloudPromptModal .md', () => om('cloudPromptModal')],
];

function measure(sel) {
  const nav = document.querySelector('nav');
  const navR = nav.getBoundingClientRect();
  // Scroll the screen's real scroll container to its true bottom. For an ordinary tab
  // ('page') the real scroller depends on display mode: jk-doc (plain browser tab) makes
  // html/body static/overflow:visible so the window itself scrolls, while standalone/
  // fullscreen leaves #jkRoot as position:absolute;overflow-y:auto so *it* scrolls instead
  // (see the jk-doc CSS block near the top of index.html -- Mr. Roni, 2026-10-22, locked).
  // Headless WebKit here always renders as jk-doc (no real navigator.standalone /
  // display-mode:standalone to detect), so scrolling only #jkRoot, as this used to do, left
  // every tab page measured in its unscrolled state. Scroll both; whichever doesn't apply
  // in the current mode is a no-op.
  let root;
  if (sel === 'page') {
    window.scrollTo(0, document.body.scrollHeight);
    root = document.getElementById('jkRoot');
    if (!root) return { error: 'container not found: #jkRoot' };
    if (root.scrollHeight > root.clientHeight) root.scrollTop = root.scrollHeight;
  } else {
    root = document.querySelector(sel);
    if (!root) return { error: `container not found: ${sel}` };
    // Some sheets layer a second class onto the shared `.md` (e.g. `.md.ae-md` for the Add
    // Exercise picker) that sets its own overflow:hidden, later in source order, winning over
    // `.md`'s overflow-y:auto -- the sheet itself never scrolls, a nested child does. Scroll
    // whichever element is the real scroller: the root if it scrolls, else the first scrollable
    // descendant found.
    const scrollable = (el) => el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY);
    const scrollEl = scrollable(root) ? root : Array.from(root.querySelectorAll('*')).find(scrollable);
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const isInteractive = (el) => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.hasAttribute('onclick') || el.getAttribute('role') === 'button';
  const scope = sel === 'page' ? (document.querySelector('.page.active') || root) : root;
  let last = null, lastBottom = -Infinity;
  for (const el of scope.querySelectorAll('*')) {
    if (!isInteractive(el) || !vis(el)) continue;
    if (nav.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > lastBottom) { lastBottom = r.bottom; last = el; }
  }
  if (!last) return { error: 'no interactive element found' };
  const r = last.getBoundingClientRect();
  const label = (last.id ? '#' + last.id : last.tagName.toLowerCase()) + ` "${(last.textContent || last.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  // Ground truth: does nav actually PAINT on top of this element's own location, right now?
  const probeXs = [navR.left + 8, (navR.left + navR.right) / 2, navR.right - 8];
  let navPaintsOver = false, probeDetail = '';
  for (const x of probeXs) {
    const y = Math.min(innerHeight - 1, navR.top + 4);
    const top = document.elementFromPoint(x, y);
    if (top && (nav.contains(top) || top === nav)) { navPaintsOver = true; probeDetail = `elementFromPoint(${Math.round(x)},${Math.round(y)}) -> ${top.id ? '#' + top.id : top.tagName}`; break; }
  }
  const gap = Math.round(navR.top - r.bottom); // positive = clear gap above nav's top edge
  return { label, elBottom: Math.round(r.bottom), navTop: Math.round(navR.top), gap, navPaintsOver, probeDetail, innerHeight };
}

await startServer();
// webkit.launch() needs neither --no-sandbox nor executablePath here (unlike the
// Mac-Chromium path in scripts/browser.mjs) -- see the header comment above and
// memory/lessons/said-browser-blocked-when-flags-make-it-work.md.
const browser = await webkit.launch();
const report = [];
let crashCount = 0;
// A stalled headless-WebKit page.evaluate() can hang forever with no exception and no new
// output (confirmed in job 20261023-033007-562147: CPU ticks flat, node parked in
// do_epoll_wait, nothing ever landed in the try/catch below). Race every per-screen page op
// against this timer so a silent stall degrades to a logged error for that one screen instead
// of hanging the whole run. Promise.race attaches a handler to the raced-away promise, so a
// late resolution/rejection from the real op after the timer fires does not surface as an
// unhandled rejection.
const OP_TIMEOUT_MS = 15000;
function withTimeout(promise, ms, label) {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`stalled (no response after ${ms}ms): ${label}`)), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}
// Headless WebKit has crashed its own browser process mid-run in this environment (automation
// warning, then a clean process exit) -- without this try/catch, ctx.close() on the next line
// throws an UNHANDLED rejection that kills node before report.json is ever written. Every level
// below is defensive for the same reason: one dead context must not take down the whole run, and
// whatever we DID measure before a crash must already be on disk, not just in memory.
for (const [label, w, tabH, fullH, sat, sab] of PHONES) {
  for (const [mode, h, ins] of [['safari', tabH, [0, 0]], ['homescreen', fullH, [sat, sab]]]) {
    let ctx;
    const errs = [];
    try {
      ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, timezoneId: 'America/Denver', serviceWorkers: 'block' });
      await ctx.route(/supabase/, r => r.abort());
      const page = await ctx.newPage();
      page.on('pageerror', e => errs.push(String(e))); page.on('dialog', dl => dl.dismiss());
      await page.clock.setFixedTime(now);
      await page.goto(URL);
      await page.evaluate(seed => { localStorage.clear(); localStorage.setItem('jk_appVersion', 'v1.0.0'); for (const [k, v] of Object.entries(seed)) localStorage.setItem('jk_' + k, JSON.stringify(v)); }, SEED);
      await page.reload();
      await page.addStyleTag({ content: `html{--sat:${ins[0]}px!important;--sab:${ins[1]}px!important}` });
      await page.waitForFunction(() => document.querySelector('nav') && document.querySelector('nav').style.display === 'flex', null, { timeout: 8000 });
      for (const [scrName, sel, open] of SCREENS) {
        try {
          try {
            await withTimeout(page.evaluate(open), OP_TIMEOUT_MS, `open ${scrName}`);
          } catch (e) {
            report.push({ label, w, h, mode, scr: scrName, error: 'could not open: ' + String(e).split('\n')[0] });
            continue;
          }
          await page.waitForTimeout(350);
          let m;
          try { m = await withTimeout(page.evaluate(measure, sel), OP_TIMEOUT_MS, `measure ${scrName}`); } catch (e) { m = { error: 'measure threw: ' + String(e).split('\n')[0] }; }
          const entry = { label, w, h, mode, scr: scrName, ...m };
          report.push(entry);
          const bad = m.navPaintsOver || (typeof m.gap === 'number' && m.gap < 0);
          if (bad || m.error) {
            const safe = scrName.replace(/[^a-z0-9]+/gi, '_');
            await withTimeout(page.screenshot({ path: `${OUT}/${w}x${h}-${mode}-${safe}.png` }), OP_TIMEOUT_MS, `screenshot ${scrName}`).catch(() => {});
          }
          // Close whatever we opened so the next screen starts clean.
          await withTimeout(page.evaluate(() => {
            document.querySelectorAll('.mo.open').forEach(e => e.classList.remove('open'));
            ['achFull', 'badgeFull', 'recapFull', 'gymYears'].forEach(id => document.getElementById(id)?.classList.remove('open'));
            if (typeof aw !== 'undefined' && aw) { try { aw = null; } catch (_) {} }
            sp('home');
          }), OP_TIMEOUT_MS, `cleanup ${scrName}`).catch(() => {});
          await page.waitForTimeout(150);
        } catch (e) {
          // The page/context itself died mid-screen (e.g. WebKit's own process exited). Record it
          // and stop trying more screens on this now-dead context -- move on to the next phone/mode.
          report.push({ label, w, h, mode, scr: scrName, error: 'browser/context crashed mid-screen: ' + String(e).split('\n')[0] });
          break;
        }
      }
    } catch (e) {
      report.push({ label, w, h, mode, scr: '(context setup)', error: 'context crashed before/during setup: ' + String(e).split('\n')[0] });
    } finally {
      if (errs.length) crashCount += errs.length;
      if (ctx) { try { await ctx.close(); } catch (_) { /* already gone */ } }
      // Write after every context so a later crash (another context, the final browser.close())
      // never loses what we already measured.
      fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
    }
  }
}
try { await browser.close(); } catch (_) { /* already gone */ }
try { stopServer(); } catch (_) {}

const problems = report.filter(r => r.error || r.navPaintsOver || (typeof r.gap === 'number' && r.gap < 0));
for (const r of report) {
  const tag = r.error ? 'ERROR' : r.navPaintsOver ? 'NAV VISIBLE OVER CONTENT' : (r.gap < 0 ? 'OVERLAP (hidden)' : null);
  if (tag) console.log(`[${tag}] ${r.label} ${r.w}x${r.h} ${r.mode} / ${r.scr}${r.error ? ': ' + r.error : ` -- gap=${r.gap}px, last="${r.label}"`}`);
}
console.log(`\n${report.length} screen checks, ${problems.length} with problems, ${report.length - problems.length} clean. Page errors: ${crashCount}`);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
process.exit(problems.length ? 1 : 0);
