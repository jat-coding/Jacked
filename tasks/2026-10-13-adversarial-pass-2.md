# Adversarial pass 2 on local main before the prod push

## Goal
He didn't believe the 2026-10-13 QA sweep's "3 bugs" meant local `main` was in good shape, and asked
for a real adversarial second pass before anything goes to `origin/main`. Attack mode, same bar as
`2026-10-12-adversarial-stress-test.md`: go after what neither earlier pass hit hard: combined
failure modes, rapid-fire input, storage edges, auth/session edges.

## Reported
2026-10-13 ~7pm, after `research/jacked-full-qa-sweep-result-2026-10-13.md`.
Brief: `~/agent/research/jacked-adversarial-pass-2-brief-2026-10-13.md`.

### Scenarios actually tried (worktree /tmp/jk-adv2, from 5cf8103). B = real bug found and fixed
1. Home -> "Return to workout" bar showing -> Start Workout -> pick a routine -> **B1** (open workout with logged sets silently replaced)
2. Same via Start Empty, calendar-day "Log a workout", suggestion-group Start, curated Start -> **B1** (same overwrite, all entry points)
3. Finish (manual + auto) with localStorage full -> **B2** ("Workout complete" summary, workout in neither history nor saved session)
4. Same, live/shared: claim wins on server, local write fails, then a live poll / app restart -> **B2** (poll/resume would close it as "finished", nobody saves it)
5. CSV import with localStorage full -> **B2** (toast "Imported N", history unchanged, PR records moved anyway)
6. Reorder Exercises open + mid-drag when the workout is discarded on the watch / auto-finished / cleared -> **B3** (modal stays over Home, pointerup TypeError)
7. Add-exercise picker (workout) open when the workout ends elsewhere -> **B3** (picker stays open)
8. jk_hist with a null workout / null exercise / null set -> **B4** (Home + other tabs throw, every boot)
9. jk_hist with {} entry, exercises:null, sets:null, garbage date, string weights -> pass (already tolerated)
10. JSON backup import carrying a null workout -> **B4** (written verbatim, then boot crash; restoreKeys only checks key shape)
11. Truncated / non-JSON jk_hist text -> pass (healBareStrings re-quotes it, S.g shape check -> empty history, no throw)
12. Sign out with a workout open -> **B5** (workout wiped; activeWorkout isn't in any backup; message said "backed up")
13. Sign out with a pending change while the network hangs -> **B6** (confirm never appears; Sign out does nothing)
14. Sign out while a cloud pull-merge is in flight (pull lands after the wipe) -> pass (the pulled keys reappear, but resetIfStale wipes them on the reload because jk_appVersion is gone)
15. Tab-tab-tab-tab, then back x5 -> **B7** (back 1 = Home, backs 2-4 do nothing, 5 exits)
16. Back x3 while on the active-workout page -> pass (stays on the workout, nothing lost)
17. Double-tap Save Routine / Add Exercise (custom) -> pass (one routine / one exercise; 2nd tap falls through to the list beneath, harmless)
18. Double-tap routine "Start Workout" -> pass (one workout)
19. Double / triple-tap Finish, double-tap confirm OK -> pass (2nd tap lands on the confirm backdrop and dismisses it; one commit when confirmed)
20. Triple-tap set done checkbox -> pass (ends done, rest timer running once)
21. Rapid tab spam from the workout page, then Return to workout -> pass
22. Clock jumped back 2 h mid-workout, then Finish -> pass (no throw, sets saved; duration reads 00:00)
23. Clock back 2 h, then 40 min idle -> no auto-finish yet (idle clock waits until real time passes awTouch); not fixed, no data lost
24. Clock jumped forward 3 h mid-workout -> pass (auto-finish, duration up to last set)
25. Clock back 1 day, reload -> pass (resume prompt, Finish saves)
26. JSON backup import mid-workout -> pass (reload, "Resume your unfinished workout?", sets intact)
27. CSV import mid-workout -> pass (history read after the awaits, nothing stale written)
28. Auth token gone (signed out client side) at Finish with a live profile -> pass (saved locally, finish queued for the server)
29. Login as a different user without a reload -> N/A (login lives only on onboarding, where no profile/workout exists, and it reloads)

## Done when
- [x] Every scenario actually tried is listed, one line each, pass/bug.
- [x] Every real bug is FIXED in code with a regression test in `tests/e2e/` (adv2* suites in
      run.mjs, liveStartOverOpen + liveFinishStorageFull in live.mjs), each mutation-checked:
      fails against the unfixed code, passes with the fix.
- [x] Full e2e suite green: **1250/1250**.
- [x] `live*` suites green: VERIFY #7 brief list **51/51**, all 17 live suites **99/99**.
- [x] Count stated plainly: **7 real bugs** (B1-B7). B1, B2, B5 lose logged data; B3, B4 throw;
      B6, B7 are smaller (a button / back press that does nothing).
- [x] Committed onto local `main` only. No push anywhere.

## Not doing
- Clock-skew auto-finish delay (#23): device-clock garbage, no data loss.
- Double-tap Finish dismissing its own confirm (#19): no data effect, one more tap.
- Modal-close-on-back: still deliberately out of scope (androidBack suite comment).

## Result (2026-10-13)
7 real bugs found and fixed in one commit on local main. Report:
~/agent/research/jacked-adversarial-pass-2-result-2026-10-13.md
