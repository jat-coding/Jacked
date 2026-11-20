# PWA → iPhone parity ledger

## Standing rule

**Any PWA change a user can see must add or update a row in this file in the same commit.** If the
change is new work the iPhone app doesn't have yet, also add or update a stage in
`ios/REWRITE_STATUS.json` in that commit. When the iPhone app catches up on a row, flip its status
here in the same commit that builds it, with file:line evidence.

## What this was checked against

- **PWA:** the live web app, `origin/main` `jacked-pwa/index.html` (BUILD v1.11.0, 2026-11-11). That is
  3 commits ahead of this checkout's `main` (abcf99d, 5bf1481, 982b4d7), so they are included.
  Every one of the 283 commits that touched `jacked-pwa/` was walked, plus the base app from the
  first commit (7e0ad91, v1.6), which has no per-feature commits. `pwa.html:N` refers to that
  origin/main file; line numbers in the local checkout differ slightly.
- **iPhone:** `ios/` at `main` 0a932dc (2026-11-11). Evidence is `file:line` in the Swift code at
  that commit. Nothing was marked present from a commit message or status note alone.
- Chores (version bumps, docs, tests only, merges, reverted changes, removed debug readouts) are left
  out. Repeated tweaks to one thing are one row.

**Status:** present = does the same thing. partial = exists but something the user would see is
different or missing (the notes column says what). missing = not in the iPhone app.
n/a = only makes sense in a browser, or was removed from the PWA.

**Notice (1-5):** how much a user would notice the gap. 5 = every session, 1 = obscure or cosmetic.

## Counts

Updated 2026-11-18 (rows 17, 25, 28, 40, 42, 43, 45, 55 built or closed; counts below are after that), earlier 2026-11-17 (parity backlog pass, then rows 16 and 54 decided by Mr. Roni the same evening): rows built that day stay in section 1 with status present and their evidence, so the change is visible; before the pass it was missing 33, partial 31, present 220.

| status | rows |
|---|---|
| missing | 11 |
| partial | 12 |
| present | 260 |
| n/a | 20 |
| **total** | **303** |

## Design audit 2026-11-19 (iPhone vs the PWA, cosmetic only)

Method: every screen enumerated from `Jacked/Views`, tokens compared with the PWA CSS (`:root`, `.cw`/`.sec` at index.html:619, `.md` :257, `.es` :450, `.btn.sm`), simulator screenshots of Home, Routines, Library, Metrics, Friends, My Profile and a workout detail after the change. Behaviour unchanged.

| deviation found | PWA | fix (shared token or component) |
|---|---|---|
| Cards were flat bg2, 1px border, 18pt radius | gradient #1a1a21 to #131318, 20pt, no border, top highlight, shadow | `CardBackground` / `.card()` rewritten; new `.cwCard()` |
| Card padding was 14, 16 or 18 depending on screen | 18 | `Theme.cardPad`, `.cwCard()` on every top-level card |
| Suggested-today card hand-rolled its own fill | same card with a blue outline | uses `.cwCard()` plus blue stroke |
| Routines / Library / Metrics / Friends titles had the teal dot | only JACKED. has it | `PageHeader.accentDot` defaults off; Home passes true |
| Header actions (+ New, + Custom, Reorder, + Friend) were 14pt capsules | `.btn.bg.sm`: 12pt text, 12pt radius | `HeaderPillStyle` |
| Sheets mixed system grey, black and bg2, no shared top radius | `.md`: bg2, 24pt top radius | `sheetChrome()` inside `popup()`, `popup(dirty:)`, `SheetScaffold`; Reorder and Add Exercise pickers now bg2 |
| Five different empty states | `.es` | `EmptyState` component |
| Hex literals retyped (gold x30, suggested gold, amber, missed red, alert red, hairline, stat well) | one CSS value each | `Theme.gold/goldSoft/amber/missed/alert/hairline/well` |
| 37 bare corner radii (2, 6, 7, 8, 9, 10, 14, 20) | scale | `Theme.radiusXS/SM/radius/Tile/Card`; 7 and 9 folded to 8, 10 to 12 |
| Block gaps 20 and 22 mixed on Home | 22 | `Theme.blockGap` |
| Badge colours duplicated (teal, grey) | tokens | `BadgeUI` now points at `Theme.accent` / `Theme.muted` |

Not changed, on purpose: the floating nav is dark glass here, solid bg2 in the PWA (decided in e33118b). Still open: gold-while-holding-Jacked look (row 11), pinned page titles (row 32), Friends "Loading friends..." is text where Home uses a spinner. Not captured on screen after the change: the live workout, Finish summary, Add Friend, Create Exercise, Routine editor, Achievements and Recap sheets (they compile and take the same chrome).

---

## 1. Missing and partial, ranked by how much a user would notice

