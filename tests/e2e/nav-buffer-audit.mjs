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
  // openRecapNow() is gated to the first 7 days of the month (recapMonthToShow) --
  // the audit's fixed clock is the 23rd, so it always returned null and the screen
  // never opened ("no interactive element found"). openRecap(y,m) renders the same
  // markup for any month that has data, bypassing the auto-prompt date gate.
  ['Monthly recap', '#recapFull', () => openRecap(new Date().getFullYear(), new Date().getMonth() - 1)],
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
  // `hist` below is this file's own top-level (Node-side) seed array -- it does not exist
  // as a global inside the page, so page.evaluate(open) threw ReferenceError for every one
  // of these and the screen was never measured. gH() is the in-page function (reads
  // localStorage) that holds the equivalent data once seeded.
  ['Workout detail', '#wdModal .md', () => openWD(gH()[0].id)],
  ['Edit Workout', '#weModal .md', () => openWE(gH()[0].id)],
  // openReorder() silently no-ops on an empty workout (if(!aw.exercises.length) return) --
  // startEmpty() alone left aw.exercises=[] so the modal never opened. Add two exercises first.
  ['Reorder exercises', '#reorderModal .md', () => { startEmpty(); addExToWorkout('Barbell_Bench_Press_-_Medium_Grip'); addExToWorkout('Barbell_Squat'); openReorder(); }],
  // showFinishSummary's markup unconditionally does o.ids.join(...) for the "Save as a new
  // routine" button -- the test object had no `ids`, so this threw before the modal opened.
  ['Finish-workout summary', '#fsModal .md', () => showFinishSummary({ name: 'Push Day', dur: '58:12', ts: 12, vol: 18450, ids: ['Barbell_Bench_Press_-_Medium_Grip'], prList: [{ name: 'Barbell Bench Press', weight: 245, reps: 1 }], sugList: [], progressNotes: [] })],
  ['Plate calculator', '#pcModal .md', () => openPlate()],
  ['Reorder metric cards', '#cardOrderModal .md', () => openCardOrder()],
  ['Reorder routine sections', '#routineOrderModal .md', () => openRoutineOrder()],
  ['Friend profile', '#fpModal .md', () => openFriend('@buddy1')],
  ['Friend badges list', '#fbModal .md', () => showFriendBadges('@buddy1')],
  // openFriendDay() needs p.wd (a friend's shared workout list) and, when a match is found,
  // swaps content into #fpModal -- it never touches #dayModal. #dayModal is YOUR OWN calendar
  // day popup (Home tab), opened only by openDay(ds); the SEED friend has no `wd` entry for
  // 2026-10-01 either, so the old call just toasted an error and nothing opened.
  ['Calendar day detail (own history)', '#dayModal .md', () => openDay(dayKey(gH()[0].date))],
  ['Exercise info', '#exInfoModal .md', () => openExInfo('Barbell_Bench_Press_-_Medium_Grip')],
  ['Add Friend', '#afModal .md', () => openAF()],
  ['Badge-earned-live popup', '#achModal .md', () => om('achModal')],
  // showConfirm() returns a Promise that only resolves on a real click; page.evaluate()
  // awaits whatever its page-side function returns, so returning that promise hung every
  // run for the full OP_TIMEOUT. Call it without returning its result -- the modal still
  // opens synchronously, which is all this audit needs to measure.
  ['Generic confirm dialog', '#confirmModal .md', () => { showConfirm('Delete this?', {}); }],
  ['Cloud-sync prompt', '#cloudPromptModal .md', () => om('cloudPromptModal')],
  // Not dismissable, so never reachable through normal navigation in this harness --
  // opened directly to measure it at all (task brief: "every reachable screen").
  ['Account gate (signed-out/unclaimed)', '#authGate .md', () => om('authGate')],
  // Only wired from a friend's real photo (openAvatarLightbox); a fake URL is enough to
  // measure the layout since the close button's position doesn't depend on the image loading.
  ['Friend photo lightbox', '#avLightbox', () => openAvatarLightbox('https://example.invalid/x.jpg')],
  // --- Worst-case stress variants (2026-10-23): several `.mo.ctr` dialogs looked clean above
  // only because the modest SEED content never made them tall enough to actually need to
  // scroll -- the exact failure mode that hid the Profile/Settings bug (see the long comment
  // on #profModal .md in index.html). These push each one past its max-height on purpose.
  ['STRESS Finish-workout summary (6 PRs + 4 suggested + 4 notes)', '#fsModal .md', () => showFinishSummary({
    name: 'Push Day', dur: '58:12', ts: 24, vol: 18450, ids: ['Barbell_Bench_Press_-_Medium_Grip'],
    prList: Array.from({ length: 6 }, (_, i) => ({ name: 'Exercise Number ' + i, weight: 245, reps: 1 })),
    sugList: Array.from({ length: 4 }, (_, i) => ({ name: 'Suggested Exercise ' + i, weight: 200, reps: 5 })),
    progressNotes: Array.from({ length: 4 }, (_, i) => ({ type: 'up', text: 'Progress note ' + i + ' about this lift trending up.' })),
  })],
  // Longest real showConfirm() call in the codebase (crownInfo(), 269 chars) instead of the
  // short placeholder message above.
  ['STRESS Generic confirm dialog (longest real message)', '#confirmModal .md', () => { crownInfo(); }],
  // Two workouts logged on the same calendar day (the app supports this -- openDay groups every
  // match for that date into one scroll view), each with 8 exercises.
  ['STRESS Calendar day detail (2 workouts, 8 exercises each)', '#dayModal .md', () => {
    const base = gH()[0];
    const manyEx = Array.from({ length: 8 }, (_, i) => ({ ...base.exercises[0], name: 'Exercise ' + i }));
    const extra1 = { ...base, id: 'stress1', name: 'Morning Heavy Push Day — Full Body Strength Session', exercises: manyEx };
    const extra2 = { ...base, id: 'stress2', name: 'Evening Accessories', exercises: manyEx };
    S.s('hist', [extra1, extra2, ...gH()]);
    openDay(dayKey(base.date));
  }],
  // Four years of training history instead of the SEED's ~2 months, for the one full-screen
  // overlay whose shared rule reserves only sab+20px at the bottom with no 62px/navB nav
  // allowance at all (#gymYears) -- same unreserved pattern #recapFull just failed on.
  ['STRESS Gym years (4 years of data)', '#gymYears', () => {
    const base = gH()[0];
    const extra = [];
    const nowPage = new Date();   // page.clock.setFixedTime(now) below makes this equal the Node-side `now`
    for (let y = 0; y < 4; y++) for (let i = 0; i < 60; i++) extra.push({ ...base, id: `stressgy${y}_${i}`, date: new Date(nowPage.getTime() - (y * 400 + i * 5) * 864e5).toISOString() });
    S.s('hist', [...gH(), ...extra]);
    openGymYears();
  }],
  ['STRESS Account gate: setup (confirm-password field shown)', '#authGate .md', () => { document.getElementById('agPass2Wrap').style.display = 'block'; om('authGate'); }],
  ['STRESS Plate calculator (heavy target, many plates/side)', '#pcModal .md', () => { om('pcModal'); document.getElementById('pcTarget').value = 795; document.getElementById('pcBar').value = 45; calcPlates(); }],
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
  // The interactive-only scan above is blind to purely visual content with nothing to tap --
  // #gymYears' day squares (no onclick) are a real example. Separately track the lowest LEAF
  // element (no element children, so a wrapping div's bottom -- which just mirrors its last
  // child -- doesn't win by default) of any kind, so a screen whose bottom-most real content
  // is non-interactive still gets a true "does it clear the nav" answer.
  let lastAny = null, lastAnyBottom = -Infinity;
  for (const el of scope.querySelectorAll('*')) {
    if (el.children.length || !vis(el)) continue;
    if (nav.contains(el)) continue;
    const r2 = el.getBoundingClientRect();
    if (r2.height === 0) continue;
    if (r2.bottom > lastAnyBottom) { lastAnyBottom = r2.bottom; lastAny = el; }
  }
  const gapAny = lastAny ? Math.round(navR.top - lastAnyBottom) : null;
  const anyLabel = lastAny ? (lastAny.id ? '#' + lastAny.id : lastAny.className ? '.' + String(lastAny.className).split(' ')[0] : lastAny.tagName.toLowerCase()) : null;
  return { label, elBottom: Math.round(r.bottom), navTop: Math.round(navR.top), gap, navPaintsOver, probeDetail, innerHeight, gapAny, anyLabel };
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
          const bad = m.navPaintsOver || (typeof m.gap === 'number' && m.gap < 0) || (typeof m.gapAny === 'number' && m.gapAny < 0);
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

const problems = report.filter(r => r.error || r.navPaintsOver || (typeof r.gap === 'number' && r.gap < 0) || (typeof r.gapAny === 'number' && r.gapAny < 0));
for (const r of report) {
  const tag = r.error ? 'ERROR' : r.navPaintsOver ? 'NAV VISIBLE OVER CONTENT' : (r.gap < 0 ? 'OVERLAP (hidden)' : (typeof r.gapAny === 'number' && r.gapAny < 0) ? 'OVERLAP (hidden, non-interactive)' : null);
  if (tag) console.log(`[${tag}] ${r.label} ${r.w}x${r.h} ${r.mode} / ${r.scr}${r.error ? ': ' + r.error : ` -- gap=${r.gap}px, last="${r.label}"`}`);
}
console.log(`\n${report.length} screen checks, ${problems.length} with problems, ${report.length - problems.length} clean. Page errors: ${crashCount}`);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
process.exit(problems.length ? 1 : 0);
