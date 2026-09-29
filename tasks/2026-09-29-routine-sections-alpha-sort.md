# Routine sections + alphabetical default sort

## Goal
Routines list defaults to alphabetical order, grouped under slim, editable muscle-group
section headers (Chest, Back, etc.); he can rename sections, add new ones, and put
routines into them. Follow-up to the routine drag-reorder shipped today (v1.10.43).

## Decided (his answers, 2026-09-29 4:02pm, plus a follow-up)
1. Section assignment: auto-suggest from the routine's exercises' majority
   muscleGroup() at save time; editable after via a section picker in the
   edit-routine modal.
2. Sections are NOT pre-created. A section is created lazily — the first routine
   that auto-suggests into it, or an explicit "add section," creates it.
3. This morning's drag-reorder (routineOrderModal) is extended, not dropped: BOTH
   section headers and routines-within-a-section become draggable/reorderable.
   Manual order overrides alphabetical once touched. His own words after seeing the
   plan: "These sections should be able to be reordered. It should just be a more
   grander feature." — build full section CRUD (add/rename/reorder) + per-section
   routine reorder, not a cut-down version.

## Done when
- [x] Routines list groups by section, routines sorted alphabetically within each
  section by default (until manually dragged). Verified by e2e ("sections: My
  routines list reflects... alphabetical" checks) and the screenshot below.
- [x] Section headers are slim (single compact row, not a big card) — matches his
  "don't make the section headers that big of a profile" ask; reuse the app's
  existing slim-header weight (.blk-t/.blk-head on the Metrics page), don't invent
  a heavier one. Section headers reuse `.blk-t`/`.blk-head` verbatim (no new CSS
  weight added) -- see screenshot.
- [x] Section name editable in place; new sections addable. `contenteditable` on
  the section title (blur to save) + "+ Section" button next to Reorder; both
  covered by e2e ("sections: inline rename...", "+ Section creates...").
- [x] Sections themselves are drag-reorderable. Extends `cardDragStart`/`place`/
  `tick`/`end` — no second drag implementation. e2e drags a section header and
  confirms both the DOM order and `routineSections` storage order flip.
- [x] Routines within a section are drag-reorderable (extends, not replaces, this
  morning's routineOrderModal machinery). Same shared drag code, keyed off a
  per-section `secROList-<id>` container id. e2e confirms the dragged section's
  manual order persists and a sibling section's order is untouched.
- [x] A routine's section is auto-suggested from its exercises' majority muscle
  group at save time, and changeable via a picker in the edit-routine modal.
  `saveR()` calls `suggestSectionId()` when the picker is left on "Auto-suggest";
  picker also has real sections + "+ New section…". e2e covers auto-suggest,
  explicit override, "+ New section" from the picker, and that re-saving without
  touching the picker does not silently re-suggest a different section.
- [x] Existing routines (created before this feature) land in a sane section on
  first load post-upgrade, no data loss, no crash on old saved data.
  `migrateRoutineSections()` runs once at boot (gated on the exercise DB so
  DB-sourced exercises classify correctly); e2e seeds 2 sectionId-less legacy
  routines and confirms both get a valid section, no errors, no data loss.
- [x] `node tests/e2e/run.mjs` full suite passes, 0 failures, pass count reported.
  **578/578 passed** (up from the pre-existing 538/538 baseline; 40 new checks
  added for this feature, 2 pre-existing checks updated for the new modal shape).
- [x] No new console errors. Every new/updated test block asserts
  `errors.length === 0`; all passed.
- [x] Screenshot of the routines list on a 390px-wide screen showing at least 2
  sections with 2+ routines each, alphabetically ordered within each.
  `/tmp/jk16/shots/routine-sections.png` (390x844 viewport, full-page capture --
  the bottom nav bar appears twice mid-image, a known Playwright full-page-shot
  artifact from a `position:fixed` element, not an app bug).

## Not doing
- Touching the Metrics tab body-map/Achievements grouping — muscle-group logic there
  is unrelated to this.
- Cross-section drag-and-drop reassignment (dragging a routine card out of one
  section into another) — reassignment goes through the edit-routine section
  picker instead. Flag it as a possible stretch if it falls out naturally, but it
  is not a done-when check.

## Tries
5

## Status
Done. Shipped as v1.10.44, commit f4b7bc2, pushed to `staging` (confirmed
`PUSHED: origin/staging == local HEAD == f4b7bc2`; Netlify shows it enqueued as a
staging branch-deploy). Not pushed to main/production -- needs his explicit go per
standing rule. Full report: 2026-09-29-routine-sections-alpha-sort-REPORT.md.
