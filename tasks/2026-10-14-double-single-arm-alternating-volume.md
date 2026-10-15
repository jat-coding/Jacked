# Double single-arm/alternating dumbbell volume (workout-total + leaderboard only)

## Goal
26 dumbbell exercises in the library are alternating or single-arm (one dumbbell
worked per rep, not two). Mr. Roni decided their logged weight should count double
toward the workout-total / leaderboard volume stat only — nothing else reads that
differently.

## Done when
1. A pinned `DOUBLE_VOL_IDS` set of the 26 exact library ids exists near `BADGE_STD`
   (no name/regex matching, customs never match).
2. The ×2 applies only at the `totalVolume` accumulation sites (the
   `effWeight(e,s)*reps` reduce patterns, currently ~5 call sites) via one small
   shared helper, not inside `effWeight()` itself.
3. PRs, e1rm, max-weight-of-session, strength-standard ladder scores, and badge
   computations for all 26 ids are byte-identical before/after this change (test
   proves it, not just "looks unaffected").
4. A native set logged against one of the 26 ids contributes 2×weight×reps to
   `totalVolume`; an untouched dumbbell exercise still contributes 1×.
5. Existing stored history's `totalVolume` is untouched — going forward only, no
   migration of past workouts.
6. Hevy-imported workouts are unaffected by the doubling — native sets only (real
   resolved `exId` from in-app logging).
7. Full e2e suite green (`node tests/e2e/run.mjs`), pass count reported.

## Not doing
- Not touching badges, PRs, e1rm, or strength standards.
- Not recomputing any existing history.
- Not applying to Hevy-imported data.
- Not touching the other dumbbell exercises outside the pinned 26.

## Tries
5

## Open questions
None — fully specified by Mr. Roni across this thread (2026-10-14 evening).

## Result (2026-10-14, try 1)
Built. `DOUBLE_VOL_IDS` (26 ids, all verified exact against the real free-exercise-db, 876 entries — no
corrections needed) + `volWeight(ex,s,w)` next to `BADGE_STD`; swapped in at the 5 volume sums only
(live finish summary, liveRecompute, renderWS "lifted", buildFinishRec, saveWE). Imported workouts
(`IMPORTED_ID`) never double, including when edited. New e2e suite `doubleVolume` (26 checks), mutation-
checked 3 ways (doubling in effWeight / no import gate / finish site reverted — each fails the suite).
Full suite 1380/1380; live* 51/51. Committed on local main, not pushed.
