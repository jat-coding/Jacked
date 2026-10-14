# Adversarial pass 3 on local main

## Goal
After pass 2 (7 bugs), he asked "are there any other bugs you can find". Attack what passes 1 and 2 did not:
multi-tab on one device, platform APIs (permissions, service-worker update, PWA install), friends, settings/units/dates,
long sessions and big histories.

## Reported
2026-10-13 evening. Brief: `~/agent/research/jacked-adversarial-pass-3-brief-2026-10-13.md`.
Full result (every scenario tried, method, residual risk): `~/agent/research/jacked-adversarial-pass-3-result-2026-10-13.md`.

## Done criteria
- [x] Every scenario tried listed, one line each (in the result file)
- [x] Every real bug fixed with a regression test in `tests/e2e/run.mjs` (`adv3*` suites)
- [x] Mutation check: every bug check fails against the unfixed index.html
- [x] Full e2e suite green: 1290/1290 (baseline 1250/1250)
- [x] `live*` suites green: VERIFY #7 list 51/51, all 17 live suites 99/99
- [x] Committed to local main only, no push

## Bugs fixed
B1 two tabs kept separate copies of the open workout (sets lost) · B2 app update reloaded over open editors ·
B3 friend Remove failing said "Removed"; a stale refresh put a removed friend back · B4 Copy friend workout skipped the
pass-2 start-over guard · B5 lb<->kg switch in Profile corrupted body weight; every Save logged a phantom weigh-in ·
B6 a past-day workout counted as the latest · B7 CSV import dated unreadable dates as today, misread day-first dates.
