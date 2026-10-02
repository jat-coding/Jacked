---
project: Jacked
date: 2026-10-02
status: done
---

# Maxing badges: one standard lift each, dumbbell +15% / Smith -15% on bench and overhead press

## Goal
Mr. Roni, locked 2026-09-29 19:41-19:42, amended 2026-10-02 4:29-4:32pm (room -1003926058645 topic 620). Every Maxing
badge and the 1000lb Club counts one fixed standard exercise, the same for everyone. Bench and overhead press also take
a dumbbell version (credited +15% of both dumbbells together) and a Smith machine version (credited -15%). The weighting
only changes the number the badge compares; the set, its PRs and every other ranking keep the real logged weight.

Already true before this card (v1.10.46-v1.10.61, kept): exact library ids per badge, customs never count, bike /
chin-ups / assisted / incline etc. never count, planks are timed (v1.10.48), Hevy imports re-matched by name.

## What changes in this build
- Dumbbell bench: was `2 x per-hand / 0.83` (x1.205, Saeterbakken 2011). Now `2 x per-hand x 1.15` (his number).
- Smith machine bench (`Smith_Machine_Bench_Press`): was not counted (waiting on his call, 9/30). Now x0.85.
- 1000lb Club bench leg: was barbell only. Now barbell, dumbbell (x1.15 of the pair) or Smith (x0.85).
- Shoulder-Maxing: adds standing dumbbell press (`Standing_Dumbbell_Press`, x1.15 of the pair) and Smith machine
  overhead press (`Smith_Machine_Overhead_Shoulder_Press`, x0.85). Popup shows each lift on the tier it reached.
- Hevy import (badge check only, the importer itself is untouched): exact-name pins for "Bench Press (Smith Machine)",
  "Overhead Press (Dumbbell)", "Overhead Press (Smith Machine)"; other Smith names count only if they land on a Smith id
  above; the "(Barbell)"/"(Dumbbell)" in a name must match the library entry's equipment; single-arm / alternating
  never count. Found by probing 20 real names: before this, Hevy "Overhead Press (Dumbbell)" was credited as the BARBELL
  press at 100%, and "Single Arm Dumbbell Bench Press" as the two-hand dumbbell bench.
- Side fix: "Jogging, Treadmill" (added as a Cardio-Maxing id in v1.10.61) was silently dropped by the per-run-type
  breakdown, so it never actually counted. Now it does (treadmill section).

## Pinned ids (real free-exercise-db, 876 entries, checked 2026-10-02)
| Lift | Counts | Near-variants that must NOT count |
|---|---|---|
| Flat barbell bench x1 | Barbell_Bench_Press_-_Medium_Grip, Bench_Press_-_Powerlifting | Close-Grip_Barbell_Bench_Press, Barbell_Incline_Bench_Press_-_Medium_Grip, Bench_Press_with_Chains |
| Flat dumbbell bench x1.15 (pair) | Dumbbell_Bench_Press | One_Arm_Dumbbell_Bench_Press, Dumbbell_Bench_Press_with_Neutral_Grip, Decline_Dumbbell_Bench_Press |
| Smith bench x0.85 | Smith_Machine_Bench_Press | Smith_Machine_Close-Grip_Bench_Press, Smith_Machine_Incline_Bench_Press, Decline_Smith_Press |
| Standing barbell OHP x1 | Standing_Military_Press, Barbell_Shoulder_Press | Seated_Barbell_Military_Press, Push_Press, Standing_Barbell_Press_Behind_Neck |
| Standing dumbbell OHP x1.15 (pair) | Standing_Dumbbell_Press | Dumbbell_Shoulder_Press (seated), Standing_Alternating_Dumbbell_Press, Standing_Palms-In_Dumbbell_Press, Arnold_Dumbbell_Press |
| Smith OHP x0.85 | Smith_Machine_Overhead_Shoulder_Press | Machine_Shoulder_Military_Press, Leverage_Shoulder_Press |
| Back squat | Barbell_Squat, Barbell_Full_Squat | Front_Barbell_Squat, Smith_Machine_Squat, Barbell_Squat_To_A_Bench |
| Conventional deadlift | Barbell_Deadlift | Sumo_Deadlift, Romanian_Deadlift, Trap_Bar_Deadlift |
| Strict pull-up | Pullups | Chin-Up, Band_Assisted_Pull-Up, Scapular_Pull-Up, Weighted_Pull_Ups (n/a, other), V-Bar_Pullup |
| Standard push-up | Pushups | Incline_Push-Up, Push-Up_Wide, Decline_Push-Up |
| Running | bi_run_outdoor, Running_Treadmill, Jogging_Treadmill | Walking_Treadmill, bikes, rower, elliptical, stairmaster |

Two library facts flagged, not acted on: `Barbell_Shoulder_Press` (merged in as "same lift" by him earlier today,
v1.10.61) and `Smith_Machine_Overhead_Shoulder_Press` both describe a bench in their instructions. The library has
no standing Smith press at all. Kept both counting (his same-day call; the only Smith OHP there is); one-line removal
if he wants them out.

## Done when
- [x] Bench / OHP / 1000lb bench leg credit barbell x1, dumbbell pair x1.15, Smith x0.85 (tests with exact numbers).
- [x] Credit never touches stored set weight, the exercise's PR, or strength ranking (test).
- [x] Near-variants above: at least 2 per lift don't count; the standard ones do (tests, real library loaded).
- [x] Bike / chin-ups still earn nothing; plank scored by time not reps (tests).
- [x] Hevy "Bench Press (Smith Machine)", "Overhead Press (Dumbbell)" etc. credit right; seated / other variants don't.
- [x] Popup + list text explain the +15% / -15%; live chip fires on all six bench/OHP ids.
- [x] New suite maxingStandards (42 checks); badgeStandard / benchSubstitutes updated to the new rules. BUILD v1.10.67.
- [x] Full suite 990/990 on JK_PORT 8797 (navPinned: fixed waits replaced by a scroll-settle wait; it failed on untouched staging under load 22+ too).
