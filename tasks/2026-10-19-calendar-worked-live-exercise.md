# Home calendar: today should light up from an in-progress workout, not just a finished one

## Goal

Mr. Roni's standing rule (2026-10-06, topic 620): "Home calendar highlights a day once
its first exercise is done" — not once the whole workout is Finished. The 2026-10-06 fix
(`9244bba`/`f4d00af`) corrected `renderCal()`'s exclusive if/else so `worked`+`today` can
co-occur, but that same evening at 10:11pm he reported a day with an exercise done still
showing as not-worked — still open per `memory/project/jacked-workout-app.md`. Root cause
found by reading the current code, not reported directly by him this round (he just said
"the calendar bug I addressed on the Jacked app" without detail) — confirm this is really
it during testing, don't just trust the hypothesis.

## Root cause (found, not guessed)

`renderCal()` (`jacked-pwa/index.html:2310-2326`) builds its "worked" set purely from
`gH()` (`jacked-pwa/index.html:1539`, which reads finished-and-saved `hist` entries only).
A workout that's in progress today — logged in the module-level `aw` / `jk_activeWorkout`
(`jacked-pwa/index.html:3217,3226`), with at least one exercise/set done but not yet
Finished — is invisible to `gH()`, so today's cell stays unlit until Finish, exactly
contradicting the "once its first exercise is done" rule. A past day is never affected
(any workout from a prior day is either finished or abandoned by now), so this only ever
shows up as "today, mid-workout, cell still looks unworked" — matches "a day with an
exercise still showing none."

## Done when

1. `renderCal()`'s `worked` check for TODAY also counts the live `aw` when it belongs to
   today (`dayKey(aw.date) === today`) and has at least one set logged as done on any
   exercise — not just what `gH()` already covers. Past days unaffected (still `gH()`-only).
2. Reproduced before the fix: start a workout today, log/check one set, do NOT finish,
   call `renderCal()` (or reload Home) — today's cell does NOT show `worked`. Confirm this
   actually reproduces on current `main` before claiming it's fixed, with a screenshot or
   DOM-class assertion either way.
3. After the fix: same steps — today's cell DOES show `worked` (class `cd worked today`)
   the moment the first set is marked done, without finishing the workout.
4. Finishing (or discarding) the workout afterward doesn't un-light the cell or double it up
   — `gH()` picking the same day back up once it's finished is a no-op visually.
5. No regression to the 2026-10-06 fix itself: a finished workout from today still shows
   `worked`+`today` with no `aw` present (normal post-finish state).
6. A past day with a finished workout: still `worked` only, no `today`. A past day with no
   workout: still `missed`. A future day: still `future`. (Same three checks as the
   2026-10-06 task card — don't let this change regress them.)
7. `node tests/e2e/run.mjs` full suite passes, 0 new failures — report the real pass count.
8. If live-sync paths (`aw`, `saveAW`, `live_workouts`) are touched at all, the `live*`
   suite in `tests/e2e/live.mjs` stays green per VERIFY.md #7 — run it explicitly.
9. Served on localhost (desktop :8090 + Tailscale) for him to test — standing rule, no
   push to `main` without his explicit go this same turn.

## Not doing

- Not touching the Finish/auto-finish logic itself, PR commit, or `jk_hist` — this is a
  display-only read of `aw` for the calendar, not a change to what counts as "finished."
- Not changing friend/leaderboard `miniCal()` — that already combines `worked`+`today`
  and isn't reported broken.
- Not guessing a second time if testing shows this ISN'T what he meant by "the calendar
  bug" — if nothing here reproduces anything resembling what he'd call a bug, stop and
  report that plainly (what was checked, what didn't reproduce) instead of inventing
  another fix.

## Tries

5
