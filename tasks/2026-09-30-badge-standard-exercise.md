---
project: Jacked
date: 2026-09-30
status: done
---

# Badges use one standard exercise each

## Goal
Mr. Roni, 2026-09-29: "For any badge there should be a standard exercise the same for everyone; achievements
shouldn't apply to any created exercise made by the user; one designated exercise for each achievement"; bike must
not count for cardio. His locked answers (queue brief 2026-09-30): Cardio running only (outdoor or treadmill);
Leg + 1000lb squat = barbell back squat; strict pull-ups only; bench = barbell flat bench; OHP = standing barbell;
push-up = standard; 1000lb = flat bench + back squat + conventional deadlift. Customs never count; Hevy imports count
when they map to the same exercise.

## Pinned exercise ids (BADGE_STD in index.html)
| Badge | Library id(s) |
|---|---|
| Bench-Maxing | `Barbell_Bench_Press_-_Medium_Grip` (substitutes: see 2026-09-30-bench-substitutes.md) |
| Shoulder-Maxing | `Standing_Military_Press` |
| Leg-Maxing | `Barbell_Squat` |
| Pull-up-Maxing | `Pullups` (not with the -Assist toggle) |
| Push-up-Maxing | `Pushups` |
| Cardio-Maxing | `bi_run_outdoor` (new built-in), `Running_Treadmill` (exercise-db id, now built in) |
| 1000lb Club | `Barbell_Bench_Press_-_Medium_Grip` + `Barbell_Squat` + `Barbell_Deadlift` |

exercise-db has no outdoor run and files all cardio under the "cardio" category the library excludes, so until
now every run in the app was a user-made exercise. Two built-in runs were added (RUNS in index.html).

## Done when
- [x] Every badge matches exact ids, never names (bench/OHP/squat/deadlift/pull/push/run; live chip too).
- [x] Custom (`cex…`) exercises never count, whatever their name.
- [x] Hevy-imported workouts are re-matched by name (customs left out); "(Assisted)", "(Band)", Smith, machine,
      knee variants never count, even though the name matcher lands "Pull Up (Assisted)" on Pullups.
- [x] Hevy importer keeps a run's distance + time (distance_km / duration_seconds) so imported runs count.
- [x] BADGE_HOW / BADGE_DETAIL / live popup text name the exercise.
- [x] Popup "start workout" button starts the exact standard id(s).
- [x] Tests (new suite badgeStandard, 36 checks): bike / custom run / treadmill walk / chin-up / front squat /
      Smith squat / incline bench / custom "Barbell Bench Press" / Smith, dumbbell or sumo in the 1000lb Club don't
      count; the standard ones and the Hevy equivalents do. Full suite 624/624 (JK_PORT 8799).
- [x] BUILD v1.10.46, staging push read back.

## Side fix
- The CSV import called `await loadDB()`, which returns at once if a load is already running, so an import right
  after boot could match nothing. It now waits for the library.

## Not doing / flagged
- Runs he logged before today under a user-made cardio exercise no longer count toward Cardio-Maxing (his rule);
  new runs go under Running (outdoor) / Running (treadmill). Not migrated: that would be counting a custom.
