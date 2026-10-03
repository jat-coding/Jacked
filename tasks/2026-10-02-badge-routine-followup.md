---
project: Jacked
date: 2026-10-02
status: built -- v1.10.69, staging only
---

# Follow-up: seated presses out of Shoulder-Maxing; Smith bench no-op; any-change routine prompt restored

## Goal
Mr. Roni, locked 2026-10-02 5:33-5:35pm (room -1003926058645 topic 620). Three fixes on top of v1.10.67 / v1.10.68.

1. `Barbell_Shoulder_Press` and `Smith_Machine_Overhead_Shoulder_Press` are SEATED presses in the real library (their
   instructions start "Sit on a bench..." / "place a flat bench... when seated"). They stop counting for Shoulder-Maxing
   (and anything else) entirely -- no penalty credit. Only a genuinely standing press counts: barbell x1, dumbbell pair
   x1.15, Smith x0.85. Real library (876, checked today): standing barbell = `Standing_Military_Press`; standing
   dumbbell = `Standing_Dumbbell_Press`; standing Smith = NONE. So Shoulder-Maxing keeps two lifts and the Smith slot is
   empty.
2. Smith bench -15% stays. No-op, confirmed only.
3. The v1.8.27 any-change prompt (add/remove/reorder in a routine workout) comes back and runs ALONGSIDE the v1.10.68
   switch prompt; the summary's "Update <routine>" button is no longer hidden after the switch prompt.

## Choice made on fix 3
Two prompts back to back, not one combined: switch prompt first ("Update routine" / "Keep routine"), then the
any-change prompt ("Update routine" / "Keep original") for adds/removes/reorders only. Each answer is independent (keep
the switch, take the added exercise, or the reverse). A switch that was already asked about counts as unchanged in the
second prompt, so a declined switch is never re-asked as "added X; removed Y".

## Done when
- [x] Seated "Barbell Shoulder Press" and the Smith overhead press credit nothing (badge, lifts list, live chip, 1000lb
      Club), however heavy; Hevy "Overhead Press (Smith Machine)" credits nothing (e2e, real library loaded).
- [x] Standing Military Press x1 and Standing Dumbbell Press x1.15 still count (existing e2e).
- [x] Shoulder-Maxing text and popup no longer offer Smith -15%; they say both seated presses don't count.
- [x] Smith bench still x0.85 (existing e2e untouched and passing).
- [x] Session with only add/remove/reorder (no switch): any-change prompt shows; keep = untouched, yes = written back.
- [x] Session with a switch AND an add/remove: both prompts show, switch first; each answer applied independently.
- [x] Summary "Update <routine>" button shows whenever the routine still differs (hiding removed).
- [x] Freestyle and auto-finish still never prompt. BUILD v1.10.69. Full suite green on JK_PORT 8795.

## Not doing
Bench rules, other badges, the importer's general name matcher, production.

## Tries
5

## Results
- Full suite 1033/1033 on JK_PORT 8795 (was 1019 at v1.10.68). New checks: seated presses (real-library seated/standing
  read, 300 x5 earns nothing, 1000lb Club, live chip, Hevy Smith OHP); any-change prompt for reorder/add/remove alone
  (keep + update each); switch + add/remove shows both prompts (yes/keep, yes/yes, keep/yes); summary button back.
- Smith bench: no code touched; its existing x0.85 checks still pass.
- Side effect flagged: Grant logs his overhead press under Barbell Shoulder Press (10/02 audit), so those sets stop
  counting for Shoulder-Maxing.
