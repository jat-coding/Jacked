# Routine sections + alphabetical sort — REPORT

## What was built
Your routines list (Routines tab → My routines) now groups routines under slim,
editable section headers by muscle group (Chest, Back, Shoulders, etc.), with
routines sorted alphabetically inside each section until you drag one. Sections:

- Are auto-created and auto-assigned when you save a routine, based on the
  majority muscle group of the exercises in it. No exercises, or no clear
  majority → it lands in a lazily-created "Unsorted" section.
- Can be renamed in place (tap the header text) and added ("+ Section" button
  next to Reorder).
- Can be reordered, and routines can be reordered within their own section, both
  from the same "Reorder" sheet you already had — it now shows sections with
  their routines nested underneath, drag either one.
- Can be overridden per-routine: editing a routine now has a "Section" dropdown
  (Auto-suggest / any existing section / "+ New section…").
- Dragging a routine out of one section into another isn't built (that wasn't
  required — you reassign a routine's section from its edit screen instead).

Old routines you already had get auto-filed into a section the first time the
app loads after this update — nothing is lost, nothing crashes.

## Done-when checklist
| # | Item | Result | How confirmed |
|---|---|---|---|
| 1 | Grouped by section, alphabetical by default | ✅ Pass | Automated test + screenshot |
| 2 | Section headers are slim, not big cards | ✅ Pass | Reused the same slim header style already used on the Metrics tab; see screenshot |
| 3 | Section name editable in place; new sections addable | ✅ Pass | Automated test (rename + "+ Section") |
| 4 | Sections themselves drag-reorderable | ✅ Pass | Automated test simulates the drag, checks it saved |
| 5 | Routines drag-reorderable within their section | ✅ Pass | Automated test simulates the drag, checks it saved, checks the other section was untouched |
| 6 | Section auto-suggested at save, changeable via picker | ✅ Pass | Automated test: auto-suggest, manual override, and "+ New section" all checked |
| 7 | Old routines land in a sane section on upgrade, no data loss/crash | ✅ Pass | Automated test seeds pre-upgrade routines, confirms both survive with a real section and no errors |
| 8 | Full test suite passes, 0 failures | ✅ Pass | **581/581 passed** (was 538/538 before this work — 43 new checks added, 2 old ones updated for the new "Reorder" sheet layout) |
| 9 | No new console errors | ✅ Pass | Every test checks for page errors; all clean |
| 10 | Screenshot: 390px wide, 2+ sections, 2+ routines each, alphabetical | ✅ Pass | `/tmp/jk16/shots/routine-sections.png` |

All 10 items pass. Nothing is left unfinished.

## Bonus fixes from a second-pass review
Before calling it done, I had a second, fresh reviewer look at the diff. It found
one real bug and two smaller rough edges, all fixed and re-tested before the
final push:
- Adding a "Trusted Program" routine (the pre-built StrongLifts/PPL programs)
  skipped section assignment, so it would briefly show up in the wrong bucket
  until you reloaded the app. Fixed.
- The catch-all bucket for any routine whose section somehow doesn't exist was
  also labeled "Unsorted," which could look identical to a real "Unsorted"
  section you or the app created. Renamed it to "Unfiled" so they can't be
  confused.
- Renaming a section to a name that already exists is now blocked with a toast
  instead of silently creating two sections with the same name.

## Staging
- Version: **v1.10.44**
- Final commit: `75c3a5b` (feature code landed at `309681e`; two docs-only commits
  on top just update this task card)
- Push: confirmed via `scripts/jacked-push.sh --branch staging` —
  `PUSHED: origin/staging == local HEAD == 75c3a5b`
- Netlify: building/ready as a **staging branch-deploy** (not production —
  production main is untouched and still needs your explicit go-ahead before
  anything from this goes live)

## Nothing outstanding
No open try-budget was needed — this passed within the first build, plus the
follow-up review fixes above.
