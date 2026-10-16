# Hide destructive actions behind a reveal step

## Goal
Routines page: replace the pencil (edit) + ✕ (delete) buttons shown directly
on each routine card with a single 3-dot (⋮) button that reveals an Edit /
Delete menu on tap — no destructive action visible at first glance. Build
this now. Separately, audit every other screen in the app with a delete
button exposed by default (no reveal step) and report the full list back to
Mr. Roni so he can authorize which ones get the same treatment — do NOT
change those other screens in this pass.

## Done when
1. `routineCardHtml()` (jacked-pwa/index.html ~2846-2856) no longer renders
   the pencil/✕ pair directly on the card. A single 3-dot button opens a
   small menu/popup with "Edit" and "Delete" rows.
2. Tapping Edit from that menu calls the same `editR(id)` path as today;
   tapping Delete calls the same `delR(id)` path, which still runs its
   existing `showConfirm('Delete this routine?')` gate — the confirm step is
   unchanged, only the exposure of the Edit/Delete affordance itself changed.
3. The menu closes on an outside tap, on Escape, and after choosing either
   action (reuses the app's existing popup-close conventions — check how
   other small popups in this app close, don't invent a new mechanism).
4. Works at 390px width, tap targets are real tap-size (not finger-tip
   precision), no regression to drag-reorder on My Routines if that exists
   on this screen.
5. `node tests/e2e/run.mjs` full suite passes, 0 new console errors —
   report the real pass count.
6. Separately: a full audit of the REST of the app for any delete action
   exposed without a reveal/confirm-adjacent step — specifically check
   `#wdDel` "Delete Workout" footer button (~index.html:877), Exercise
   Library's "Delete Exercise"/"Hide from Library" button (~index.html:2428),
   and the routine editor's per-exercise "Delete" row button (~index.html
   :2974), plus grep the file for any other bare delete/remove button not
   already covered. For each, note: screen name, what it deletes, current
   exposure (always visible vs. already behind a tap/menu/long-press), and
   whether a reveal step is practical there without hurting the
   grounds-have-to-work (e.g. a "last set" quick-remove might legitimately
   want to stay one-tap). Do NOT build any of these — list only, in the
   result report.
7. `git status` clean commit on local `main` only (Routines change only) —
   no push to `origin/main` or Netlify without a separate explicit go.

## Not doing
- Changing any delete affordance outside the Routines page in this pass —
  audit and report only, he authorizes per-item or in bulk afterward.
- Changing the confirm-dialog wording/behavior itself.

## Tries
5

## Open questions
None — scope confirmed 2026-10-16 (Routines built now; everything else
audited and reported for his authorization, not built).

## Results (2026-10-16, try 1)
Built: card's pencil/X replaced by one 44x44 3-dot button (`.rc-more`) opening a new `.mo`
sheet `#rMenuModal` (title = routine name, rows "Edit routine" / "Delete routine").
`openRMenu(id)` / `rMenuPick(act)`: pick closes the sheet, then calls the unchanged
`editR(id)` / `delR(id)`; `delR`'s `showConfirm('Delete this routine?')` untouched. Being a
plain `.mo`, it gets the existing backdrop-tap close, Escape/Android-back via
`closeTopPopup`/`POPUP_SEL`, popup history entry and scroll lock, no new mechanism.

1. PASS - no pencil/X or editR/delR button on the card; one 3-dot per card (e2e `routineMenu`).
2. PASS - Edit opens Edit Routine for that routine (eRid matches); Delete shows the same
   "Delete this routine?" confirm; Cancel deletes nothing, OK deletes exactly that routine.
3. PASS - closes on backdrop tap, Escape, back, and after Edit/Delete; back after Edit
   then closes the Edit sheet cleanly (history hand-off works). Mutation check: removing
   the close in `rMenuPick` made 2 checks fail + the suite stall, restored.
4. PASS - 390px: 3-dot 44x44, menu rows >=44px tall, no horizontal overflow; Reorder
   (drag-reorder sheet) still opens. Screens: /tmp/jkfull2/routine-menu-card.png,
   routine-menu-open.png.
5. PASS - full `node tests/e2e/run.mjs`: 1472/1472 (was 1471/1471 before the last added
   check; 18 of those are the new `routineMenu` suite). 0 page errors (every suite's
   check), 0 console.error during the menu flows (new explicit check).
6. Audit done, not built - in ~/agent/research/jacked-hide-destructive-result-2026-10-16.md.
7. PASS - committed on local main only (index.html, run.mjs, this card); not pushed.
