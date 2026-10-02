---
project: Jacked
date: 2026-10-01
status: done -- v1.10.57 on staging; production needs Mr. Roni's go
---

# Top PR card: heaviest raw weight, no bodyweight moves

## Ask
Mr. Roni 2026-10-01, topic 620, answers 4:26-6:22pm: Metrics > Lifetime Stats "Top PR" ranks by RAW weight lifted
(heaviest weight; reps only break a tie), not weight x reps and not e1RM. Plain bodyweight moves (push-ups,
pull-ups, dips, planks with no added weight) are never Top PR. Show weight x reps of that set. "Recompute existing
too": his stored Push-ups "229 lb x 62" must stop winning; stored records with body weight folded in are not shown.
Staging first.

## Done criteria
- [x] Card derived from jk_hist, never jk_prs (topPRSet): heaviest raw set weight, then more reps, then the
      earlier set (date, then exercise order in the workout). 0.01 kg tie tolerance (imports vs app entries).
- [x] isPlainBW exercises (plain or assisted bodyweight), cardio (distance) and holds (duration) excluded.
      "+ Added" lifts count the typed added weight only, never body + plates (his 9/25 "+ Added 230" dips = 230).
- [x] Unchecked app sets ignored; imported workouts (id w<ms>_<n>) count every set, same as importBest.
- [x] Shown as weight x reps in his unit; no Top PR row when only bodyweight work exists.
- [x] Tests: push-up 229 x 62 never wins; stored 459 lb dip record not shown; heaviest weighted lift wins;
      reps only break ties; exact tie keeps the earlier set; imported 500 x 12 counts, cardio/hold don't; kg display;
      bodyweight-only user has no card row. Dad fixture after the back-extension repair: Leg Press 275 x 12.
- [x] Full suite 798/798 (JK_PORT 8799).

## Real data (read-only SQL on profile_backups, 2026-10-01; nothing written)
- Mr. Roni: heaviest raw set = 500 lb x 12, Hevy import 2026-04-07, logged as "Leg Press (Machine)" but stored
  under Calf_Press_On_The_Leg_Press_Machine (the old import mismatch), so the card reads "Calf Press On The Leg
  Press" 500 x 12. Next: Leg Press 495 x 10 (9/28), Leg Press Horizontal 370 x 15. Bodyweight 229 rows excluded.
- Dad: Leg Press and Calf Press on the leg press both 275 x 12, first on 9/22 in the same workout; Leg Press comes
  first there, so Leg Press 275 x 12. (His Calf Press rows are also his Hevy-mislabelled leg press.)

## Not changed
jk_prs, PR detection, PR counts, badges, the watch. Old Hevy label mismatches (flagged earlier) still decide the
displayed name for his 500.

## Send-backs
(none yet)
