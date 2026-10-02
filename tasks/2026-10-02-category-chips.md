---
project: Jacked
date: 2026-10-02
status: built -- v1.10.66 on staging; production needs Mr. Roni's go
---

# Exercise picker: 10 body-map chips, selected chip first

## Ask
Mr. Roni 2026-10-02 3:53-4:21pm (topic 620): (1) a selected category chip moves to the front of the row and is
obviously selected; (2) cut the chips to Chest, Back, Shoulders, Biceps, Triceps, Legs, Glutes, Core, Cardio,
Warm-up. Lats/Traps/Lower Back/Middle Back -> Back, Forearms -> Biceps, Quads/Hamstrings/Calves/Adductors/
Abductors -> Legs, for the chip row and its filter only. Exercise data, PRs, badges, rankings, info screen keep
the specific tag.

## Done criteria
- [x] Library and Add/Switch-Exercise picker show exactly the 10 chips, in that order.
- [x] Tapping a chip moves it first, filled + check mark + clear mark + ring, aria-pressed; row scrolls to start.
      Tap again clears and restores the order.
- [x] Fold uses muscleGroup() (the body map's own grouping); every folded sub-muscle's real exercise-db lifts
      show under the parent chip and no other.
- [x] Switch on a Lats lift opens pre-filtered to Back.
- [x] e.muscle, info screen, list rows, PR commit, history muscle, strength credit, badges unchanged.
- [x] e2e categoryChips 35 checks; exerciseAudit/builtinMachines updated; 948/948.

## Judgment calls (flagged to him)
- Neck (5 exercise-db lifts) had its own chip; now under Shoulders, same as the body map.
- A custom exercise saved as "Full Body" has no chip any more; search and the unfiltered list still find it.
