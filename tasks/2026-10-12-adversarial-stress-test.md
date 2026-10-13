# Adversarial stress test of current staging build

## Goal
He just found two real bugs (double routine-update prompt, Finish stranding him on the
workout screen) by using the app normally — bugs the existing e2e suite didn't catch
because it only exercises the happy path. He wants this version actively attacked for
more bugs/app-breaking failures before he keeps using it, not just a re-run of the
existing green suite.

## Reported
2026-10-12 7:46pm: "Stress test this version of jacked and make sure there aren't any
bugs or app breaking features. This should have been found before."

## Scope — attack, don't just re-run
Model on the 2026-09-18 GPS stress test (memory/project/jacked-workout-app.md: 4 real bugs
found and FIXED, not just described). Priority order:
1. Active-workout → exercise-swap → finish → live-sync pipeline (just touched, proven
   fragile): double-tap Finish, go offline mid-finish, kill the live-claim mid-flight,
   two devices racing on the same live workout, swap/add/remove exercises in every
   combination, rapid repeated swaps of the same slot, finish with 0 sets logged, auto-finish
   racing a manual finish, backgrounding/resuming mid-workout.
2. Routine editing (add/remove/reorder/multi-select, mid-workout exercise creation feeding
   back into the routine — FEEDBACK.md #1's area) and the My Routines reorder modal.
3. Badges/PRs/strength standards (recently resourced — jacked-musclemap-standards job):
   extreme inputs (0, negative-via-UI-if-possible, huge weights/reps), unit switches
   (lb/kg) mid-history, cardio vs weight vs bodyweight vs hold exercises mixed in one
   workout.
4. Import/export, backup/merge (`mergeBackup`'s `jk_hist` rule), and offline/online sync
   transitions generally.
5. Anything else that breaks navigation or leaves the UI in a stuck/inconsistent state —
   that is the "app breaking" bar he named.

### Scenarios actually tried (2026-10-12 run, worktree /tmp/jk-stress-2026-10-12) -- B = real bug found+fixed
1. Finish while an in-flight live sync request never answers -> B1 (stuck on workout screen, lock held)
2. Auto-finish while its re-read never answers -> B1 (never fired; clock stopped)
3. Live sync after one stuck request -> B1 (sync dead for the session)
4. Finish claim lands on server, app killed before local commit, reopen + resume -> B2 (workout lost from history)
5. Switch Exercise onto the exercise already in the slot -> B3 (logged sets wiped)
6. Two devices switch DIFFERENT slots at once (prior session's find, verified here) -> B4 (one switch dropped)
7. Reorder modal open on phone while watch adds an exercise (with a logged set), then drag -> B5 (exercise deleted on both devices)
8. Reorder modal open while watch removes an exercise, then drag -> B5
9. Switch picker open while watch removes that exercise / reorders exercises -> B6 (wrong exercise replaced, sets wiped)
10. Typing a weight while watch removes an earlier exercise; then tapping done on the stale row; typing into a removed exercise -> B7 (wrong exercise, TypeError)
11. Phone finishes offline, starts a new workout offline, reconnects; watch syncs -> B8 (watch offered to fold a finished workout)
12. Same with an unsent set on the watch / with a stale-seen session -> old prompt kept (no data drop), tested
13. Double-tap Finish (two confirms, one OK) -> no bug, one commit
14. Auto-finish fires while "Finish and save?" confirm is open (non-live) -> no bug
15. Finish with 0 sets -> no bug ("No sets logged" asked, one entry)
16. Negative / huge (99,999,999) / non-numeric typed weights+reps -> no bug (negatives become 0; 1e400 not enterable in type=number)
17. lb->kg switch mid-workout, then log more, reload (backgrounded+killed), resume -> no bug
18. Weight + bodyweight + timed hold + cardio in one workout, finish, all tabs -> no bug
19. Routine edit: multi-select add 2 / deselect 1, reorder, replace onto an existing exercise (blocked), save -> no bug
20. Create exercise from inside routine picker (FEEDBACK #1) -> no bug, lands in saved routine
21. Edit routine mid-workout then finish; delete routine mid-workout then finish -> no bug
22. My Routines reorder modal renders with sections -> no bug (drag itself not re-tested beyond existing suite)
23. mergeBackup: union, cloud higher lrev wins, tombstone sticks, idempotent, junk input -> no bug
24. JSON export -> import round trip on a fresh device -> no bug (routines gain sectionId via migration, benign)

## Done when
- [x] List every adversarial scenario actually tried (not just planned), one line each,
      covering at minimum the pipeline-1 list above.
- [x] Every real bug found is FIXED in code, with a regression test added to
      `tests/e2e/` guarding it — a bug that is only described, not fixed, does not count.
- [x] Full e2e suite green after all fixes, pass count stated. (1179/1179)
- [x] `live*` suite (VERIFY.md #7) green, pass count stated. (brief list 51/51; all 15 live suites 88/88)
- [x] Report states plainly how many real bugs were found and fixed, one line each (type
      "0 bugs found" is an acceptable, honest outcome if genuinely true — do not pad the
      list with cosmetic nitpicks to look thorough).
- [x] Committed to `staging` via `scripts/jacked-push.sh --branch staging`; no push to
      `main`/prod without his explicit go this turn.

## Not doing
- Not redesigning anything; this is bug-hunting on the current build, not new features.
- Not filing cosmetic/taste nitpicks as "bugs" unless something is actually broken.
- Not touching `main`/prod.

## Tries
Exploratory — budget up to 8 build/fix rounds before stopping to report back, given the
scope (wider than a normal single-feature task).

## Status 2026-10-12 9:12pm (mid-run, first pass recovered)
First attempt's sub-agent kept re-delegating via run-and-notify instead of doing the work
itself, chained 3 levels deep, and the deepest one was killed by the watchdog mid-run —
but it had already found+fixed 6 real area-1 bugs and pushed them to `origin/staging`
before dying (verified by exact SHA match, not trusted from its own report):
- `cd17752` union concurrent live exercise-switches instead of dropping one
- `d04da8c` finish/auto-finish no longer waits forever on a live sync that never answers
- `e91e0c1` Finish saved even if the app dies right after the server accepts it;
  switch-to-self no longer wipes logged sets
- `0165c0e` Reorder Exercises keys rows by live id, a stale list can't delete the wrong one
- `0d281db` Switch Exercise re-finds its slot by live id at pick time
- `9220b4a` workout screen maps stale drawn indices to live ids during a held-back redraw

Areas 2–5 (routines, badges/PR math, import/export, offline sync) not yet attacked. The
watchdog auto-relaunched a fresh attempt, `20261012-201005-3342358` (Opus, writing its own
output file directly this time), picking up from this improved staging state to cover the
rest. Checkboxes above stay unchecked until that run reports back.

## Result (2026-10-12)
8 real bugs found and fixed, 7 commits on staging (cd17752..193d740, pushed, read back as
origin/staging == 193d740). Report: ~/agent/research/jacked-stress-test-result-2026-10-12.md
