# Finish workout can silently strand the user

## Goal
Tapping Finish → Yes must always either complete (save to history, go home, home shows the
workout) or show a clear error — never leave him stuck on the active-workout screen with
nothing saved and no feedback.

## Reported
2026-10-12 7:13pm, voice memo (Jacked room). Confirmed "Finish and save this workout?" with
Yes, stayed on the workout screen; home page never updated to show it done.

## Hypothesis
`_finishWContinue` (jacked-pwa/index.html ~5271) → live-claim path (~5280-5293):
`busy.then(() => liveClaimFinish(liveWire(aw))).then(r => { if(!r || !aw || aw.id!==id)
return; ... })`. If `liveClaimFinish` fails/rejects/returns falsy (offline, slow network,
server error), this silently returns without ever calling `_commitFinish` — nothing is
written to history, `_finLock` may stay set, and the user is stuck. Repro by forcing
`liveClaimFinish` to fail/reject (simulate offline or stub a failing response) and confirm
the stuck state, then fix so a failed/dropped claim falls back to a local commit (like the
existing `!liveOn()` branch at ~5280-5282) or surfaces a retry, instead of hanging silently.

## Done when
- [x] Repro written first: force `liveClaimFinish` to fail/reject, show the current bug
      (stuck on workout screen, home unchanged) before the fix. Added
      `tests/e2e/live.mjs`'s `liveFinishClaimFails`: monkeypatches `window.liveClaimFinish`
      to reject (and separately, to resolve to `null`), then calls `_finishWContinue(false)`.
      Ran against the pre-fix code (`git stash` on `index.html` only) — confirmed the bug:
      `{"aw":true,"hist":[]}` (still on the workout screen, nothing saved), plus an uncaught
      page error ("Error: stub claim failure") since the old promise chain had no `.catch()`.
      `git stash pop` restored the fix.
- [x] After the fix, the same forced failure still results in the workout finishing
      (history written, navigated home, home reflects it) or a visible error state the
      user can act on — never a silent hang. Confirmed: `aw` is null, history has exactly
      one entry for the session, `_commitFinish` ran (stats.commits===1), and
      `document.getElementById('page-home')` is the active screen. Chose the local-commit
      fallback (not an error dialog) — the offline branch two lines up already proves a
      local commit is always safe, and it queues the doc via `liveQueueFinish` so the
      server catches up later, same as the existing offline-finish path.
- [x] `_finLock` is always released on every exit path (success, fallback, error) so a
      second Finish attempt isn't itself blocked. Added `_finishLocalFallback()` (shared by
      the new `.catch()` and the `!r` case) which always either commits (clearing `aw`,
      which neutralizes the lock) or explicitly nulls `_finLock` when `aw` already changed
      out from under it. Confirmed by starting a fresh workout immediately after the forced
      failure — it begins normally, not blocked.
- [x] Full e2e suite passes, 0 new failures. `node tests/e2e/run.mjs`: **1167/1167 passed**.
- [x] `live*` suite (VERIFY.md #7) green, specifically `liveFinishOnce`/`liveFinishLock`/
      `liveFinishEdges` — this is exactly the path they guard.
      `JK_ONLY=liveWrites,liveConcurrent,liveFinishOnce,liveFinishLock,liveLateSets,liveLifecycle,liveFinishEdges
      node tests/e2e/run.mjs`: **51/51 passed** (includes the new `liveFinishClaimFails`
      added to `LIVE_SUITES`, which the full run already covers via its `...LIVE_SUITES`
      spread).
- [x] No new console errors. No `pageerror` events once the fix is in place (the pre-fix
      run above is the only place one showed up, by design, confirming the repro).
- [x] Committed to `staging` via `scripts/jacked-push.sh --branch staging` (never bare
      push); no push to `main`/prod without his explicit go this turn. See
      `research/jacked-finish-bugs-result-2026-10-12.md` for the pushed SHA and
      PUSHED/VERDICT lines (committed together with the routine-update-prompt fix).

**Fix:** `_finishWContinue`'s live-claim promise chain
(`busy.then(()=>liveClaimFinish(...)).then(r=>{...})`) had no `.catch()` at all, so a
rejected claim became an unhandled rejection: `_commitFinish` never ran, `aw` stayed set,
`_finLock` stayed set, and the screen never changed. Added a `.catch()` that calls a new
`_finishLocalFallback(id,endTs)` helper, and split the old combined
`if(!r||!aw||aw.id!==id) return;` so a merely-falsy (but not rejected) result also falls
back to a local commit instead of silently returning. `_finishLocalFallback` mirrors the
existing `!liveOn()` offline branch (queue the doc for later, then `_commitFinish`), and
explicitly nulls `_finLock` in the one case where `aw` already changed out from under it
(so that path doesn't rely on a commit to neutralize the lock).

## Not doing
- Not redesigning the live-claim CAS protocol, just making its failure path safe.
- Not touching `main`/prod.

## Tries
Default 5.
