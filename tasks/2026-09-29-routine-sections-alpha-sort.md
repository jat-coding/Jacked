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
- [ ] Routines list groups by section, routines sorted alphabetically within each
  section by default (until manually dragged).
- [ ] Section headers are slim (single compact row, not a big card) — matches his
  "don't make the section headers that big of a profile" ask; reuse the app's
  existing slim-header weight (.blk-t/.blk-head on the Metrics page), don't invent
  a heavier one.
- [ ] Section name editable in place; new sections addable.
- [ ] Sections themselves are drag-reorderable.
- [ ] Routines within a section are drag-reorderable (extends, not replaces, this
  morning's routineOrderModal machinery).
- [ ] A routine's section is auto-suggested from its exercises' majority muscle
  group at save time, and changeable via a picker in the edit-routine modal.
- [ ] Existing routines (created before this feature) land in a sane section on
  first load post-upgrade, no data loss, no crash on old saved data.
- [ ] `node tests/e2e/run.mjs` full suite passes, 0 failures, pass count reported.
- [ ] No new console errors.
- [ ] Screenshot of the routines list on a 390px-wide screen showing at least 2
  sections with 2+ routines each, alphabetically ordered within each.

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
Decisions locked. Building via detached spawn-agent (bridge/scripts/run-and-notify.sh),
report lands in this same directory as *-REPORT.md.
