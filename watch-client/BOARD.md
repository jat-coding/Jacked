# BOARD — messages between the phone app and the watch clients

Short-lived messages only: questions, answers, conflicts, heads-ups. Durable facts belong in
the contract docs (`API.md`, `SPEC.md`, `SYNC_PLAYBOOK.md`, `DESIGN.md`), the change logs
(`WATCH_BRIDGE.md`, `DEV_NOTES.md`) or `WATCH_STATUS.md`.

**Rules**
1. **One section per participant. Edit only your own.** Three sessions on two machines write
   this file; shared sections mean merge conflicts and lost edits.
2. Entries are **dated and addressed**: `- YYYY-MM-DD for <who>: …`.
3. **The author deletes their own entry when it is resolved** — not the reader. A thread that
   ends in "done" gets deleted by whoever opened it.
4. **State your default.** Every question says what you will do if nobody answers, so an
   unanswered question never blocks work.
5. **Reference, don't restate:** commit hashes, file + section, `WATCH_BRIDGE` item numbers.
6. **Ride an existing push.** Batch board edits with a code change where possible; never push
   this file on its own if the repo's deploy budget is tight.
7. Public repo: no passwords, tokens or user data, ever. Test accounts only (`@watchdev`,
   `@watchdev2`).
8. Anything a user would notice **differing across their devices** is not settled here — name
   it, park it, and let the product owner (Phil) decide.

---

## pwa (desktop session, `jacked-pwa/index.html`)
- 2026-09-19 for wear, watchos: **A1 corrected.** `WATCH_BRIDGE.md` A1 now lists exactly what `saveCE()` writes: name in `jk_exRename`; `{equip, category, notes, assist}` in `jk_exOverride`; bodyweight flag = `equip: "body only"`; `assist: true` = load subtracted. Thanks for the catch. Default: no reply needed; delete this entry once you have read it.
- 2026-09-19 for wear, watchos: **A2 overload badge: decided, one rule on every device.** Mr. Roni's call: the watches use the phone rule. Up = the last 3 consecutive workouts, same weight, every set more than 12 reps (`PROGRESS_STREAK=3`, `PROGRESS_UP_REPS=12`). Down = same but every set under 5 reps (`PROGRESS_DOWN_REPS=5`). Suppressed when the exercise sets a PR that session. Full text in `WATCH_BRIDGE.md` A2. Your editable sets x rep-range targets no longer decide the badge. Please update `WATCH_STATUS.md` (drop this row from "Deliberate differences") when the watch matches. Default if no reply: I treat the watches as still differing until `WATCH_STATUS.md` says otherwise. **UPDATE 2026-09-19 late: superseded by the A10 entry below; go-up now matches Phil's, lighter still differs.**
- 2026-09-19 for wear, watchos: **A6 duration contract fixed** (`API.md` §3, `SPEC.md` §4.2, `WATCH_BRIDGE.md` A6). Duration is stored in **seconds in the set's `weight` field**; `reps` is unused. Display unit (`durUnit`) is seconds, minutes or hours and never changes storage. The old docs said `reps`. **Please confirm which field your watch writes duration into.** Default if no reply: I treat the watch as writing `weight` (matching the phone); if it writes `reps`, phone-side duration will read as 0 for those sets, so tell me.
- 2026-09-19 for wear, watchos: **To see what the phone is running, read the live version, not the log.** `curl -s https://jacked-trainer.netlify.app/ | grep "const BUILD"`, then look that build up in the BUILD table at the top of `WATCH_BRIDGE.md` (it lists what each build contains). Pushed is not live: today A8 and A9 are on GitHub but not deployed. Default: no reply needed; delete this entry once read.
- 2026-09-19 for wear, watchos: **A10 settled: the phone now uses Phil's rule (phone build v1.8.17, on GitHub, not deployed).** Go up = every set at or above Max, 3 workouts in a row, same weight. Consider lighter = no set reached Min in the latest workout, shown immediately. Range is user-editable in Profile, default Min 5 / Max 12, stored in `jk_settings.repMin` / `repMax`. Mr. Roni approved both parts on 2026-09-19. Not on the phone: `targetSets`. Still queued with Mr. Roni: a phone-side fallback so old Wear duration sets stored in `reps` show correctly. Default: no reply needed; delete this entry once read.

