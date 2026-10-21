# Suggested vs. documented PR

## His words (verbatim, in order)

Voice memo, 2026-10-20 ~6:04pm MDT:
> "For the one-rep-max formula, that shouldn't establish the PR. That should just be a
> suggested PR. So anything calculated at that point should just be suggested and not
> documented as the person's PR, unless they actually lift that kind of weight."

Tap answers, same day:
> 1. Should a suggested PR (from an estimated 1-rep max, not an actual 1-rep lift) show
> anywhere in the app, or stay fully hidden until confirmed? → **Show it, labeled "suggested"**
> 2. Once you actually lift that weight for real, should it auto-become the official PR,
> or do you want to confirm it yourself? → **Auto-promote once logged for real**

Follow-up message, same day, while the first build was already running (supersedes the
"Design decision needed" section below — **this is the real rule, not a guess**):
> "Yes show the PR as it was prioritize the higher weight for exercise PRs not the combined
> weight of the reps. And then if the PR is for multiple weights then show the suggested PR"

Meaning, confirmed by this session's reading (state this reading back to him in the
hand-back so he can correct it if it's wrong, same as before, but build to it now): the
**documented** PR for an exercise is whichever actually-lifted set has the highest raw
weight, full stop — never the e1RM-combined/rep-adjusted number, and this applies between
two real lifts too (a real 1-rep 200 lb set stays the documented PR over a real 3-rep 190 lb
set, even though `e1rm(190,3)` > 200). The **suggested** PR is a separate, second number:
whenever `e1rm(best.weight,best.reps)` implies a higher 1RM than the current documented raw
weight, show that implied number as "suggested" — alongside the documented PR, not
replacing it, until some set's own raw weight actually reaches the suggested number, at
which point raw-weight PR update naturally takes over and that becomes documented.

## Goal

A new best e1RM that only ever came from an estimate (a set with reps ≥ 2) shows up as a
labeled "suggested" PR, not a real documented one — until a set is actually logged whose
real weight reaches what the estimate implied, at which point it promotes automatically to
a real PR, with no extra step from him.

## How today's code works (read before building)

- `e1rm(w,reps)` (jacked-pwa/index.html:4298): raw weight at 1 rep, `w*(1+reps/30)`
  (Epley) at 2+ reps. `prE1rm(pr)` (4299) applies it to a stored PR record.
- `prBest(ex)` (5063): per exercise, the best PR-eligible set this workout, by `e1rm`.
- `commitPRs(workout)` (5090): **live path**, runs once at Finish. For weight exercises,
  if `e1rm(best.weight,best.reps) > prE1rm(prev)`, overwrites `prs[exId]` (`jk_prs` in
  storage) with `{weight:best.weight, reps:best.reps, date}` — this is the write that
  currently documents an estimate-only beat as a real PR.
