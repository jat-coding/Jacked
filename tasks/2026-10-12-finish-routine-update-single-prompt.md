# Finish workout: one routine-update prompt, not one per exercise

## Goal
When finishing a routine-based workout where exercises were swapped/added/removed, he
should see ONE prompt asking to update the whole routine, not a separate prompt per
exercise change.

## Reported
2026-10-12 7:13pm, voice memo (Jacked room). He swapped two exercises mid-workout and on
Finish was asked separately, once per exercise, whether to update the routine.

## Hypothesis
`finishW` → `maybeApplySwaps` (jacked-pwa/index.html ~5186) batches "effective" switches
into one prompt; `maybeUpdateRoutine` (~5207) separately batches added/removed/reordered
into a second prompt. If one of his two swaps passes `maybeApplySwaps`'s `eff` filter
(~5193-5195) and the other doesn't (e.g. its target exercise was already in the routine),
he gets prompt 1 for one exercise and prompt 2 for the other — reads as "asked per
exercise." Confirm this against the actual code path (repro with two swaps where one's
target pre-exists in the routine), then fix.

## Done when
- [x] A workout with any mix of switches/adds/removes/reorders on a routine produces
      exactly ONE confirm prompt on Finish, covering every change, worded for the whole
      routine (not per-exercise). Confirmed: `tests/e2e/run.mjs`'s `routineSwapPrompt`
      case 1/1b (switch+add+reorder+remove together) now gets exactly one prompt.
- [x] Repro case written first (two swaps, one whose target pre-exists in the routine) and
      shown failing (two prompts) before the fix, passing (one prompt) after. Added case 1c
      (`routineSwapPrompt`): switch B→D (effective) + remove A + switch C→A (target A
      already in the routine, unswapped → "ineffective"). Ran against the pre-fix code
      (`git stash` on `index.html` only) — got 2 prompts: "You switched Bravo Row → Delta
      Press..." then "You removed Charlie Squat...". After the fix: exactly 1 prompt
      naming both. `git stash pop` restored the fix; full suite re-confirmed green.
- [x] Declining the one prompt leaves the routine untouched; accepting applies every
      change together. Confirmed by cases 1, 1b, 1c (decline → routine byte-identical to
      before; accept → routine becomes the session's exact final exercise list).
- [x] Full e2e suite passes, 0 new failures. `node tests/e2e/run.mjs`: **1167/1167 passed**.
- [x] `live*` suite (VERIFY.md #7) still green — Finish touches `aw`/`commitPRs`.
      `JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle,liveFinishEdges
      node tests/e2e/run.mjs`: **51/51 passed**.
- [x] No new console errors. `routineSwapPrompt`'s own "no page errors" check passed; no
      `pageerror` events in any run.
- [x] Committed to `staging` via `scripts/jacked-push.sh --branch staging` (never bare
      push); no push to `main`/prod without his explicit go this turn. Pushed together with
      the second task card's fix in one commit (both bugs share `_finishWContinue`'s
      neighborhood) — see `research/jacked-finish-bugs-result-2026-10-12.md` for the
      pushed SHA and PUSHED/VERDICT lines.

**Fix:** `maybeApplySwaps` and `maybeUpdateRoutine` (jacked-pwa/index.html) were two
separate functions, each calling `showConfirm` on its own — swaps that passed the
"effective" dedup filter got one prompt from the first function (which also wrote the
routine immediately), and anything that filter excluded (an "ineffective" swap, or any
plain add/remove/reorder) got a second, separate prompt from the second function reading a
freshly-refetched (already partially-written) routine. Collapsed both into one
`maybeUpdateRoutine()` that computes effective switches + added + removed in a single pass
against the pristine original routine, builds one combined message, and shows exactly one
`showConfirm` — nothing is written until that single yes/no. `finishW` now calls only
`maybeUpdateRoutine()` (the old `maybeApplySwaps` is gone, no other callers referenced it).

## Not doing
- Not changing what counts as an "effective" switch vs. add/remove, just the number of
  prompts shown.
- Not touching `main`/prod.

## Tries
Default 5.