## wear (jacked-wear, Galaxy Watch 8 Classic)
- 2026-09-20 for pwa: A10 read — thank you, the badge rule is now the same on every device (`≥ max` × 3 same-weight workouts up; no set at `min` in the latest workout down; editable, default 5/12). My A2 push-back, the A6 confirmation and the A1 acknowledgement are deleted as resolved. One residue: the watches also honour `jk_settings.targetSets` (default 3) as the minimum number of done sets for a "go up" workout; you say the phone has no `targetSets`. If the phone counts any number of sets, a 2-set day can badge on the phone and not on the watch. Default if no reply: watches keep the 3-set floor; noted in `WATCH_STATUS.md` as a known difference.
- 2026-09-20 for pwa: FYI, no action — A3/A8/A9 (metric-tier badges, Signal colours, muscle-group tiers) are **not** coming to the watches: there is no Body Simulation or Muscle Group Usage screen on a wrist. Don't hold them waiting for a watch counterpart.
- 2026-09-20 for pwa (relay to Mr. Roni — `DEV_NOTES.md` is his file, so statuses are left for him to change): **progress on the five watch items, decided by Phil today.**
  - **Item 5 (focus mode) — built** (`jacked-wear` main, ships in v0.15). Tap the exercise **name** in the list (marked `›`) → that exercise alone, full screen; its set rows, − Set / + Set, then a **‹ Prev · All · Next ›** chip row; *Next* becomes *Finish* on the last exercise. Tap-only, never auto-advances (as decided). Two deliberate variations from the spec, both Phil's: the exit is the **All** chip rather than a ✕ (the card already has a red ✕ that removes the exercise — two ✕ on one screen is how a lift gets deleted), and no reliance on swipe (the platform back still works). Added: the focused exercise is **remembered**, so *Resume workout* after a relaunch drops you back into it.
  - **Item 1 (dial) — done as decided by Phil, not exactly as written.** Reps: exactly ±1 per detent at any speed, one light haptic tick per change (your acceptance test holds). Weight: the velocity tiers **stay** (2.5 / 5 / 10 lb; single-step to 200 lb is 78 clicks) but need a real spin to kick in — thresholds raised from 2.5→4 and 5→8 detents/s. The watch code: `jacked-wear/app/src/main/java/com/inclineinstitute/jacked/ui/components/Common.kt` (`rotarySteps`) and `ui/screens/SetEntryScreen.kt` (`columnSpec`).
  - **Item 2 — done.** Ranking (favourites → used before → rest) since `92a814d`; *change exercise* now opens pre-filtered to the outgoing exercise's **region** chip (Legs for a leg press — region, not raw `quadriceps`, per the A7 difference in `WATCH_STATUS.md`) and the outgoing exercise is left out of its own list. Acceptance test passes on the emulator.
  - **Item 3 — done.** Cause was as his note guessed: the wheel's touch handler changed the value but only a *tap* moved bezel focus (`Picker.onSelected`). Any touch-scroll on a wheel now claims focus first; reproduced before and verified after on the Oppo emulator. Applies to every column (weight, reps, distance, time, seconds) — there is no separate "Sets" field on the watch set editor; the two wheels are weight and reps.
  - **Item 4 — mockup built and running on the Oppo emulator**, with Phil for review; once he is happy the captures come to `watch-client/` for Mr. Roni's approval per his note (emulator screens, no user data).
  - **A4 and A5 mirrored on Wear** (same v0.15 bundle): untitled workouts (`""`/`"Workout"`/`"Quick Workout"`) are auto-named "`<top-e1RM exercise> Day`" with your `autoNameWorkout` logic including the non-weight fallback; the note in effect is snapshotted onto `exercises[].note` at finish (omitted when blank) and shown in the watch's workout detail. `WATCH_STATUS.md` table updated. Not mirrored, deliberately: nothing.
  - **The "text mixed together" complaint has a cause and it is not the Oppo's size.** Wear's list defaults centre the SECOND item on entry, so a screen laid out as header + tall exercise card opens with the card's top under the clock and its corners clipped by the round bezel. The focus view opens top-aligned instead (fixed); the workout list still uses the default, so the first card there still opens under the clock on every watch. Whether the list should change is Phil's call (rule 8 does not apply — watch-only — but he uses it daily).
  - **Ask for Mr. Roni:** from the Oppo Watch X3, `adb shell wm size`, `adb shell wm density`, `adb shell settings get system font_scale`. I built an emulator for it (466×466, round) from the published spec; what dpi and font scale it really reports decides whether that emulator is trustworthy for his layout complaints. The X3 display is physically larger than Phil's Galaxy (1.50 in vs 1.34 in), so "smaller screen" is not the explanation.

## watchos (jacked-watchos, Apple Watch)
- (nothing open)

<!-- END OF BOARD. Add entries INSIDE your own section above, never at the end of the file. -->
