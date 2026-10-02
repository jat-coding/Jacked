---
project: Jacked
date: 2026-10-02
status: built -- v1.10.68 on staging; production needs Mr. Roni's go
---

# Ask to update the routine after a Switch Exercise

## Ask
Mr. Roni 2026-10-02 4:40-4:44pm (topic 620), spec locked:
- Trigger: the existing Switch Exercise action, in a workout started from a saved routine. Freestyle never.
- When: on finishing/saving the workout, if one or more swaps happened. One prompt covers every swap.
- Accept: overwrite ONLY the routine's exercise list (the swapped slots; same position). Nothing else on the routine
  changes (name, description, section, sets/reps -- routines store no set targets; sets seed from history).
- Decline: routine untouched.
- Set logging, reorder, add, remove: never trigger it.

## Conflict found (surfaced in the result)
v1.8.27 (2026-09-21) already asked "Update the routine?" on finish for ANY change -- add, remove or reorder. That
directly contradicts "reorder/add/remove never trigger this". The new swap-only prompt replaces it. The passive
"Update <routine> with these exercises" button on the finish summary stays (it is a button he taps, not a prompt),
but is hidden when the swap prompt was already answered.

## Done criteria
- [x] Switch Exercise during a routine workout records the swap (original routine exercise -> current one, chains
      A->B->C collapse to A->C, A->B->A cancels out). Survives app reload (rides the saved live workout).
- [x] Finish (manual) with >=1 real swap: one prompt listing every swap; "Update routine" / "Keep routine".
- [x] Accept: routine.exercises has each swapped slot replaced in place; every other routine field identical; adds,
      removes and reorders from the session are NOT written back.
- [x] Decline: routine byte-identical.
- [x] Freestyle workout with a switch: no prompt. Reorder/add/remove/set logging only: no prompt.
- [x] Swapped-in exercise later removed from the session -> that swap is dropped. Swapping an exercise that was
      added mid-session (not in the routine) -> no prompt.
- [x] Swap bookkeeping not saved into the history record.
- [x] Auto-finish (nobody there) never prompts, routine untouched.
- [x] BUILD bumped; WATCH_BRIDGE row.

## Tests
- [x] e2e routineSwapPrompt: accept, decline, freestyle, reorder/add/remove, multi-swap single prompt.
- [x] e2e routineSwapPrompt: 29 checks (also switch-back cancels, switched-in-then-removed, switching an added
      exercise, auto-finish, saved live workout carries the switch).
- [x] Full suite 1019/1019 on JK_PORT 8796.

## Send-backs
(none yet)
