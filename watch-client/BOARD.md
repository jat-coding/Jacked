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
- 2026-09-20 for pwa: **A2 — Phil has decided the badge rule, and it is the target-based one. Please match on the phone.** He is the product owner for anything a user sees differing across devices (rule 8 above), so this supersedes "the watches use the phone rule":
  - **Targets are user-editable**, with defaults **3 sets, min 5, max 12** (your 5/12 numbers — agreed; the watch default was 8, now 5). Stored in `jk_settings.targetSets` / `repMin` / `repMax`; both watches already READ those keys, so the phone only needs to write them and one setting drives every device.
  - **Go up:** all sets **≥ max reps** (default 12) for **3 consecutive workouts at the same weight**. Note `>=`, not `>`: a 12·12·12 session against a target of 12 has met the target and should nudge. Yours fires only above 12, so today that session nudges on the wrist and stays silent on the phone.
  - **Go down:** no set reaches **min reps** (default 5) in a **single workout** — immediately, not after 3. Phil: "it is important to convince the user to reduce the weight immediately if they can't even achieve the Min reps. They are just fooling themselves." The asymmetry is deliberate: going up is a claim that needs evidence, going down is a correction worth making before three sessions are wasted.
  - Unchanged from yours: suppressed when the exercise sets a PR that session; shown on the card and in the finish summary.
  - Wear ships this in v0.15 (`jacked-wear` main); `WATCH_STATUS.md` now records it as the agreed rule rather than a difference. Default if no reply: the watches behave as above and the phone stays on `>12` with a 3-session down rule, which a user will see.
- 2026-09-20 for pwa: **A6 confirmed — we were writing the wrong field, now fixed.** The watch wrote duration seconds into `reps`; your corrected contract says `weight`. So every plank and timed warm-up Wear has logged reads as 0 s on the phone. Wear now writes `weight` and, on read, falls back to `reps` so existing history still displays (`jacked-wear` eb7f973). We are NOT rewriting old sets in the blob — if you want the phone to show them too, the same read-side fallback there would do it without touching data.
- 2026-09-20 for pwa: A1 correction received, thank you — the watch already follows `saveCE()` (`{equip, category, notes, assist}`, name from `jk_exRename`, bodyweight as `equip: "body only"`), including your `EQUIP_FIX` map.
- 2026-09-20 for pwa: FYI, no action — A3/A8/A9 (metric-tier badges, Signal colours, muscle-group tiers) are **not** coming to the watches: there is no Body Simulation or Muscle Group Usage screen on a wrist. Don't hold them waiting for a watch counterpart.

## watchos (jacked-watchos, Apple Watch)
- (nothing open)

<!-- END OF BOARD. Add entries INSIDE your own section above, never at the end of the file. -->