| # | feature | PWA commit or location | iOS status | evidence | notes | notice |
|---|---|---|---|---|---|---|
| 1 | Live workout shared with the watch: one shared record, set-by-set sync, Realtime with a 5 s poll only when Realtime is down | bc1b6b7, d955380, c43efae; pwa.html:3453-4017 live* | missing | searched ios/ for live_workouts / realtime: none. ios/Jacked/Data/WorkoutSession.swift:3-6 keeps the workout on the phone only | Also the "native-extras" stage. The PWA's live-sync safety fixes (cd17752, 0d281db, 9220b4a, 193d740) come with it. Not built this round: needs the live_workouts Realtime client, a big separate build. Next. | 4 |
| 2 | Pick up a workout started on the watch ("Resume the workout from your watch?") and merge two sessions ("Add this workout's sets to it?") | pwa.html:3887 liveIdle, 3824 liveOtherSession | missing | not found in ios/Jacked | Comes with row 1. Not built this round: comes with row 1. | 4 |
| 3 | Finish once across phone and watch (first finish wins, late sets folded in, "finished on your watch" closes it here, never stuck waiting on the server) | a2ca23e, d04da8c, e91e0c1, 193d740; pwa.html:3950 liveClaimFinish, 3866 liveCloseRemote | missing | not found in ios/Jacked | Without it a phone finish and a watch finish of the same session become two workouts. Not built this round: comes with row 1. | 4 |
| 4 | Pull from the cloud when you come back to the app (at most once a minute, not mid-workout) | 6e5a4d2; pwa.html:10025 visibilitychange | present | ios/Jacked/Views/MainTabView.swift:85-100 onChange(scenePhase): pull at most once a minute, skipped mid-workout | Built 2026-11-17 | 4 |
| 5 | Tap a set box to clear it; the old number becomes the grey hint and comes back if you type nothing | 9cca185; pwa.html:10003 focusin/focusout | present | ios/Jacked/Views/ActiveWorkoutView.swift:416-450 NumberField held/skipClear | Built 2026-11-17; restored value is re-committed if the box is left empty | 4 |
| 6 | Add Exercise picker order: "Used before" on top, then favourites, then the rest; hidden exercises left out | pwa.html:3325 renderAEList | present | ios/Jacked/Data/LibraryMath.swift:43-56 pickerList; ios/Jacked/Views/ActiveWorkoutView.swift:555-600 | Used before (8) on top, favourites then used then rest, hidden left out, first 60 + '+N more'. Built 2026-11-17 | 4 |
| 7 | Add/Switch picker muscle-group chips (10 groups, picked one first, swipeable) | a89d700, cfad0ff; pwa.html:3296 buildMuscleChips | present | ios/Jacked/Views/ActiveWorkoutView.swift:569 MuscleChipRow, :644-668 | Built 2026-11-17 | 3 |
| 8 | Switch Exercise opens pre-filtered to the old exercise's muscle group | 7db214d; pwa.html:3283 openAEModal | present | ios/Jacked/Views/ActiveWorkoutView.swift:605 chipOf on open; ios/Jacked/Data/LibraryMath.swift:34 | Built 2026-11-17 (simulator showed the picker; the pre-filter itself was not seen on screen, the test exercise had no muscle) | 3 |
| 9 | Auto-finish a forgotten workout (30 min idle or 90 min total; typed-but-unticked sets count; clock stops at last set; empty one discarded) | 1187d72, 60c972a; pwa.html:3441 awIsStale, 4023 autoFinishStale | present | ios/Jacked/Data/WorkoutSession.swift:51-86 isStale / autoFinishStale; ios/Jacked/Views/MainTabView.swift:85-90 | Checked at launch and on return to the app. The shared-with-watch part comes with row 1. Built 2026-11-17 | 3 |
| 10 | Live Bronze/Silver/Gold tier chip on an exercise mid-workout, tap for a popup naming the exact number that crossed the line ("Nice!") | d490d6b, fdb61e5, 7b64503; pwa.html:4249 mTierBadge, 5247 metricBadgeInfo | missing | ios/Jacked/Views/ActiveWorkoutView.swift:247-262 builds only PR / Go up / Lighter; no achModal equivalent | | 3 |
| 11 | Gold look while you hold Jacked: shimmering gold page titles, gold dot after the title, pulsing gold edge glow, gold outline on every card, gold tab pill and icon, remembered at launch | a0e8959, 40a3b00, 4f8835d, a9122f4; pwa.html:7 jkui_gold, 225-252 | missing | ios/Jacked/Views/MainTabView.swift:166-182 PageHeader dot always teal; NavCapsule has no gold state | The Jacked reward itself; nothing changes on screen when you earn it | 3 |
| 12 | Home calendar lights today as soon as one set is ticked in the live workout | 7d8f54e; pwa.html:2496 renderCal | present | ios/Jacked/Views/HomeView.swift:105 liveToday, CalendarCard trained set | Built 2026-11-17 | 3 |
| 13 | Tap the exercise name in a workout to open its info page | pwa.html:4262 openExInfo | present | ios/Jacked/Views/ActiveWorkoutView.swift:161 name opens ExerciseInfoSheet | Built 2026-11-17 | 3 |
| 14 | Workout detail: the set that made the PR is starred gold; a suggested PR set shows its tag | 18cf16b, 252dc08; pwa.html:6441 | present | ios/Jacked/Views/WorkoutSheets.swift:175-225 prAt / sugAt stars and SUGGESTED tag | Built 2026-11-17 | 3 |
| 15 | Workout detail stat tiles: Sets / Volume / Exercises, gold PRs tile when the workout set PRs, miles for a run | 18cf16b; pwa.html:6399-6416 openWD | present | ios/Jacked/Views/WorkoutSheets.swift:180-189 | Sets / Vol (or mi run) / Exercises / gold PRs. Date + time moved to a line above. Built 2026-11-17 | 3 |
| 16 | Share the monthly recap as an image + caption | 36dbb18; pwa.html:7629 recapImage, 7669 shareRecap | present | ios/Jacked/Views/MetricsView.swift:488-496 ImageRenderer + ShareLink in RecapSheet, :502-507 shareText (same caption as shareRecap) | Built 2026-11-17: Mr. Roni chose to bring it back (undoes 6573b35). BUILD SUCCEEDED; share sheet not tapped on a device | 3 |
| 17 | Hevy-imported workouts re-matched by exercise name for badges | pwa.html:4763 badgeStdId | n/a | ios/Jacked/Data/BadgeMath.swift:36 comment "not ported yet"; :67 uses stored id only | Decided 2026-11-16 (Mr. Roni): Hevy imports never count toward badges, so there is nothing to re-match. Closed, not a gap | 3 |
| 18 | Cached friends list paints instantly on launch | 1aa0103; pwa.html:8521 jk_friendsCache | present | ios/Jacked/Data/FriendsStore.swift:28-55 cache per account; ios/Jacked/Views/MainTabView.swift:105 | Built 2026-11-17 | 3 |
| 19 | Delete your own custom exercise (removes it from routines, keeps history, drops its photo) | 6af01e4; pwa.html:1964 deleteEx | present | ios/Jacked/Views/LibraryView.swift:373 deleteCustom + menu item | Built 2026-11-17. Like the PWA, deleting your only custom exercise can be undone by the cloud merge (an empty local list yields) | 3 |
| 20 | Friends loaded right after sign-in (list and request dot ready before you open the tab) | 1aa0103; pwa.html:8613 onAuthed | present | ios/Jacked/Views/MainTabView.swift:105-107 refresh at sign-in | Built 2026-11-17 | 3 |
| 21 | Opening an invite link (?add=user) prefills a one-tap Add Friend | b3b5a5e; pwa.html:8427 handleInviteLink | partial | no onOpenURL / universal link in ios/; prefill only from DevHooks (ios/Jacked/Views/FriendsView.swift:97) | Sending the link works; opening one goes to the web app. Skipped: needs a universal link (apple-app-site-association on the web host) plus the bundle id/team (now final: the existing Jacked App Store id on Phil's team, 2026-11-17). | 3 |
| 22 | One routine-update question at Finish listing what changed (A → B switches, adds, removes, order): Update routine / Keep original | 24758c7, c6357fe, f712a16, a2ca23e; pwa.html:6115 maybeUpdateRoutine, 4447 noteSwap | present | ios/Jacked/Views/ActiveWorkoutView.swift:732-748 routineChanges, summary card with Update routine / Keep original | Built 2026-11-17. Switches are inferred by pairing removed and added exercises in order; the PWA records them as they happen (noteSwap) | 3 |
| 23 | Routine editor's exercise picker: muscle chips, pick several then "Add Selected" bar, X with checked exercises asks Add / Discard, "+ Create new exercise" | a89d700, 982b4d7; pwa.html:3325 renderAEList, 3393 updateMSBar, 3410 closeAE, 3420 confirmAESelection | partial | ios/Jacked/Views/RoutinesView.swift:516-544 ExercisePickerSheet | Search only, one exercise per open, no create | 3 |
| 24 | Start Workout sheet: routines newest first, each with its first 4 exercises, "+N" and description | 97b0914; pwa.html:4095 openQS | present | ios/Jacked/Views/RoutinesView.swift:554-580, FlowTags :644 | Built 2026-11-17 | 3 |
| 25 | Mini sticky stat bar once the big lifted/sets tile scrolls away | e8749e1; pwa.html:9946 _wMiniSync | present | ios/Jacked/Views/ActiveWorkoutView.swift LiveMiniBar + TileBottomKey | Built 2026-11-18: slim lifted / sets bar appears once the big tile scrolls off the top |
| 26 | Add Exercise refuses an exercise already in the workout | pwa.html:4382 addExToWorkout | present | ios/Jacked/Data/WorkoutSession.swift:183 add() refuses a duplicate | Built 2026-11-17 | 2 |
| 27 | "+ Create new exercise" from the workout's Add Exercise picker | pwa.html:991 aeModal | present | ios/Jacked/Views/ActiveWorkoutView.swift:572; ios/Jacked/Views/LibraryView.swift:548 onCreated | New exercise goes straight into the workout. Built 2026-11-17 | 2 |
| 28 | Tap the "suggested" PR tag to see what it means | 0a9c068; pwa.html:6093 SUG_EXPLAIN | present | ios/Jacked/Views/WorkoutSheets.swift DaySheet sugInfo alert + tag Button | Built 2026-11-18: day sheet tag now opens the same explanation | 2 |
| 29 | Workout detail shows the exercise note saved at finish | f9da482; pwa.html:6438 | present | ios/Jacked/Data/Backup.swift WorkoutExercise.note; ios/Jacked/Views/WorkoutSheets.swift:200 | Built 2026-11-17 | 2 |
| 30 | Workout detail: runs show total miles + best pace under the name; cable attachment shown | pwa.html:6427-6437 | partial | ios/Jacked/Views/WorkoutSheets.swift:142 runLine | Miles + best pace built 2026-11-17; cable attachment shown from 2026-11-18 (row 42) in the exercise heading | 2 |
| 31 | Old PR records raised to the heaviest real lift at launch | 252dc08; pwa.html:5809 enforceDocumentedPRs | missing | searched ios/ for enforce: none | An iPhone-only user keeps an old estimate-based record until the web app runs on that account | 2 |
| 32 | Page title and Library search/chips stay pinned while scrolling | 98531e8, 7642a3b; pwa.html:110/113 .ph .sticky-sub | missing | PageHeader inside the scroll view: ios/Jacked/Views/LibraryView.swift:23, ios/Jacked/Views/RoutinesView.swift:16 | | 2 |
| 33 | Hold time opens in the exercise's saved unit (set when creating or editing the exercise) | 37ef4e6; pwa.html:2957 ceRecompute, 5340 durUnit | present | ios/Jacked/Data/WorkoutSession.swift:168; ios/Jacked/Views/LibraryView.swift:548 create saves durUnit | Built 2026-11-17 | 2 |
| 34 | Bodyweight lifts default to Bodyweight even when the workout starts before the library loads | abcf99d; pwa.html:1917 hydrateAWFromLib | partial | ios/Jacked/Data/ExerciseCatalog.swift:17 phone cache; open workout never refilled | Only bites on first launch or an empty cache | 2 |
| 35 | Reopening the app asks "Resume your unfinished workout?"; one with no sets is dropped | pwa.html:4042 maybeResumeAW | present | ios/Jacked/Data/WorkoutSession.swift:59 resolveOnLaunch; ios/Jacked/Views/MainTabView.swift:50 | Empty one dropped, stale one auto-finished, else Resume / Discard. Built 2026-11-17 | 2 |
| 36 | "Return to workout" bar shows the running time | pwa.html:2305 updateResumeBar | present | ios/Jacked/Views/MainTabView.swift:37 | Built 2026-11-17 | 2 |
| 37 | Friends refresh when the app comes back to the front | pwa.html:10039-10040 | present | ios/Jacked/Views/MainTabView.swift:99 | Built 2026-11-17 | 2 |
| 38 | Library: selected muscle chip jumps to the front with a tick | a89d700; pwa.html:2134 buildMuscleChips | present | ios/Jacked/Views/LibraryView.swift:27 MuscleChipRow (shared) | Built 2026-11-17 | 2 |
| 39 | Create Exercise picks sensible tracking defaults (Bodyweight equipment → BW + reps, Cardio → distance) | pwa.html:2978 updateTrackingFields | present | ios/Jacked/Views/LibraryView.swift:485-492 | Built 2026-11-17 | 2 |
| 40 | Sign out with an honest warning: syncs first, warns if changes haven't reached the cloud, blocked mid-workout | 82a136a, a5a285b; pwa.html:9331 signOut | present | ios/Jacked/Views/ProfileSheet.swift startSignOut + Sign Out confirmationDialog | Built 2026-11-18: blocked mid-workout, pushes unsent changes first, then says backed up to <name> or "NOT reached the cloud yet". The fixed note above the button still says the phone copy is removed (BackupStore keeps it); no "saved only on this device" branch since an iOS account is always cloud-enrolled | 2 |
| 41 | Unsent changes retried when the app comes back to the front | 97deee9; pwa.html:9150-9196 markDirty / drainSync | present | ios/Jacked/Views/MainTabView.swift:85-100 (refresh pushes dirty; mid-workout push only) | Built 2026-11-17 | 2 |
| 42 | Cable lifts: Pulley / Single choice, saved on the workout and shown in history | 7e0ad91; pwa.html:4545 setCable | present | ios/Jacked/Data/WorkoutLog.swift LogExercise.cable; ios/Jacked/Views/ActiveWorkoutView.swift Cable OptionRow; ios/Jacked/Views/WorkoutSheets.swift name suffix | Built 2026-11-18: Pulley / Single on cable lifts, saved on the workout, shown beside the name in history. Pace/PR math unchanged (the PWA does not use it either) |
| 43 | Edit Workout: Sec / Min / Hr switch for timed holds | pwa.html:6490-6495 setDurUnitWE | present | ios/Jacked/Views/WorkoutSheets.swift EditWorkoutSheet exerciseCard UnitsPicker + setDurUnit | Built 2026-11-18: Sec / Min / Hr above the sets, values stay seconds |
| 44 | Grip / variant picker when creating an exercise (Close Grip, Incline…, added to the name) | 7e0ad91; pwa.html:2939 gripOptionsFor | missing | ios/Jacked/Views/LibraryView.swift:385 comment says not built | | 1 |
| 45 | "+ New section…" option inside the routine editor's section picker | f4b7bc2; pwa.html:3145 renderRSectionOptions | present | ios/Jacked/Views/RoutinesView.swift RoutineEditorSheet "+ New section…" + findOrCreateSection | Built 2026-11-18: asks for a name, reuses a section with the same name (any case), else saves a new one and selects it | 1 |
| 46 | "Restore from a backup file" on the login screen | 7e0ad91; pwa.html:697 ob0 | missing | not in ios/Jacked/Views/AuthView.swift | Import exists after sign-in (present) | 1 |
| 47 | "You're all set" step after sign-up with Copy Username | 7e0ad91; pwa.html:714 ob2 | missing | not in ios/Jacked/Views/AuthView.swift | | 1 |
| 48 | Workout detail lists only ticked sets (all if none ticked) | pwa.html:6420 | present | ios/Jacked/Views/WorkoutSheets.swift:191 | Built 2026-11-17 | 1 |
| 49 | Version number at the bottom of Home | pwa.html:2436 homeVersion | present | ios/Jacked/Views/HomeView.swift:42 | Built 2026-11-17 | 1 |
| 50 | Monthly recap fits one phone screen, no scrolling | d7a7ef5, f391ee5, b8f67ec | partial | ios/Jacked/Views/MetricsView.swift:485 scrolling sheet | | 1 |
| 51 | Muscle Map "how it's scored" popup | 364a823; pwa.html:7397 muscleMapInfo | partial | ios/Jacked/Views/MetricsView.swift:368-407 | Missing the tier-to-Strength-Level mapping and the "before age adjustment" note | 1 |
| 52 | Repaired PR records rebuilt at launch (back-extension repair marker) | 8565a62; pwa.html:5692 repairBackExtBW, 5745 enforcePRRepairs | partial | ios/Jacked/Data/BackupMerge.swift:49-50, 166-185 | iOS honours the marker in merges but doesn't rebuild a stale record at launch | 1 |
| 53 | "Add assist/band weight?" toggle when creating an exercise | pwa.html:2957 ceRecompute | present | ios/Jacked/Views/LibraryView.swift:476 toggle shown on create, saved by create() | Built 2026-11-17 | 1 |
| 54 | Routines with no section are grouped by muscle group (was: filed under "Unsorted") | f4b7bc2; jacked-pwa/index.html:6963 routineGroupLabel, :6974 suggestSectionId, :6982 routineBlocks, :3127 renderRoutines, :7804 Reorder list | present | ios/Jacked/Views/RoutinesView.swift:321-324, 340-349, 399-410 (unchanged) | Decided 2026-11-17: iOS grouping wins, PWA ported to it. Both: majority group, tie = first of Chest/Back/Shoulders/Biceps/Triceps/Legs/Glutes/Core, none = Full Body; a legacy "Unsorted" section is hidden and its routines shown under their group. tests/e2e/routine-groups.mjs 13/13 | 1 |
| 55 | Auto rest and body weight save the moment they change | pwa.html:9196 toggleAutoRest, saveBWField | present | ios/Jacked/Views/ProfileSheet.swift saveBWField (focus loss on the weight box) | Built 2026-11-18: weigh-in logged when the box is left, no Save Profile needed | 1 |
| 56 | Tabler line icons everywhere | 3af3c0b, 141438f, 34047e9 | partial | ios/Jacked/Theme/JIcon.swift:6-37 | A few Apple system icons remain (plus, return arrow, search clear, units check, ellipsis) | 1 |
| 57 | One centered X closes every popup | 130db44 | partial | ios/Jacked/Views/WorkoutSheets.swift:516-530 SheetScaffold | Exercise info and pickers say "Close", editors "Cancel" (ios/Jacked/Views/LibraryView.swift:220, ios/Jacked/Views/RoutinesView.swift:493, 541) | 1 |
| 58 | Leaderboard chip icon in its own colour when selected (indigo Sessions etc.) | 5306853, 5aea04b | partial | ios/Jacked/Views/FriendsView.swift:301 | Icon takes the text colour | 1 |
| 59 | Jacked box shimmer while held | 2662c0c; pwa.html:225 .jh | partial | ios/Jacked/Views/AchievementsView.swift:122-129 | Plain gold outline, no shimmer | 1 |
| 60 | Watch heart rate / calories line under the workout clock | pwa.html:3816 liveShowStats | missing | not found in ios/Jacked | Comes with row 1. Not built this round: comes with row 1. | 2 |
| 61 | Supersets: "Paired as a superset" confirmation | 042673d; pwa.html:4403 tapSuperset | present | ios/Jacked/Data/WorkoutSession.swift:241 toast | Built 2026-11-17 | 1 |
| 62 | Sync now reports "Synced ✓ / Sync incomplete" | 6e5a4d2; pwa.html:9112 syncNow | present | ios/Jacked/Views/ProfileSheet.swift:123-140 | Built 2026-11-17 | 1 |
| 63 | Plate calculator keeps its numbers until the unit changes | pwa.html:6363 openPlate | present | ios/Jacked/Views/ActiveWorkoutView.swift:673-676 AppStorage, cleared on unit change | Built 2026-11-17 | 1 |
| 64 | Rest timer bar floats over every page, not just the workout screen | pwa.html:6351 restTick | partial | ios/Jacked/Views/ActiveWorkoutView.swift:423 RestBar | iOS adds a Lock Screen Live Activity instead (ios/Jacked/Features/RestLiveActivity.swift) | 1 |

---

## 2. Present

### Workout logging

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Start Workout sheet with Empty Workout at the top | a293f40 | present | ios/Jacked/Views/RoutinesView.swift:547-560 | |
| Start from a routine: sets laid out like last time, last numbers greyed | pwa.html:4113 seedSets | present | ios/Jacked/Data/WorkoutSession.swift:64; ios/Jacked/Data/WorkoutLog.swift:345 | |
| Start an empty workout on a past calendar day | pwa.html:2546 startEmptyOn | present | ios/Jacked/Data/WorkoutSession.swift:53; ios/Jacked/Views/HomeView.swift:85 | |
| Starting while a workout is open asks Discard & start / Keep it | pwa.html:4137 | present | ios/Jacked/Data/WorkoutSession.swift:38; ios/Jacked/Views/MainTabView.swift:50-54 | |
| Running clock and workout name in the header | pwa.html:4183 updWT | present | ios/Jacked/Views/ActiveWorkoutView.swift:47-51, 110 | iOS shows h:mm:ss past an hour |
| Big lifted / sets-done tile | pwa.html:4200 renderWS | present | ios/Jacked/Views/ActiveWorkoutView.swift:84 | |
| Set rows: weight and reps in your unit, greyed suggestion | pwa.html:4318-4340, 4473 | present | ios/Jacked/Views/ActiveWorkoutView.swift:301; ios/Jacked/Data/WorkoutLog.swift:359 | |
| Typed negative numbers become 0 | 34a8960 | present | ios/Jacked/Data/WorkoutSession.swift:204-205 | |
| PREV column (last time, else PR, else dash) | pwa.html:4318 prevStr | present | ios/Jacked/Views/ActiveWorkoutView.swift:362 | |
| Done tick fills blanks from the suggestion, row highlights | pwa.html:4484 togSet | present | ios/Jacked/Data/WorkoutSession.swift:209; ios/Jacked/Views/ActiveWorkoutView.swift:348-354 | |
| Add Set / remove last set | pwa.html:4501 addSet | present | ios/Jacked/Views/ActiveWorkoutView.swift:213-220 | iOS also has long-press delete |
| Rest timer: countdown, −15 / +15 / Skip, buzz at the end | pwa.html:6351-6358 | present | ios/Jacked/Views/ActiveWorkoutView.swift:423; ios/Jacked/Data/WorkoutSession.swift:223-228 | See row 64 |
| Auto rest after each ticked set, default rest length | pwa.html:4495 | present | ios/Jacked/Data/WorkoutSession.swift:218 | |
| Plate calculator | pwa.html:6363, 6374 calcPlates | present | ios/Jacked/Views/ActiveWorkoutView.swift:560; ios/Jacked/Data/WorkoutLog.swift:488 | See row 63 |
| Supersets: link two exercises, "Superset with X", unlink, blue edge | 042673d | present | ios/Jacked/Data/WorkoutSession.swift:167-191; ios/Jacked/Views/ActiveWorkoutView.swift:137-159, 225 | |
| Reorder exercises by dragging, keyed by exercise id | ece635a, 0165c0e | present | ios/Jacked/Views/ActiveWorkoutView.swift:473, 479 | From the ⋯ menu |
| Remove an exercise, asks first if it has logged sets | 34a8960; pwa.html:5316 | present | ios/Jacked/Views/ActiveWorkoutView.swift:164-165, 229-231 | |
| Switch Exercise: duplicate refused, same one keeps its sets | e91e0c1; pwa.html:4431 | present | ios/Jacked/Data/WorkoutSession.swift:139-145 | |
| Single / Both control on the exercise card (105 dumbbell lifts) | 93324d3, b69893d | present | ios/Jacked/Views/ActiveWorkoutView.swift:182-185; ios/Jacked/Data/WorkoutSession.swift:148 | |
| Single / Both carries over from last session | cc49ebc | present | ios/Jacked/Data/WorkoutLog.swift:345-356; ios/Jacked/Data/WorkoutSession.swift:131 | |
| Bodyweight lifts: Bodyweight / + Added / − Assist, set BW | a9d1a9f, f6c74a1; pwa.html:4580 | present | ios/Jacked/Views/ActiveWorkoutView.swift:187-190, 321-324; ios/Jacked/Data/WorkoutLog.swift:145-166 | |
| Cardio time typed like a stopwatch (5.30 = 5 min 30 s) | 869e8b7, d8bd12d | present | ios/Jacked/Data/WorkoutLog.swift:380-388 | |
| Holds typed like a stopwatch | bcd66f7 | present | ios/Jacked/Data/WorkoutLog.swift:389-405 | |
| Hold unit Sec / Min / Hr on the card | 37ef4e6 | present | ios/Jacked/Views/ActiveWorkoutView.swift:191-195 | See row 33 |
| Runs: miles + minutes, pace per set, Best pace · Longest | pwa.html:4337, 4466 | present | ios/Jacked/Views/ActiveWorkoutView.swift:207-211, 283-287 | |
| One gold ★ on the record set, ★ PR chip | 19290ca, b4779ed | present | ios/Jacked/Data/WorkoutLog.swift:461; ios/Jacked/Views/ActiveWorkoutView.swift:251, 316 | |
| Suggested-PR tags hidden while logging | 80a7221 | present | ios/Jacked/Views/ActiveWorkoutView.swift:291 | |
| "PR: … · Suggested …" line under the name | 252dc08 | present | ios/Jacked/Views/ActiveWorkoutView.swift:281 | |
| Go up / Lighter chips by your rep range, tap to explain | 3fe5987, e513de7, c4ee8c5, 4754bd0 | present | ios/Jacked/Views/ActiveWorkoutView.swift:247-262; ios/Jacked/Data/WorkoutLog.swift:417 | |
| Exercise note: last note as grey hint | 984dacb | present | ios/Jacked/Views/ActiveWorkoutView.swift:451; ios/Jacked/Data/BackupStore.swift:119 | |
| Note copied onto the workout at finish | f9da482 | present | ios/Jacked/Data/WorkoutLog.swift:316, 327 | See row 29 |
| Finish asks first when no sets logged | pwa.html:6097 | present | ios/Jacked/Views/ActiveWorkoutView.swift:69-80 | |
| Finish summary: time, sets, lifted, PRs, suggested PRs, moved-up / lighter notes | pwa.html:6295, 6164 | present | ios/Jacked/Views/ActiveWorkoutView.swift:606; ios/Jacked/Data/WorkoutLog.swift:441 | iOS adds a share card |
| Summary: Save as a new routine | pwa.html:6334 | present | ios/Jacked/Views/ActiveWorkoutView.swift:668-669, 687-696 | |
| Untitled workouts named after the top lift | 3fe5987 | present | ios/Jacked/Data/WorkoutLog.swift:287, 330 | |
| Cancel workout (asks) | pwa.html:6343 | present | ios/Jacked/Views/ActiveWorkoutView.swift:33, 72-74 | |
| Minimize the workout and come back | pwa.html resumeBar | present | ios/Jacked/Views/ActiveWorkoutView.swift:44; ios/Jacked/Views/MainTabView.swift:44 | See row 36 |
| Haptics on tick, Single/Both, rest over, discard | f94ec8e | present | ios/Jacked/Theme/Haptics.swift; ios/Jacked/Data/WorkoutSession.swift:150, 212-214 | |
| Volume counts ticked sets; single-arm sets doubled | 6080711 | present | ios/Jacked/Data/WorkoutLog.swift:178, 309-311 | |
| Planks and static holds are timed | a9ba56b | present | ios/Jacked/Data/PWATables.swift:9; ios/Jacked/Data/ExerciseCatalog.swift:73 | |
| Back extensions never add body weight | 4bb37a7 | present | ios/Jacked/Data/PWATables.swift:8; ios/Jacked/Data/WorkoutLog.swift:146 | |

### Home and history

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Home profile button shows your photo, no square around it | 622cd87, 8d01bfe | present | ios/Jacked/Views/HomeView.swift:24-28, 286-307 | |
| Avatar address rebuilt from username + version | e415055 | present | ios/Jacked/Data/Backup.swift:22-26; ios/Jacked/Data/FriendsMath.swift:77-82 | |
| Streak box with keep-it-alive line | f3bdca3 | present | ios/Jacked/Views/HomeView.swift:106-135 | |
| Streak box hidden at 0 days | 4614e57 | present | ios/Jacked/Views/HomeView.swift:111 | |
| Best streak pill | a4eb27d | present | ios/Jacked/Views/HomeView.swift:112, 123-127 | |
| Streak math by calendar day, today not trained doesn't break it | 34a8960 | present | ios/Jacked/Data/HomeMath.swift:59-84 | |
| Month calendar: trained teal, missed faint red, future muted | 7e0ad91; pwa.html:2490 | present | ios/Jacked/Views/HomeView.swift:139-218 | |
| Today outlined; lit once a workout is finished | 9244bba | present | ios/Jacked/Views/HomeView.swift:193-197 | See row 12 |
| Tap the month name for Gym years | e1d61f1 | present | ios/Jacked/Views/HomeView.swift:161-164 | |
| Gym years: one flat day grid per year | bc9c8d5 | present | ios/Jacked/Views/HomeView.swift:312-383 | |
| Day sheet with title | pwa.html:2514 openDay | present | ios/Jacked/Views/WorkoutSheets.swift:44-54 | |
| Rest-day message | pwa.html:2524 | present | ios/Jacked/Views/WorkoutSheets.swift:6-41 | iOS rotates 21 lines; PWA has one |
| Day sheet: one exercise per row, gold PR lines, ★ N PRs | 18cf16b | present | ios/Jacked/Views/WorkoutSheets.swift:63-101 | |
| PR stars agree with the saved PR count | 5c1e3eb | present | ios/Jacked/Data/Backup.swift:115-145 | |
| Day sheet: suggested PR with tag | 252dc08, fc517d4 | present | ios/Jacked/Views/WorkoutSheets.swift:87-91 | See row 28 |
| Day sheet: View details, + Log a workout for this day | pwa.html:2525, 2552 | present | ios/Jacked/Views/WorkoutSheets.swift:102, 109 | |
| Start Workout on Home | 7e0ad91 | present | ios/Jacked/Views/HomeView.swift:35-39 | |
| Recent workouts: last 6, photo, date, sets, volume, runs show miles + pace | 7e0ad91 | present | ios/Jacked/Views/HomeView.swift:221-276 | |
| Suggested today: 3 groups ranked by longest untrained | a6999d9 | present | ios/Jacked/Data/SuggestMath.swift:175-192; ios/Jacked/Views/SuggestCard.swift:257-264 | |
| Suggestion knows what a workout trained | e0db06f | present | ios/Jacked/Data/SuggestMath.swift:122-140 | |
| Suggestion Start: matching routine, else your 5 most-done exercises | pwa.html:2392 | present | ios/Jacked/Data/SuggestMath.swift:148-170 | |
| Trusted-program pick of the day, rotating, synced | 79be845 | present | ios/Jacked/Data/SuggestMath.swift:206-226; ios/Jacked/Views/SuggestCard.swift:265-303 | |
| Trusted pick uses your saved copy if you added the program | pwa.html startCuratedRoutine | present | ios/Jacked/Views/SuggestCard.swift:337-345 | |
| "Let's get started" suggestion with no history | pwa.html:2398 | present | ios/Jacked/Views/SuggestCard.swift:245, 255 | |
| Dismiss the suggestion until tomorrow | pwa.html:2367 | present | ios/Jacked/Views/SuggestCard.swift:241, 325-327 | |
| Monthly recap card on Home, days 1-7 | 36dbb18 | present | ios/Jacked/Views/MetricsView.swift:561-596; ios/Jacked/Views/HomeView.swift:31 | |
| Full recap page with tiered badge grid | 36dbb18 | present | ios/Jacked/Views/MetricsView.swift:464-555 | See rows 16, 50 |
| Recap chips: crown, Challenge done, Comeback | a69cb7d | present | ios/Jacked/Views/MetricsView.swift:480-484, 510-523 | |
| Workout detail 3-dot menu: Edit / Save as Routine / Delete | 6af01e4 | present | ios/Jacked/Views/WorkoutSheets.swift:153-162 | |
| Delete workout: confirm, stays deleted, records rebuilt | 6af01e4, 34a8960 | present | ios/Jacked/Views/WorkoutSheets.swift:208-231; ios/Jacked/Data/HistRepair.swift:55-62 | |
| Save workout as routine | pwa.html:6563 | present | ios/Jacked/Views/WorkoutSheets.swift:190-194, 234-248 | |
| Edit workout: name, date, sets, ticks, add/remove set, remove exercise | pwa.html:6470-6561 | present | ios/Jacked/Views/WorkoutSheets.swift:263-427; ios/Jacked/Data/HistRepair.swift:23-52 | |
| Edit workout: add a forgotten exercise | b487c03 | present | ios/Jacked/Views/WorkoutSheets.swift:308-309, 394-404 | |
| Edit workout rebuilds PR, run and hold records | 7c33135, dc1b68e | present | ios/Jacked/Data/HistRepair.swift:83-139 | |
| Edit workout: stopwatch notation for runs and holds | 869e8b7, bcd66f7 | present | ios/Jacked/Views/WorkoutSheets.swift:353, 361 | |

### Metrics and PR rules

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Overview card | 9776fb8 | present | ios/Jacked/Views/MetricsView.swift:104-106 | |
| Card default order | 9776fb8 | present | ios/Jacked/Data/MetricsMath.swift:528-546 | iOS default (Achievements, Muscle Map first) differs on purpose, ea50aca |
| Workout Summary card | pwa.html:7431 | present | ios/Jacked/Views/MetricsView.swift:109-126 | |
| Avg min/session in minutes, unrecorded left out | 4614e57 | present | ios/Jacked/Data/MetricsMath.swift:123-128 | |
| Body Weight card: log, synced with Profile, trend line | pwa.html:7452, 1714 | present | ios/Jacked/Views/MetricsView.swift:215-225, 253-308 | |
| Body-weight log merged by date across devices | 77901e2 | present | ios/Jacked/Data/BackupMerge.swift:75-78 | |
| Lifetime Stats | pwa.html:7502 | present | ios/Jacked/Views/MetricsView.swift:127-132 | |
| Top PR = heaviest raw weight | e7b940a | present | ios/Jacked/Data/MetricsMath.swift:133-161 | |
| Monthly Recaps card, crown if you won | 36dbb18 | present | ios/Jacked/Views/MetricsView.swift:145-174 | |
| Muscle Map: body figure + ranked list in one card | 86a544e, 4081f6d, 0e23fee | present | ios/Jacked/Views/MetricsView.swift:311-365; ios/Jacked/Views/BodyFigure.swift:5-30 | |
| Ranking by strength vs body weight, set counts fallback | dfc6a58 | present | ios/Jacked/Data/MetricsMath.swift:499-512 | |
| Tiers: 90 days, rep cap, per-exercise scaling, top-3 average | 5832e21 | present | ios/Jacked/Data/MetricsMath.swift:373, 422-447 | |
| Multi-muscle credit | 02aaab3 | present | ios/Jacked/Data/MetricsMath.swift:307-337, 450-467 | |
| Triceps and core from the strongest lift | d0abf57 | present | ios/Jacked/Data/MetricsMath.swift:382, 469-497 | |
| Sourced strength ladders scaled by sex and age | 364a823, a6999d9 | present | ios/Jacked/Data/MetricsMath.swift:355-404 | |
| Only ticked sets count toward tiers | 4b95792 | present | ios/Jacked/Data/MetricsMath.swift:425 | |
| Card reorder popup with drag | d03ae9b, 981263d | present | ios/Jacked/Views/MetricsView.swift:410-461 | |
| Hide a card with ✕; bring back from Reorder | 7a1d817, a9a5cbc | present | ios/Jacked/Views/MetricsView.swift:35-39, 191-198, 426-436 | |
| Documented PR = heaviest real lift, estimates saved as suggested | 252dc08 | present | ios/Jacked/Data/WorkoutLog.swift:209-225 | See row 31 |
| Suggested PR shown in Library, day sheet and finish screen | 252dc08 | present | ios/Jacked/Views/LibraryView.swift:147-153 | Not on workout detail, row 14 |
| Same weight with more reps is a PR | b4779ed | present | ios/Jacked/Data/WorkoutLog.swift:217, 220 | |
| Reset PR on the exercise page | b4f6d5e | present | ios/Jacked/Views/LibraryView.swift:198-201, 228-233, 351-359; ios/Jacked/Data/BackupMerge.swift:51-55 | |

### Achievements

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Bench-Maxing | 5c453c3; pwa.html:6587 computeBadges | present | ios/Jacked/Data/BadgeMath.swift:324 | |
| Bench ladder from IPF GOODLIFT, eased for 41+ | 5c453c3, a6999d9 | present | ios/Jacked/Data/BadgeMath.swift:73, 79-91 | |
| Shoulder-Maxing (standing OHP; seated never counts) | 79db82b, f712a16 | present | ios/Jacked/Data/BadgeMath.swift:328-330 | |
| Leg-Maxing (both squat ids incl. full squat) | 79db82b, 23abad8 | present | ios/Jacked/Data/BadgeMath.swift:331-334 | |
| Pull-up-Maxing | 10d7b45 | present | ios/Jacked/Data/BadgeMath.swift:69, 164-168 | |
| Push-up-Maxing | 10d7b45 | present | ios/Jacked/Data/BadgeMath.swift:344-345 | |
| Cardio-Maxing (mile pace, sex + age graded, Gold 6:30) | 10d7b45, f3d5c58 | present | ios/Jacked/Data/BadgeMath.swift:121-126, 169-182 | |
| Sourced standards scaled by sex, body weight, age | a6999d9, 2125939 | present | ios/Jacked/Data/BadgeMath.swift:92-126 | |
| Silver always the midpoint, no kept old tiers | 742b76e | present | ios/Jacked/Data/BadgeMath.swift:101-103, 117-118 | |
| Dumbbell +15%, Smith −15%, highest credited wins | 21fa0c5, 275ecbd | present | ios/Jacked/Data/BadgeMath.swift:46-52, 142-158 | |
| Each badge counts its exact library ids incl. duplicates | cc7058a, 9e7a073 | present | ios/Jacked/Data/BadgeMath.swift:67-68 | See row 17 |
| Badges count ticked sets only | 4b95792 | present | ios/Jacked/Data/BadgeMath.swift:146, 166, 186 | |
| 1000lb Club | b5555fa, 21fa0c5 | present | ios/Jacked/Data/BadgeMath.swift:236-253, 335-341 | |
| PR-Maxing (7 PRs in any rolling 7 days) | 90eda66 | present | ios/Jacked/Data/BadgeMath.swift:194-207, 351 | |
| Consistency-Maxing | 9cca185 | present | ios/Jacked/Data/BadgeMath.swift:209, 353 | |
| Coward-Maxing, hidden until earned | 9cca185, 5d969e0 | present | ios/Jacked/Data/BadgeMath.swift:222-232; ios/Jacked/Views/AchievementsView.swift:69 | |
| Challenge-Maxing | 36dbb18 | present | ios/Jacked/Data/BadgeMath.swift:291-311, 356-361 | |
| Comeback-Maxing (Steady / Bounce back) | 36dbb18, 504784b | present | ios/Jacked/Data/BadgeMath.swift:282-289, 362-370 | |
| Variety-Maxing | pwa.html:6587 | present | ios/Jacked/Data/BadgeMath.swift:261-266, 349 | |
| Jacked (monthly + 3-month badges, any tier; locked by Coward) | d59bfb7, 3fbc3e1 | present | ios/Jacked/Data/BadgeMath.swift:376-386 | |
| Monthly badge record saved to the account | pwa.html:6796 | present | ios/Jacked/Views/AchievementsView.swift:333-341; ios/Jacked/Views/MetricsView.swift:65-68 | iOS writes it only while Metrics is on screen |
| Highest-ever kept per badge | f7ac70a | present | ios/Jacked/Data/BadgeMath.swift:268-279 | |
| Metrics card: one "Badges earned X / Y" bar | 7a1d817 | present | ios/Jacked/Views/AchievementsView.swift:78-95 | |
| Achievements page grouped Monthly / 3-month / Permanent | 970f5dd, 2662c0c | present | ios/Jacked/Views/AchievementsView.swift:61-67, 108-142 | |
| Jacked box on top, gold when held, grey when locked | 0ead20c, 8a71b06 | present | ios/Jacked/Views/AchievementsView.swift:120-132 | See row 59 |
| Badge row pills (tier / Earned / Locked) | 2662c0c | present | ios/Jacked/Views/AchievementsView.swift:150-178 | |
| Badge page: how to earn, per-exercise how-to | c281b50, 37d1c1e | present | ios/Jacked/Views/AchievementsView.swift:185-218 | |
| Tier rows with You and each lift | 1f8e7ea | present | ios/Jacked/Views/AchievementsView.swift:219-252 | |
| Tap a reached tier for the exact set | 3fbc3e1 | present | ios/Jacked/Views/AchievementsView.swift:223-242 | |
| Tap Highest-ever for the exact set | d6e1454 | present | ios/Jacked/Views/AchievementsView.swift:261-278 | |
| Locked Jacked teases a Reward; months held | 32cfc53 | present | ios/Jacked/Views/AchievementsView.swift:279-284 | |
| Resets note per badge | 1c22576 | present | ios/Jacked/Views/AchievementsView.swift:285 | |
| Start-workout button per badge | 329970a, 9e7a073 | present | ios/Jacked/Data/BadgeMath.swift:556-591; ios/Jacked/Views/AchievementsView.swift:293-296 | |

### Friends

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| One list: Close buddies then Buddies, star toggle | 622cd87 | present | ios/Jacked/Views/FriendsView.swift:52-65, 209-223, 263-269 | |
| Friend row: avatar, name, stats, crown, Jacked glow | pwa.html:8059 | present | ios/Jacked/Views/FriendsView.swift:209-249, 311-332 | |
| Pending and sent requests stay pending until acted on | 9cb6197 | present | ios/Jacked/Views/FriendsView.swift:66-88; ios/Jacked/Data/FriendsStore.swift:62-74 | |
| Request count on + Friend and red dot on the tab | pwa.html:8326 | present | ios/Jacked/Views/FriendsView.swift:43-46; ios/Jacked/Views/MainTabView.swift:27 | See row 20 |
| Add friend by username | pwa.html:8437 doAF | present | ios/Jacked/Data/FriendsStore.swift:92-125 | |
| Accept guard, no stacked "Friend added" | 0321da2 | present | ios/Jacked/Data/FriendsStore.swift:62-74 | |
| Invite link with Share and Copy | b3b5a5e | present | ios/Jacked/Views/FriendsView.swift:374-395 | See row 21 |
| Failed refresh keeps the list | 8182d1c | present | ios/Jacked/Data/FriendsStore.swift:28-59 | |
| Leaderboards: ranked, medals, fresh-month message | bcd411b | present | ios/Jacked/Views/FriendsView.swift:122-185 | |
| Six chips with explanation | pwa.html:8275 | present | ios/Jacked/Views/FriendsView.swift:18-25, 143-144 | See row 58 |
| This Month default, resets on the 1st | 98531e8, 9037bc5 | present | ios/Jacked/Views/FriendsView.swift:12 | |
| Crown for last month's top lifter per board | a69cb7d, 7d23535 | present | ios/Jacked/Views/FriendsView.swift:35, 157 | |
| Crown key popup | 1f66e6d | present | ios/Jacked/Views/FriendsView.swift:103-105, 128-131 | |
| Gold glow rows = Jacked | e7e3b31 | present | ios/Jacked/Views/FriendsView.swift:179, 221, 311-321 | |
| Own row painted immediately | 3cd1267 | present | ios/Jacked/Views/FriendsView.swift:31 | |
| Your stats and badges published for friends | pwa.html:8673 syncMe | present | ios/Jacked/Views/MainTabView.swift:63-70 | |
| Leaderboard poll slowed to save server load | 1c3e334 | present | ios/Jacked/Views/FriendsView.swift:112-117 | 75 s |
| Friend profile: avatar, tap for lightbox | 94663e9, 3df1a3e | present | ios/Jacked/Views/FriendProfileView.swift:26-28, 292-308 | |
| Friend profile stats | pwa.html:8089 | present | ios/Jacked/Views/FriendProfileView.swift:76-90 | |
| Certified Jacked tile | 7a1d817, a9a5cbc | present | ios/Jacked/Views/FriendProfileView.swift:63-75 | |
| Friend mini calendar, today outlined | 47b8ed2 | present | ios/Jacked/Views/FriendProfileView.swift:91-94, 203-239 | |
| Gym years from a friend's profile | e1d61f1 | present | ios/Jacked/Views/FriendProfileView.swift:96-104 | |
| Last 30 days of workouts, every set in your unit | pwa.html:8181 | present | ios/Jacked/Views/FriendProfileView.swift:105-114, 159-199 | |
| Copy a friend's workout to your own | pwa.html:8220 | present | ios/Jacked/Views/FriendProfileView.swift:142-156 | |
| Friend badge list, Jacked first | f87a658 | present | ios/Jacked/Views/FriendProfileView.swift:242-290 | |
| Remove Friend with confirm at the bottom of their profile | 6af01e4 | present | ios/Jacked/Views/FriendProfileView.swift:115-120 | |
| Bad friend data never blanks the tab | 3ed0940, 88f2672 | present | ios/Jacked/Data/FriendsMath.swift Person init?(row:) | |

### Library

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Search tolerant of plurals and punctuation | pwa.html:2563 | present | ios/Jacked/Data/LibraryMath.swift:41 | |
| 10 body-map muscle chips | a89d700 | present | ios/Jacked/Data/LibraryMath.swift:6; ios/Jacked/Views/LibraryView.swift:27-37 | See row 38 |
| "643 loaded" next to the title | ac11206 | present | ios/Jacked/Views/LibraryView.swift:43-44 | |
| Favourites, then used before, then the rest | pwa.html:2575 | present | ios/Jacked/Data/LibraryMath.swift:68-80 | |
| Library row with photo, star, details and PRs | 252dc08 | present | ios/Jacked/Views/LibraryView.swift:111-158 | |
| Favourite an exercise | pwa.html:1952 | present | ios/Jacked/Views/LibraryView.swift:192, 364 | |
| Hide a built-in exercise behind 3-dot | 6af01e4 | present | ios/Jacked/Views/LibraryView.swift:224, 266, 372 | |
| Exercise page photos | 1943b6f | present | ios/Jacked/Views/LibraryView.swift:273-288 | |
| Exercise page top-weight / hold chart | pwa.html:2615 | present | ios/Jacked/Views/LibraryView.swift:307-335 | |
| Exercise page how-to | pwa.html:2615 | present | ios/Jacked/Views/LibraryView.swift:203-213 | |
| Exercise page Suggested PR block | 252dc08 | present | ios/Jacked/Views/LibraryView.swift:290-304 | |
| Edit a built-in exercise (rename, equipment, notes, assist) | 37ef4e6 | present | ios/Jacked/Views/LibraryView.swift:518-546 | |
| Edit muscle group | 37ef4e6 | present | ios/Jacked/Views/LibraryView.swift:446, 539-543 | iOS also allows it on built-ins (26d3891) |
| Create custom exercise | pwa.html:2838 | present | ios/Jacked/Views/LibraryView.swift:386-472, 552-564 | See rows 39, 44, 53 |
| Bodyweight toggle in Create Exercise | ea3a8a9 | present | ios/Jacked/Views/LibraryView.swift:448 | |
| Photo for a custom exercise, this device only | 1943b6f | present | ios/Jacked/Views/LibraryView.swift:425-443, 503-513; ios/Jacked/Data/ExPhotoStore.swift | |
| Built-in machines (Lateral Raise, Hip Thrust, Assisted Pull-Up, Assisted Dip) | dc595ca | present | ios/Jacked/Data/PWATables.swift:258-261 | |
| Whole-word name matching, categorization audit | b77d383, 1633504 | present | ios/Jacked/Data/MetricsMath.swift:551; ios/Jacked/Data/ImportMath.swift:250 | |
| Bodyweight tag fixes | a9d1a9f, f6c74a1 | present | ios/Jacked/Data/PWATables.swift:238, 240 | |
| Photos and list from Jacked's own storage | 93b6ebf | present | ios/Jacked/Data/Backup.swift:195-200; ios/Jacked/Data/ExerciseCatalog.swift:96 | |

### Routines

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Trusted Programs with today's pick | df5667f | present | ios/Jacked/Views/RoutinesView.swift:147-186 | |
| + Add to Routines | 79be845, 309681e | present | ios/Jacked/Views/RoutinesView.swift:195-209 | |
| Routines never added without asking | 9dbce00 | present | ios/Jacked/Views/SuggestCard.swift:109-113 | |
| Sections, alphabetical default | f4b7bc2 | present | ios/Jacked/Views/RoutinesView.swift:318-350 | See row 54 |
| Collapsible sections, saved | 97937c0 | present | ios/Jacked/Views/RoutinesView.swift:41-52, 122-128 | |
| Smaller section headers with a line | c10c747 | present | ios/Jacked/Views/RoutinesView.swift:43-49 | |
| Rename a section, duplicates refused | 309681e | present | ios/Jacked/Views/RoutinesView.swift:53-57, 131-143 | Long-press |
| + Section in the Reorder popup | 9b93ecb | present | ios/Jacked/Views/RoutinesView.swift:619-626 | |
| Reorder sections and routines by dragging | 64af965 | present | ios/Jacked/Views/RoutinesView.swift:582-631 | |
| Edit / Delete routine behind 3-dot | 93ac4bc | present | ios/Jacked/Views/RoutinesView.swift:231-235, 246-253 | |
| New / edit routine editor | pwa.html:3165 | present | ios/Jacked/Views/RoutinesView.swift:446-513 | See rows 23, 45 |

### Profile, account and sign-in

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Profile / Body Metrics tabs | 1dfa496, 93ed450 | present | ios/Jacked/Views/ProfileSheet.swift:84-86 | |
| Profile photo add / edit / delete | 6af01e4 | present | ios/Jacked/Views/ProfileSheet.swift:73-78, 386-416 | |
| Display name | pwa.html:9457 | present | ios/Jacked/Views/ProfileSheet.swift:203, 315 | |
| Change username, Copy Username | 0d20216 | present | ios/Jacked/Views/ProfileSheet.swift:205-215, 359-382 | |
| Units lb / kg | pwa.html:9457 | present | ios/Jacked/Views/ProfileSheet.swift:222, 335 | |
| Default rest, auto rest toggle | pwa.html:9196 | present | ios/Jacked/Views/ProfileSheet.swift:224, 234, 319 | See row 55 |
| Rep range Min / Max | e513de7 | present | ios/Jacked/Views/ProfileSheet.swift:226-231 | |
| Sex, birthday with age, body weight as a weigh-in | dfc6a58, 8182d1c | present | ios/Jacked/Views/ProfileSheet.swift:239-266, 322-325 | |
| Email add / change | 10f4508 | present | ios/Jacked/Views/ProfileSheet.swift:268-294, 446-476 | |
| Export backup | pwa.html:9642 | present | ios/Jacked/Views/ProfileSheet.swift:118, 485-492 | |
| Import Jacked backup | 88f2672 | present | ios/Jacked/Views/ProfileSheet.swift:497-523 | |
| Import Hevy / Strong CSV, lb or kg asked, negatives → 0 | d8d71ac, 816dc9e | present | ios/Jacked/Views/ProfileSheet.swift:171-175, 525-541; ios/Jacked/Data/ImportMath.swift:381-386 | |
| Sync now | 6e5a4d2, c7039e3 | present | ios/Jacked/Views/ProfileSheet.swift:120; ios/Jacked/Data/BackupStore.swift:50-79 | See row 62 |
| Send feedback | pwa.html:9575 | present | ios/Jacked/Views/ProfileSheet.swift:126-136, 432-444 | |
| Version label in Profile | pwa.html:9286 | present | ios/Jacked/Views/ProfileSheet.swift:146 | |
| Log in is the default screen | ccdddc5 | present | ios/Jacked/Views/AuthView.swift:7, 84 | |
| Log in with username or email | 73f1abd | present | ios/Jacked/Auth/AuthStore.swift:52-92 | |
| Sign up with optional email | 73f1abd | present | ios/Jacked/Views/AuthView.swift:94-165 | |
| Show / hide password | 09e77ec | present | ios/Jacked/Views/AuthView.swift:190-225 | |
| Weak / breached password message | 9cb6197 | present | ios/Jacked/Auth/AuthStore.swift:169 | |
| No-password-yet and rate-limit messages | 0d20216 | present | ios/Jacked/Auth/AuthStore.swift:77-79, 157 | |

### Sync and app-wide

| feature | PWA commit or location | iOS status | evidence | notes |
|---|---|---|---|---|
| Save on every change: read, merge, write only if nobody wrote in between | 6e5a4d2 | present | ios/Jacked/Data/BackupStore.swift:101-110, 186-247 | |
| Exercise notes merged per exercise; empty device never wipes cloud | ee1887c | present | ios/Jacked/Data/BackupMerge.swift:15, 25 | |
| Logging in never destroys this device's data | a6a41bd, 88f2672 | present | ios/Jacked/Data/BackupStore.swift:11-12, 270-285 | |
| Floating capsule nav, sliding pill, frosted glass | 79879f0, 3db2134, 631dd85 | present | ios/Jacked/Views/MainTabView.swift:220-268 | |
| Haptic on tab taps | f94ec8e | present | ios/Jacked/Views/MainTabView.swift:234 | |
| Nothing hidden behind the bottom nav | 5bf1481, d857676 | present | ios/Jacked/Views/MainTabView.swift:23 | |
| Opening a tab closes any popup | a6b675c | present | ios/Jacked/Views/MainTabView.swift:44 | Popups cover the tab bar |
| Single-button "Got it" info popups | 17bd87e | present | ios/Jacked/Views/ActiveWorkoutView.swift:233; ios/Jacked/Views/FriendsView.swift:103 | |
| One block-title style and spacing | 58ff2bc, ee2ab98 | present | ios/Jacked/Views/MainTabView.swift:191-201 | |
| Flat black background | 7642a3b | present | ios/Jacked/Theme/Theme.swift:6 | |

---

## 3. Not applicable to the native app

| feature | PWA commit or location | iOS status | why |
|---|---|---|---|
| Service worker cache fix and auto-update | a7f0999; pwa.html:10070-10137 | n/a | App Store handles updates |
| Keyboard closing instantly on text fields | 11d9a1e | n/a | Web input bug |
| Keyboard hides the bottom bar while typing | pwa.html:9992 | n/a | Browser layout |
| Android back button returns to Home | 2ba96a0, 3a14c93 | n/a | Android browser only |
| Fake portrait lock in landscape | a3783c9 | n/a | iOS app is portrait-only |
| iOS home-screen bottom strip and standalone gap fixes | 9b3b255, ae7d68b, 3e521b2 | n/a | Web app in Safari only |
| Browser tab scrolls under Safari's address bar | 04395a2 | n/a | Browser only |
| Old-install banner | 179aaa4, 550bf70 | n/a | Removed from the PWA |
| Page locked behind popups, nav never moves | e21b130, 8eaadec, 9b431e8, 449316a | n/a | Browser layout bugs |
| In-app confirm popup instead of the browser's | 46c9497 | n/a | Native alerts always show |
| Names escaped everywhere | a6a41bd | n/a | SwiftUI text can't run a name as code |
| Two browser tabs editing one workout | pwa.html:4057 | n/a | Browser only |
| GPS run tracker | d1e4a66, 51963dd | n/a | Removed from the PWA |
| Friend request realtime channel | f03803a | n/a | Removed from the PWA; poll replaces it |
| Legacy account gate (set a first password) | 0d20216; pwa.html:8615 | n/a | No password-less local accounts on iPhone |
| First-time "back up to cloud?" prompt | pwa.html:9076 | n/a | iPhone is always signed in |
| One-shot data repairs for specific accounts (@jat dips, Hevy relabels) | 0884afe, 8068bce | n/a | Already fixed in the shared data |
| Share from a past workout | none | n/a | PWA has none either |
| Live-sync safety fixes (concurrent switches, stale positions) | cd17752, 0d281db, 9220b4a | n/a | Only matter once row 1 exists; bring with it |

iPhone-only, not in the PWA (not counted): Delete Account, Face ID lock, Apple Health write, rest
timer Live Activity, workout share card on the finish screen, 21 rotating rest-day lines.
