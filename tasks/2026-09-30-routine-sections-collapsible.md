# Routine sections collapsible/minimizable (Mr. Roni, 2026-09-30 4:16pm, room -1003926058645 topic 620)

Queue AFTER feat/sep30-queue, badge-fixes-2, friend-avatar-lightbox, exercise-image,
routine-section-header-style, add-section-button-in-reorder — same repo/branch, don't run
concurrently. 7th in the follow-up queue.

Ask: "Allow those sections to be minimized." (Routine sections, My routines page —
same feature as the header-style task above.)

## Current state (checked jacked-pwa/index.html)
- `sectionBlockHtml()` (~2543) renders each section as `.rsec` = header (`.blk-head/.blk-t`)
  + all its routine cards, always fully expanded. No collapse state exists anywhere for
  routine sections.
- No prior collapse/expand pattern in this codebase to mirror — the closest relative is
  `toggleCard()` (~4530), but that's Metrics cards being fully hidden/shown via settings,
  not an expand/collapse toggle on a visible section. Not reusable as-is.
- `routineOrderModal` (the Reorder popup, ~1113) lists sections in a flat drag list too —
  separate question whether minimizing applies there as well.

ANSWERED (Mr. Roni, 2026-09-30 4:17pm):
1. My routines list only (not the Reorder popup).
2. Collapsed state persists between visits — save per section id (new key in `S`, e.g.
   `collapsedSections: [secId,...]`, checked in `sectionBlockHtml()`).
3. Tap target is the whole header row (`.blk-head`), not a separate chevron icon —
   still needs a visual affordance (rotate a chevron glyph) so it reads as tappable, but
   no dedicated hit target — the whole row is clickable. Contenteditable rename (onblur)
   on the title must still work without the row-tap intercepting it.

## Done-when
- [x] Scope answered (2026-09-30 4:17pm): list-only, persisted, whole-row tap
- [ ] Section collapses/expands per answer; routine cards hidden when collapsed
- [ ] Tested at 390x844, staging push, version bumped
