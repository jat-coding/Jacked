# PR badge stale after edit: cardio/hold exclusion from the repair tool

## Goal
Editing a cardio or hold/duration set after it's logged should update its PR badge, not
leave a stale one (reported case: edited a run to 7:24/mi, day-popup kept showing "7:00").
Fix is scoped narrow: extend the existing repair machinery (`commitHistRepair`,
`jacked-pwa/index.html:4745`) to cover cardio/hold, and wire it into `saveWE()` (Edit
Workout save, `index.html:5277`) for cardio/hold exercises specifically — not a general
saveWE-recomputes-on-every-edit-for-every-type rewrite. Also backfill: correct
already-logged stale cardio/hold PR badges on existing history, same one-shot-repair
pattern as `repairBackExtBW`/`repairDipAdded`.

## Root cause (confirmed by reading the code 2026-10-08)
- `saveWE()` (line 5277) writes the edited workout straight into `hist` and never calls
  any PR-repair path, for any exercise type.
- `commitHistRepair(hist2, exIds, at)` (line 4745) is the only function that replays PR
  history after an edit and rewrites `prCount`/`prSets` — but it is currently only called
  by the two one-shot device repairs (`repairDipAdded`, Hevy relabel), never from the live
  edit-workout flow.
- `commitHistRepair`'s own `mine()` filter (line 4750) explicitly drops cardio/hold:
  `filter(p=>exIds.has(p.exId)&&!p.cardio&&!p.hold)`, and it only rewrites `gPR()` (weight
  PRs) — never `gCardioPR()`/`gHoldPR()`. That's the "excluded from the existing repair
  tool" gap.

## Locked spec (Mr. Roni, 2026-10-08 10:42am — do not re-ask)
1. Narrow: extend `commitHistRepair` (and whatever cardio/hold PR storage it needs to
   touch) to cover cardio/hold, and call it from `saveWE()` only for cardio/hold exercises
   touched by that edit. Do not change save/recompute behavior for weight-based lifts —
   out of scope, not reported, don't risk it.
2. Backfill: also run the extended repair once against existing history so already-stale
   cardio/hold PR badges get corrected now (one-shot repair pattern, flagged so it runs
   once per device like `repairBackExtBW`).

## Done when
- [x] `commitHistRepair` (or a cardio/hold-aware variant) recomputes `gCardioPR()` /
      `gHoldPR()` entries, not just `gPR()`, for the touched exercises.
      -- `setRepairedCardioPR`/`setRepairedHoldPR` (stamped `repaired`), called from `commitHistRepair`; checks
      "record falls back to the 9/5 run (7.1 min)", "jk_holdPR back to the 50s hold, stamped repaired" PASS.
- [x] `saveWE()` calls the repair path for any cardio/hold exercise in the edited workout
      whose sets changed, so editing a logged run/hold and reopening its day-popup shows
      the corrected PR immediately (manual Playwright scenario: seed a cardio PR, edit the
      time via Edit Workout, re-render day-popup, assert the new pace shows — this is the
      exact bug report, must be a real regression test, not just reasoning about it).
      -- suite `cardioHoldEdit` (19 checks, 19/19): real modal, `fill('7.24')` + Save Changes, `openDay` shows
      "1 mi · 7:24/mi" and no "7:00". Mutation check: with saveWE un-wired 12 of its 19 checks FAIL.
- [x] A one-shot backfill repair (new `*_REPAIR_FLAG`) walks existing history once per
      device and corrects any stale cardio/hold PR against replay, same shape as
      `repairBackExtBW`/`repairDipAdded`, logged via `console.info('[repair] ...')`.
      -- `repairCardioHoldPRs`, flag `CH_REPAIR_FLAG='jacked_repairCardioHold1'`, cleared by applyBundle; suite
      `cardioHoldBackfill` 13/13 (fixes once, second launch no-op, idempotent with flag cleared, re-fixes after a
      login restore, both `[repair]` log lines asserted). Mutation: boot call removed -> 5 FAIL + crash.
- [x] Weight-based (non-cardio/hold) edit-then-save behavior is unchanged — add/keep a
      test proving a weight-exercise edit still behaves exactly as before (no new
      recompute call fires for it).
      -- suite `weightEditUnchanged` 7/7: spy on `commitHistRepair` = 0 calls for a bench edit and a rename;
      prSets/prCount/jk_prs/jk_cardioPR/jk_holdPR/jk_prRepair byte-identical; editing the run in the same
      workout calls it once with the run only.
- [x] Full suite green: `node tests/e2e/run.mjs`, pass count noted. -- **1135/1135** (pre-change baseline on
      the same base commit: 1096/1096; +39 new checks, 0 regressions; includes all `live*` suites, 53 live checks).
- [x] No new console errors (existing per-tab check). -- every new suite asserts `errors.length === 0`, all PASS.
- [x] `bcd66f7` (duration-tracked holds stopwatch notation, already committed on `staging`,
      never pushed) ships in the same push. -- in the staging push below (needed `--allow-old`, the >12h guard).
- [x] Pushed to `staging` via `scripts/jacked-push.sh --branch staging`, PUSHED/VERDICT
      lines read back verbatim. -- `PUSHED: origin/staging == local HEAD == 7c33135 (read back from GitHub after the push)`
- [ ] Pushed to `main` via `scripts/jacked-push.sh --branch main` (Mr. Roni gave explicit
      go for prod in this same thread, 2026-10-08 10:30–11:32am), PUSHED/VERDICT lines read
      back verbatim. -- **NOT DONE: blocked by the PreToolUse guard** (order-rules jacked-push-must-verify):
      "Pushing Jacked to main needs Mr. Roni's explicit go in his message for THIS turn". The build ran as a
      spawned agent whose turn has no message from him, so the go relayed in the brief doesn't satisfy it.
      Dry run clean: `main local 7c33135 ahead 21 behind 0`. Needs a session with his go in the turn to run
      `cd projects/jacked-wt-prbadge && scripts/jacked-push.sh --branch main --allow-old --expect 7c33135`.

## Not doing
- No general saveWE-recomputes-on-every-edit rewrite for weight-based lifts.
- No UI changes beyond the badge value itself updating correctly.

## Tries
5 build-and-check rounds before stopping to ask.

## Open questions
None — both scope questions already answered 2026-10-08 10:42am.

## Status
2026-10-08 ~11:55am: built, 1135/1135, **pushed to staging (7c33135, BUILD v1.10.74)**. Main push NOT done:
blocked by the main-push guard hook (needs his go in the turn's own message). Also note: Netlify production is
`published 90eda66 locked=True` (2026-10-03), so even GitHub main is not what's live; deploy is a separate go.
Result: research/jacked-pr-badge-cardio-hold-result-20261008.md
