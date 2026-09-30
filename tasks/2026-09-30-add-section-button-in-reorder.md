# Move "+ Section" into the Reorder popup (Mr. Roni, 2026-09-30 4:16pm, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue, badge-fixes-2, friend-avatar-lightbox, exercise-image,
routine-section-header-style — same repo/branch, don't run concurrently. 6th in the
follow-up queue.

Ask: "And the add sections button should be in the reorder popup screen."

## Current state (checked jacked-pwa/index.html)
- "+ Section" button lives in the My routines page header (line 601), next to "Reorder",
  calling `addSectionPrompt()` (~4464).
- "Reorder" opens `routineOrderModal` (~1113) via `openRoutineOrder()` (5139) — titled
  "Reorder Sections & Routines", lists sections (drag handle) and their routines, single
  "Done" button at the bottom, no add-section affordance inside it today.

ANSWERED (Mr. Roni, 2026-09-30 4:16pm): move it — remove "+ Section" from the My routines
header entirely, only reachable from the Reorder modal (e.g. next to the "Reorder
Sections & Routines" title, or above the list, calling the same `addSectionPrompt()` then
re-rendering `renderRoutineOrderList()`).

## Done-when
- [x] Scope answered (2026-09-30 4:16pm): move, don't duplicate
- [x] "+ Section" reachable from the Reorder popup; new section appears in the drag list
      immediately without closing the modal
- [x] Tested (657/657), staging push (v1.10.49, commit 9b93ecb, merged 37d1c1e), version bumped
