// Shared by nav-buffer-audit.mjs (WebKit) and the navOverlap e2e suite (Chromium): the seed + every screen opener.
export const now = new Date('2026-10-23T02:00:00-06:00');
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
export const SEED = {
  prof: { name: 'Jat Lifter', username: '@jatlift', code: '@jatlift', sex: 'male', birthday: '2000-07-10' },
  bw: 229 / LB, hist, prs: {}, cex: [], friends: [{ code: '@buddy1', name: 'Training Buddy', days: ['2026-10-01', '2026-10-03', '2026-10-05'] }],
  routines: [{ id: 'r1', name: 'Upper Body Strength & Hypertrophy', desc: '', exercises: ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Squat'] },
             { id: 'r2', name: 'Legs', desc: '', exercises: ['Barbell_Squat'] }],
  settings: { wUnit: 'lb' },
};

// Each opener runs in-page. `sel` is the real scroll container for that screen (scrolled to its
// true bottom before measuring) -- the .md child for a .mo sheet, the overlay itself for a
// full-screen one, #jkRoot for an ordinary tab page.
export const SCREENS = [
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
