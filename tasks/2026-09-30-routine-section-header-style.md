# Routine section headers — smaller text, with a line (Mr. Roni, 2026-09-30 4:10pm, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue, badge-fixes-2, friend-avatar-lightbox, exercise-image —
same repo/branch, don't run concurrently. 5th in the follow-up queue.

Ask: "For the sections headers make them smaller text with a line." Confirmed screen:
Routine sections (My routines).

## Current state (checked jacked-pwa/index.html)
- `sectionBlockHtml()` (~2543) renders each section header as `.blk-head > .blk-t`.
- `.blk-t` (~473) is the ONE shared block-title class used app-wide (Home, Metrics, My
  routines) per the type/spacing rulebook comment at line 474-475
  (artifacts/jacked-type-and-spacing-rules.md): 24px, weight 800, uppercase, no line.
  Shrinking `.blk-t` itself would restyle every page's block titles, not just routine
  sections — need a scoped class instead (e.g. `.rsec > .blk-head .blk-t` override, or a
  new modifier), not a global `.blk-t` edit.
- Precedent already in this file: `.rosec-name` (~5147, the Reorder modal's section
  labels) is 13px/700/uppercase/letter-spacing .4px — a smaller look already used for a
  routine-section label elsewhere. Good reference size; "with a line" (a rule under or
  beside the label) is new, not yet in the codebase.

## Implementation sketch
- Scoped CSS override for `.rsec .blk-t` (or add a modifier class in `sectionBlockHtml`):
  drop to ~13-14px, keep bold/uppercase for identity, add a thin bottom border or an
  inline rule spanning the rest of the row width.
- Must not touch `.blk-t` itself — Home/Metrics headers stay at 24px.
- Keep the existing contenteditable rename behavior and the readonly "Unfiled" variant
  working under the new style.

## Done-when
- [x] Routine section headers render smaller with a line; Home/Metrics block titles unchanged
- [x] Tested (655/655 baseline held), staging push (v1.10.52, commit c10c747, merged 37d1c1e), version bumped
