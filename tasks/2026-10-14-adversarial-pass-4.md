# Adversarial pass 4: cross-feature consistency (2026-10-14)

Brief: `~/agent/research/jacked-adversarial-pass-4-brief-2026-10-14.md`. Full result: `~/agent/research/jacked-adversarial-pass-4-result-2026-10-14.md`.

## Done when
- [x] Every scenario tried listed one line each (result file).
- [x] Every real bug, consistency bugs included, fixed with a regression test in `tests/e2e/` (`adv4*`, 13 suites).
- [x] Each new test fails on the unfixed build (8182d1c): 33 of 57 checks failed there, every bug check.
- [x] Full e2e suite green: 1354/1354 (baseline on 8182d1c: 1290/1290).
- [x] `live*` green: VERIFY #7 list 51/51, all 17 live suites 99/99.
- [x] Committed to local `main` only. No push.

## Changed behaviour he will notice
- Back closes the popup on top (as tapping outside it does), then the workout page or a tab goes Home, then the app closes. Before, a full-screen overlay (Achievements, a badge, Recap) swallowed back and the next press closed the app.
- The workout screen's trash button asks before removing an exercise that has logged sets.
- Badge numbers follow his lb/kg setting. The 1000lb Club line now reads "945 lb / 1000 lb" (was "945 lb / 1000").
- All Time "Consistency" on the leaderboard counts training days in the last 30, capped at 100%.

## Not changed (needs his call)
- Weight-lift PR records still aren't rebuilt when a workout is edited or deleted (his 2026-10-08 scope: weight lifts out of scope).
- Badges count sets that were never ticked done; PRs and totals don't.
- Custom exercises and routines merge across devices as whole lists, so one device's list replaces the other's.
