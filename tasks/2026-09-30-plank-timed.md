---
project: Jacked
date: 2026-09-30
status: done
---

# Planks (and every static hold) are timed, not counted

## Goal
Mr. Roni 2026-09-29 7:42pm: "Plank bodyweight should be timed not how many reps". Planks and the other static
holds in the library track duration across logging, history, PRs and imports; planks already logged as reps stay
readable.

## Static holds converted (TIMED_HOLDS, exercise-db ids; force "static" outside the excluded categories)
Plank, Side_Bridge (side plank), Isometric_Neck_Exercise_-_Front_And_Back, Isometric_Neck_Exercise_-_Sides,
Plate_Pinch, Crucifix, Downward_Facing_Balance. (The built-in warm-up Plank `wu_core` was already timed.)
Checked and left as reps: Prone_Manual_Hamstring, Standing_Olympic_Plate_Hand_Squeeze, Isometric_Wipers (their
instructions are repetitions). Plate Pinch and Crucifix hold a weight too; only the time is kept.

## Done when
- [x] Library, picker, routines and new workouts give these a seconds box (tracking 'duration').
- [x] A plank logged as reps before today does not seed its reps/weight as seconds (seedSets matches tracking).
- [x] History: new planks read "75s"; old rep planks still read "× 30 reps".
- [x] PRs: longest hold, kept in its own record (jk_holdPR, synced + merged by the longer hold) so it never
      overwrites or is judged against an old rep PR; live gold star, finish summary, history stars, replay all agree.
- [x] Library row shows "Duration" and the hold PR; exercise chart shows longest holds only.
- [x] Hevy import: a hold with duration_seconds imports as timed sets with a hold PR, no fake volume; "Side Plank"
      now maps to Side_Bridge (was "Push Up to Side Plank").
- [x] e2e suite timedHolds (16 checks); full 655/655 on JK_PORT 8799.
- [x] BUILD v1.10.48 on staging.