- `prReplay()` (5148): **history path**, rebuilds the same thing by replaying all of
  history — must agree with `commitPRs` byte for byte (comment at 5059 and 5127: "so they
  cannot drift" / "same record jk_prs keeps"). Any change to the live rule needs the
  matching change here too, or displayed PR counts disagree with the live finish screen.
- `jk_prs` also goes through cloud merge (`mergePRs`, referenced ~8328) and is read by
  `prsOf` (display/count, see 5137's comment: "refuses to show anything that disagrees
  with the stored prCount") and the finish-screen PR list (`prList` at 5780, star badge
  rendering ~3982-4066, 5963).
- Imported workouts (Strong import, `IMPORTED_ID` 5138) use a *different* rule (raw
  weight/reps comparison, no `e1rm`) — they're already "actually lifted", not estimates,
  so they're out of scope for "suggested" and should always write a real PR as today.

## The rule (superseded, see his follow-up message above — this is now locked, not a guess)

- **Documented PR** (`prs[exId]` / `jk_prs`, what shows as the real PR everywhere): the
  highest raw weight ever actually lifted for that exercise, at any rep count. Update rule:
  `best.weight > prev.weight` (strictly raw weight — do not use `e1rm` to decide this
  comparison at all, including between two real logged sets at different rep counts).
- **Suggested PR** (new, separate record): whenever `e1rm(best.weight,best.reps) >
  e1rm(prev.weight,1)` (i.e. the rep-adjusted estimate implies a 1RM higher than the current
  documented raw weight) but `best.weight` itself did not beat `prev.weight`, store/update a
  suggested record carrying the implied weight. It shows labeled "suggested", alongside the
  documented PR, not replacing it — his words: "if the PR is for multiple weights then show
  the suggested PR", i.e. both can be on screen at once at different numbers.
- **Promotion**: no separate promotion step needed beyond the documented-PR rule itself —
  the first time any set's raw weight actually reaches/exceeds the suggested record's
  implied weight, that set's raw weight becomes a new documented PR under the ordinary rule
  above, and the now-redundant suggested record (implied weight ≤ the new documented weight)
  is cleared. A suggested record whose implied weight is still above the (possibly also
  newly updated) documented weight stays visible.
- A real 1-rep lift already has `e1rm(w,1)===w`, so for reps==1 the two rules agree exactly
  with today's behavior — nothing changes there.

## Done when

1. A logged set whose `e1rm(weight,reps)` implies a higher 1RM than the current documented
   PR's raw weight, but whose OWN raw weight does not itself beat the documented PR's raw
   weight, is stored as a **suggested** PR (new field/record, not overwriting the
   documented one) and shows in the UI labeled "suggested" — both right after Finish (the
   PR list/toast) and wherever PRs are shown elsewhere (exercise detail / metrics / badge) —
   alongside the documented PR, both visible at once when both exist.
2. A logged set whose raw weight beats the current documented PR's raw weight becomes the
   new documented PR immediately — regardless of its own rep count, and regardless of
   whether some other, lower-weight set has a higher `e1rm`. (This also covers today's
   existing reps==1 / imported-workout behavior, unchanged.)
3. Once a later set's raw weight reaches/exceeds a standing suggested PR's implied weight,
   that weight becomes the documented PR (covered by rule 2) and the now-redundant
   suggested record is cleared. No tap/confirm needed. A suggested record whose implied
   weight is still higher than the (possibly updated) documented weight stays shown.
4. `commitPRs` (live, at Finish) and `prReplay` (history) still agree with each other for
   every case above — the two must be edited together, not just one.
5. Cloud merge (`mergePRs`) merges a suggested PR sanely (doesn't silently drop it, doesn't
   let a stale suggested on one device clobber a documented PR on another).
6. Full e2e suite green (note the pass count), plus the `live*` suite
   (`JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle,liveFinishEdges`)
   green — `commitPRs` is directly touched (VERIFY.md #7).
7. An adversarial repro, written first, for: a suggested PR on one device + a real
   promotion-worthy lift logged on another device before they sync (VERIFY.md #10 standard
   — this is exactly the double-write risk the live suite exists to catch).
8. Verified against real exercise data (`dist/exercises.json`), not a made-up exercise name
   (VERIFY.md #3).

## Not doing

- Changing anything about cardio or timed-hold PRs (`isCardio`/`isHold` paths) — his words
  only talked about the "one-rep-max formula," which is the weight-lift path.
- Changing the imported-workout PR rule.
- A manual confirm UI for promotion — answer 2 was auto-promote.

## Reference

none (no visual reference given; a small label/badge change, not a redesign).

## Tries

5

## Open questions

None blocking — the raw-weight-promotion definition above is a stated default, correctable
on hand-back rather than asked up front (batching with the two questions already answered
today).

## Results (build 2026-10-20 18:53, final)

Prior superseded run was still running and editing the same file at 18:55; stopped it (pid 949262) before building.
Its `prWeightStep` picked the documented PR by e1RM among sets at least as heavy as the PR; rewritten to raw weight only.

Built:
- `prWeightStep`: documented = heaviest real set (strictly heavier raw weight than the PR; tie inside a workout -> more
  reps). Suggested = best e1RM set when its implied 1RM is above the documented raw weight (+0.05 kg display tolerance) and
  above the old suggestion. A multi-rep documented PR also shows its own estimate as suggested (his "if the PR is for
  multiple weights then show the suggested PR").
- `commitPRs` / `prReplay` share it. Replay runs today's rule over ALL history for the record chain (`docEnd`/`sugEnd`);
  pre-rule workouts keep the stars/prCount they were saved with (separate `leg` chain). `replayRecord` reads `docEnd`.
- `mergePRs`: documented records merge by raw weight (tie -> reps); suggestions by implied 1RM, then pruned against the
  merged documented record.
- `enforceDocumentedPRs()` at launch: raises a legacy e1RM-picked record (e.g. 190 x 3 over a real 200 x 1) to the
  heaviest real lift and keeps the old estimate as suggested. Only raises (> 0.01 kg); skips PR-reset and
  body-weight-loaded exercises; repaired exercises go through `setRepairedPR`.
- Display: finish screen "Suggested PRs", workout card tag + set "S", exercise info "Suggested PR" block next to the
  real PR, library row, past-workout view and calendar day tag.

Done-when:
1. PASS (suggestedPR: finish screen, live card, exercise info, library row, past workout; both shown at once)
2. PASS (200 x 1 stays over 190 x 3; 205 x 1 documents despite a 180 x 10 in the same workout; same weight more reps does not)
3. PASS (262 x 1 promotes and clears; lifting the rounded shown number clears it; 240 x 1 short of it keeps it)
4. PASS (commitPRs vs prReplay agree for every workout and final records, also after a history repair)
5. PASS (merge: stale suggestion never clobbers a heavier documented PR; one-sided suggestion kept; raw-weight merge both ways)
6. PASS full suite 1583/1583; live subset (VERIFY #7 list) 51/51; plus liveSugPromote
7. PASS suggestedPRTwoDevices + liveSugPromote (written by the first run before its fix; re-verified here). Mutation
   check: e1RM-decides-documented mutant failed 16 checks; e1RM merge mutant failed the merge check.
8. PASS real free-exercise-db entries (Bench Press medium grip, Barbell Squat, Barbell Deadlift)

Fresh-context review (claude -p, read-only): 1 medium (display-rounding: lifting the shown suggested number did not clear
it) FIXED; repaired exercises skipped by the legacy fix FIXED; pre-reset suggestion via setRepairedPR FIXED; comment FIXED.
Not fixable here: the watch app (watch-client) still commits jk_prs by e1RM (watch-client/API.md:315).

Not pushed. Local commit only, needs Mr. Roni's go to push.
