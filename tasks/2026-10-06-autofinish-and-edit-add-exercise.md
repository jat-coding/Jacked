# Auto-finish stale workouts + edit-workout add-exercise

## Goal
Two related requests from the same evening: (1) a forgotten active workout should
auto-finish sooner and more reliably than the existing load-time-only check, locking in
typed sets; (2) a finished workout's edit sheet should let you add an exercise, not just
remove one.

## Reported
2026-10-05 10:42-10:51pm, Telegram (Jacked room, topic 620).

## Done when
- [x] Auto-finish fires at 30min idle OR 70min total, whichever first (his decision).
- [x] Typed-but-unchecked sets are marked done before the auto-finish totals are computed.
- [x] The check runs live (every timer tick) as well as on load, so it isn't limited to
      "only catches it on the next reload."
- [x] Notice still shows (toast) -- satisfies "tell me next time I open the app" via the
      load-time path; the live path shows it immediately if the app happens to still be open.
- [x] Edit Workout sheet has a working "+ Add Exercise" that reuses the existing picker.
- [x] Picker renders correctly stacked above the edit sheet (both open at once).
- [x] Adding an exercise already in the workout is a no-op, not a duplicate.
- [x] Full e2e suite passes after both changes, 0 failures: 1045/1045.
- [x] Committed as two separate commits (auto-finish: 1187d72; edit-add-exercise: b487c03),
      pushed to `staging` only.

## Not doing
- Not pushing to main/prod without his go.
- Not changing manual Finish's behavior (confirmation prompt, no auto-marking of typed sets).

## Tries
1 each (built and verified first pass)
