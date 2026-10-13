# Switch Exercise picker: category chips not scrollable, Legs+ unreachable

## Goal
In the Switch Exercise / Add Exercise picker (`#aeModal`), the body-map category chip row
(`#aeChips`) doesn't respond to a horizontal swipe on his phone. Only Chest/Back/Shoulders/
Biceps/Triceps are visible; Legs, Glutes, Core, Cardio and Warm-up are unreachable.

## Reported
2026-10-05 8:58pm, Telegram (Jacked room, topic 620), with screenshot:
`bridge/run/photos/-1003926058645_620-1791255516688.jpg`.

## Done when
- [x] Reproduced for real in a browser at a phone-width viewport (390px) with touch
      emulation, in the Switch Exercise picker specifically — not inferred from CSS alone.
      Confirmed `#aeChips` genuinely overflows (scrollWidth 739 vs clientWidth 348) and
      `scrollLeft` sets fine programmatically, so the DOM/CSS layer was never broken.
- [x] Root cause identified: NOT modal-specific, NOT chip-CSS-wide either — it's the global
      body-scroll-lock touch handler (`_popupCanScroll`, index.html:7608) that's active
      whenever ANY modal is open (`.mo.open` matches scroll-lock selector). It only ever
      checked vertical overflow (`scrollHeight`/`overflowY`); a horizontal-only scroller like
      `.chips` never matched, so its `touchmove` got `preventDefault()`'d on every swipe with
      any vertical jitter (nearly always present in a real swipe) while a modal was open.
      `#muscleChips` on the Library page isn't inside a modal, so scroll-lock is never active
      there — that's why only the picker was affected, not every chip row.
- [x] Fix applied: `_popupCanScroll` now checks both axes (scrollWidth/overflowX/scrollLeft
      for dx, same as before for dy); touchmove/wheel handlers now track dx too. Touched only
      index.html:7606-7633 (committed as its own hunk, `git apply --cached` on just that
      range) — the file's other uncommitted diff (OHP/bench dumbbell-credit convention
      reversal, tests/e2e/run.mjs, watch-client/BOARD.md) was stashed during the push and
      popped back immediately after, byte-identical to before.
- [x] After the fix, a real CDP touch-drag (with vertical jitter, matching a real thumb) on
      `#aeChips` moved `scrollLeft` 0 → 391 and the Legs chip became reachable (it was fully
      blocked — 0 movement — before the fix).
- [x] Full e2e suite: 1045/1045 passed, 0 failures.
- [x] No new console errors (suite's own per-tab error check passed).
- [x] Committed (`cfad0ff`) and pushed to `staging` only via
      `scripts/jacked-push.sh --branch staging` — confirmed `origin/staging == local HEAD ==
      63220d2` read back from GitHub. Not touching main/prod.

## Not doing
- Not touching the dumbbell-credit badge math currently uncommitted in the same file.
- Not changing the 10-chip set, their order, or the "selected chip jumps to front" behavior
      locked 2026-10-02 — this is a scroll/visibility bug, not a chip-content change.
- Not pushing to main/prod.

## Tries
5

## Open questions
None blocking — bug is reproducible from his description + screenshot; approach is
investigate-and-fix, not a design decision.
