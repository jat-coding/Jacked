# Single/Both weight-entry button

## Goal
Add a "Single" / "Both" button pair to the set-entry row for the 105 dumbbell
exercises in jacked-single-both-list.pdf (sent to Mr. Roni, confirmed go
2026-10-16). Single marks that set as single-arm, which doubles its logged
weight toward workout total volume / leaderboards only. Both leaves it as
entered. This replaces the 10-14 automatic-by-exercise-name doubling
(`DOUBLE_VOL_IDS`/`volWeight()`, jacked-pwa/index.html ~4318-4336) with an
explicit per-set, user-chosen flag, and extends coverage from 26 exercises to
105.

## Done when
1. The master applicable-exercise set is exactly the 105 exact library ids
   from the PDF (32 "always single" + 73 "toggle candidates" — see the task
   notes below for both name lists). Verify ids against the real
   free-exercise-db dataset the app already pulls from DB_URL, same
   convention as the existing DOUBLE_VOL_IDS (exact ids, no name regex,
   customs never match).
2. For any exercise in that set, each set row in the active workout
   (renderWS(), ~index.html:3990-4018) shows a Single/Both button pair next
   to the weight input. Default selection on a new set: Single pre-selected
   for the 32 "always single" names, Both pre-selected for the other 73 —
   but BOTH groups get a real, tappable button pair; nothing is button-less.
   Tapping toggles a per-set boolean (e.g. `s.single`), persists via the same
   save path `uSet`/`addSet` already use (saveAW()).
3. `volWeight(ex,s,w)` (~index.html:4336) uses the per-set flag instead of
   exercise-id membership: doubles `effWeight(ex,s)` when `s.single===true`
   and the set is native (`!IMPORTED_ID.test(w.id)`), same as today. For
   ALREADY-LOGGED sets from before this build that have no `single` field
   yet, fall back to the old `DOUBLE_VOL_IDS.has(ex.exId)` check so existing
   history's totals don't change (going-forward-only rule still holds).
4. PRs, e1rm, badges and strength-standard scoring are unaffected — confirm
   `effWeight()` itself and every PR/e1rm/badge/standard call site still pass
   the un-doubled weight (same isolation `volWeight()` already has today,
   per the 10-14 decision in memory/project/jacked-single-arm-alternating-
   dumbbell-audit-2026-10-14.md — don't widen the blast radius).
5. Toggling Single/Both on a set during an ACTIVE shared workout (live
   sync) reaches the other device: VERIFY.md #7's live suite
   (`JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,
   liveLateSets,liveLifecycle,liveFinishEdges node tests/e2e/run.mjs`) stays
   green after adding the field to saveAW()'s diff stamping.
6. Read `git log origin/main -- watch-client/` (VERIFY.md #9) before
   touching the set data shape — the watches may read sets directly; note
   in the result whether this needs a watch-side change too (don't build
   the watch side, just flag it).
7. `node tests/e2e/run.mjs` full suite passes, 0 new console errors — report
   the real pass count.
8. `git status` clean commit on local `main` only — no push to
   `origin/main` or Netlify without a separate explicit go.

## Not doing
- Retroactive recompute of existing logged history (going-forward only,
  same as 10-14).
- Hevy-imported workouts (native sets only, same as 10-14).
- Any watch-client code change (flag only, per #6).
- Exercises outside the 105-name list sent in the PDF.

## Tries
5

## Open questions
None — scope confirmed 2026-10-16 (voice memo: apply the button to every
exercise in the PDF, single doubles logged weight for leaderboard total
weight only, both leaves it as entered).

## The 105 names (exact library ids, underscores for spaces, as used in
DOUBLE_VOL_IDS today)

Always-single (32) — default Single pre-selected:
Alternate_Hammer_Curl, Alternate_Incline_Dumbbell_Curl, Alternating_Deltoid_Raise,
Concentration_Curls, Dumbbell_Alternate_Bicep_Curl,
Dumbbell_Lying_One-Arm_Rear_Lateral_Raise, Dumbbell_Lying_Pronation,
Dumbbell_Lying_Supination, Dumbbell_One-Arm_Shoulder_Press,
Dumbbell_One-Arm_Triceps_Extension, Dumbbell_One-Arm_Upright_Row,
Dumbbell_Side_Bend, External_Rotation, Lying_One-Arm_Lateral_Raise,
One_Arm_Dumbbell_Bench_Press, One_Arm_Dumbbell_Preacher_Curl,
One_Arm_Pronated_Dumbbell_Triceps_Extension,
One_Arm_Supinated_Dumbbell_Triceps_Extension, One-Arm_Dumbbell_Row,
One-Arm_Flat_Bench_Dumbbell_Flye, One-Arm_Incline_Lateral_Raise,
One-Arm_Side_Laterals, Seated_Bent-Over_One-Arm_Dumbbell_Triceps_Extension,
Seated_One-Arm_Dumbbell_Palms-Down_Wrist_Curl,
Seated_One-Arm_Dumbbell_Palms-Up_Wrist_Curl,
See-Saw_Press_Alternating_Side_Press, Standing_Alternating_Dumbbell_Press,
Standing_Bent-Over_One-Arm_Dumbbell_Triceps_Extension,
Standing_Concentration_Curl, Standing_One-Arm_Dumbbell_Curl_Over_Incline_Bench,
Standing_One-Arm_Dumbbell_Triceps_Extension,
Standing_Palm-In_One-Arm_Dumbbell_Press

Toggle (73) — default Both pre-selected:
Arnold_Dumbbell_Press, Around_The_Worlds,
Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench, Bent_Over_Two-Dumbbell_Row,
Bent_Over_Two-Dumbbell_Row_With_Palms_In, Bent-Arm_Dumbbell_Pullover,
Close-Grip_Dumbbell_Press, Cross_Body_Hammer_Curl, Cuban_Press,
Decline_Dumbbell_Bench_Press, Decline_Dumbbell_Flyes,
Decline_Dumbbell_Triceps_Extension, Dumbbell_Bench_Press,
Dumbbell_Bench_Press_with_Neutral_Grip, Dumbbell_Bicep_Curl,
Dumbbell_Floor_Press, Dumbbell_Flyes, Dumbbell_Incline_Row,
Dumbbell_Incline_Shoulder_Raise, Dumbbell_Lying_Rear_Lateral_Raise,
Dumbbell_Prone_Incline_Curl, Dumbbell_Raise, Dumbbell_Scaption,
Dumbbell_Shoulder_Press, Dumbbell_Shrug, Dumbbell_Tricep_Extension_-Pronated_Grip,
Flexor_Incline_Dumbbell_Curls, Front_Dumbbell_Raise, Front_Incline_Dumbbell_Raise,
Front_Two-Dumbbell_Raise, Hammer_Curls, Hammer_Grip_Incline_DB_Bench_Press,
Incline_Dumbbell_Bench_With_Palms_Facing_In, Incline_Dumbbell_Curl,
Incline_Dumbbell_Flyes, Incline_Dumbbell_Flyes_-_With_A_Twist,
Incline_Dumbbell_Press, Incline_Hammer_Curls, Incline_Inner_Biceps_Curl,
Lying_Dumbbell_Tricep_Extension, Lying_Rear_Delt_Raise, Lying_Supine_Dumbbell_Curl,
Middle_Back_Shrug, Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench,
Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench, Power_Partials,
Preacher_Hammer_Dumbbell_Curl, Reverse_Flyes, Reverse_Flyes_With_External_Rotation,
Seated_Bent-Over_Rear_Delt_Raise, Seated_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension,
Seated_Dumbbell_Curl, Seated_Dumbbell_Inner_Biceps_Curl,
Seated_Dumbbell_Palms-Down_Wrist_Curl, Seated_Dumbbell_Palms-Up_Wrist_Curl,
Seated_Dumbbell_Press, Seated_Side_Lateral_Raise, Seated_Triceps_Press,
Side_Lateral_Raise, Side_Laterals_to_Front_Raise,
Standing_Bent-Over_Two-Arm_Dumbbell_Triceps_Extension, Standing_Dumbbell_Press,
Standing_Dumbbell_Reverse_Curl,
Standing_Dumbbell_Straight-Arm_Front_Delt_Raise_Above_Head,
Standing_Dumbbell_Triceps_Extension, Standing_Dumbbell_Upright_Row,
Standing_Inner-Biceps_Curl, Standing_Palms-In_Dumbbell_Press,
Straight-Arm_Dumbbell_Pullover, Tricep_Dumbbell_Kickback,
Two-Arm_Dumbbell_Preacher_Curl, Zottman_Curl, Zottman_Preacher_Curl

## Result (2026-10-16, build commit 93324d3 on local main, not pushed)

1. PASS. SINGLE_DEFAULT_IDS (32) + SINGLE_BOTH_IDS (105) in index.html. All 105 checked against the real free-exercise-db (876 entries, fetched from DB_URL): all exist, all equipment "dumbbell", none duplicated. The test asserts the exact two lists both ways. Customs never match (exact ids).
2. PASS. Pair sits between weight and reps (new "Arm" column) on every set row of all 105 (test adds all 105 the real way via addExToWorkout and checks each row). Defaults: Single for the 32, Both for the 73. Barbell lifts and dumbbell lifts outside the list (e.g. Tate_Press) get no pair. Tap -> setSingleArm -> s.single -> renderWS -> saveAW; survives a reload. Screenshot: /tmp/jk16/shots/single-both-row.png (fits 390px).
3. PASS. volWeight doubles when setSingle(ex,s) is true and the workout is native. A set with no s.single (saved before this build) falls back to DOUBLE_VOL_IDS, so old totals hold (test: 3 seeded totals stay 777). Sets without a flag in an OPEN workout (new set, watch-added set, workout open since before the build) get their default stamped on render and again at Finish (stampSingle).
4. PASS. effWeight unchanged; setSingle only read by volWeight; volWeight still only at the 5 volume sums. Test: PRs commit logged weight (20/15/50 lb), effWeight ignores the flag; doubleVolume's PR/e1rm/standards/badges identity check still passes.
5. PASS. Live set (liveWrites, liveConcurrent, liveFinishOnce, liveFinishLock, liveLateSets, liveLifecycle, liveFinishEdges): 51/51. No saveAW change was needed: liveSig already stamps every set field. New liveSingleBoth (6/6): a tap on one device reaches the other; a toggle racing another set's edit, both survive; the finished total counts the synced choices.
6. DONE (flag only). git log origin/main -- watch-client/: Phil's d661e4d (2026-10-16) asks whether the watches should double the 26 DOUBLE_VOL_IDS too, and says they will by default. That default is now stale. Watch-side change needed: read s.single per set for the running total and the finished totalVolume, and keep s.single when editing a set (A17 merge is whole-set newest-wins, so a watch that rewrites a set without the field drops his choice). Not built, per scope.
7. PASS. node tests/e2e/run.mjs: 1454/1454 passed, exit 0. All 133 per-page no-errors checks pass.
8. PASS. Clean commit on local main only; origin/main untouched (local 2 ahead / 2 behind, same 2 behind as before). No push, no Netlify.

Mutation checks (VERIFY #7): removing `single` from live stamping failed 3 live checks; skipping stampSingle failed 7; reverting volWeight to the by-id rule failed 5. Restored and re-ran green.
