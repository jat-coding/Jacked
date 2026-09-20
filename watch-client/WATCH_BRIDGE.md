# WATCH_BRIDGE — keeping the phone app and the watch app aligned

Lives in `watch-client/` so the watch dev reads it every week. It is a running change log,
newest first inside each section, that says which changes are **watch-only** and which change
the **function of the whole app** (so the watch must match). Owner of edits: the desktop
session that works on Jacked. Phone app source: `jacked-pwa/index.html`. Sibling files: `SPEC.md`, `API.md`,
`DESIGN.md`, `DEV_NOTES.md` (the watch-only to-do list).

## How to read this
| Tag | Meaning | Watch dev action |
|---|---|---|
| **APP-WIDE** | Changes how the app behaves or what data it stores. Applies to phone and watch. | Mirror it. Behavior and data must match the phone. |
| **WATCH-ONLY** | Only the watch needs it (dial, watch layout, watch input). The phone does not change. | Build it; the phone is not affected. |
| **PHONE-ONLY** | Phone UI detail with no watch equivalent. | None. Listed so nobody wonders if it was missed. |

Each entry: what changed · the exact rule or data field · phone commit. Everything below is
pushed to `origin/main` and live on the phone app (the full dated list is the CHANGELOG at the bottom).

---

## APP-WIDE (watch must mirror)

### A9. Muscle-group tiers rebuilt (how a group's rank is calculated) — `5832e21`
Applies to Body Simulation, Muscle Group Usage and any watch equivalent. Four tiers (Needs Work,
Building, Strong, Elite) plus Untrained (no data in the window). Rules, all in `index.html`
(`STRENGTH_STD`, `muscleStrengthRatio`, `strengthScore`, `exStrengthFactor`):
1. **Window:** only workouts from the last 90 days count.
2. **Per set:** estimated 1RM = weight x (1 + min(reps,10)/30). Reps above 10 are not counted.
3. **Per exercise:** scale to a barbell-compound equivalent. Equipment factor: barbell/EZ 1.0,
   machine 0.9, cable 1.1, dumbbell/kettlebell 2.0 (weights are logged per hand), bands 1.5,
   bodyweight 1.0. Isolation exercises x1.8 in groups whose standard is a compound lift (all but
   biceps and core). These factors are set values, not sourced.
4. **Per group:** take the best scaled 1RM of each distinct exercise, average the top 3 (fewer if
   fewer exist), divide by bodyweight.
5. **Tier lines (x bodyweight, male):** Building starts / Strong starts / Elite starts =
   chest .75/1.0/1.5, shoulders .375/.5/.75, legs 1.25/1.5/2.0, back .75/1.0/1.5,
   glutes 1.0/1.6/2.5, biceps .4/.55/.85, triceps .85/1.1/1.6, core .55/.8/1.2. Below Building is
   Needs Work. Female values are in `STRENGTH_STD`.
6. **Score 0-1** is anchored so the tier cutoffs (0.34 / 0.67 / 0.9) land exactly on those lines.
Before this change Elite needed 1.5x the top standard and any single set could rank a group.

### A8. Strength-tier colors ("Signal" scheme) — `0e23fee`
Body Simulation, the Muscle Group Usage bars and the tier badges use one color per tier:
Untrained grey `#6b6b7a`, Needs Work red `#ff5d6c`, Building green `#3ddc97`, Strong blue `#4da3ff`,
Elite gold `#ffd24d`. Tier cutoffs are unchanged for now (score <0.34 / <0.67 / <0.9 / above), held in
one place (`TIER_CUT`). The scoring rules themselves are being redesigned; expect this entry to change.

### A7. Switch Exercise opens pre-filtered to the same muscle group — `7db214d`
Switching an exercise (in a workout or a routine) opens the picker with that exercise's muscle
group already selected (Warm-up and Cardio count as groups). The user can clear it. List order is
unchanged: favourites (`jk_favEx`), then used-before (most recent first), then the rest.
Watch counterpart: `DEV_NOTES.md` item 2 (same behavior on the watch). Phone muscle names are the
library's own (Leg Press = `quadriceps`, not "legs").

### A6. Duration exercises have a display unit: sec / min / hr — `37ef4e6`
Data rule: a duration set's value is stored in **seconds**. The unit is display-only
(`durUnit` on the workout exercise, default from the exercise's saved `durUnit`, else `sec`).
Convert with sec=1, min=60, hr=3600. **Check `watch-client/API.md`/`SPEC.md`: they describe duration
as "minutes/seconds"; the watch must read and write seconds.** All duration math (totals, PRs)
uses seconds.

### A5. Notes carry forward and are saved with the workout — `984dacb`, `f9da482`
An exercise's previous note shows greyed as the placeholder on the next workout until overwritten.
Leaving the field blank never deletes the saved note. At finish, the note is copied onto the saved
workout exercise (`exercises[].note`) and shown in workout detail. Store: `jk_exNotes`.

### A4. Auto-name untitled workouts — `3fe5987`
If the workout has no name at finish, name it after the exercise with the highest e1RM: "`<exercise> Day`".

### A3. Metric-tier (achievement) badges — `d490d6b`, `fdb61e5`, `7b64503`
Tiers per badge (1–3): Bench-Maxing 135/225/315 lb; Shoulder-Maxing 0.25/0.5/1.0 x bodyweight;
Leg-Maxing 1.0/1.5/2.0 x bodyweight; Pull-up-Maxing 10/15/20 reps; Push-up-Maxing 30/50/80 reps;
Cardio-Maxing 9/8/6.5 min per mile (lower is better). Shows live on the exercise when a set crosses
a tier; tapping opens a popup naming the exact stat that earned it and the thresholds. Applies to
those six exercise types only. Duration-tracked exercises never earn a tier badge (a "Push-up Hold" does not count as push-ups). Definitions: `BADGE_TIER_THRESH` / `BADGE_META` in `index.html`.

### A2. Progressive-overload badges — `3fe5987` (rule confirmed for the watches by Mr. Roni, 2026-09-19)
**One rule on every device.** Phone and watches all use the rule below. The watches' target-based rule (sets x rep range) does not drive the badge.
- **Go up:** the last 3 consecutive workouts of the exercise used the same weight and every set
  in each was more than 12 reps.
- **Consider lighter:** same, but every set under 5 reps.
- Constants `PROGRESS_STREAK=3`, `PROGRESS_UP_REPS=12`, `PROGRESS_DOWN_REPS=5`.
- Suppressed for an exercise that sets a PR that session.
- Shows on the exercise card live and in the finish summary. If the user then goes up in weight
  after a "go up", the summary adds a congratulatory note. Computed from `jk_hist` + `jk_prs`.

### A1. Library exercise editing — `37ef4e6` (corrected 2026-09-19 to match `saveCE()`)
What is written, exactly (source: `saveCE()` in `jacked-pwa/index.html`):
- **Built-in library exercise:** the muscle group is locked. Editing writes two things:
  - the **name** goes in `jk_exRename` (`{exId: "new name"}`); it is removed again if the name is set back to the original;
  - everything else goes in `jk_exOverride[exId] = { equip, category, notes, assist }`. Nothing else is stored there.
- **Custom exercise (`jk_cex`):** full edit. The entry is `{ name, muscle, equip, tracking, category, notes, assist, durUnit }`.
- **There is no separate "bodyweight" field.** The bodyweight flag is stored as `equip: "body only"`.
- **`assist` is a boolean**: `true` means assisted (the load is **subtracted** from bodyweight, e.g. assisted pull-up);
  `false` or absent means added weight (bodyweight **plus** load). Dropping `assist` flips the math, so clients
  must read it wherever bodyweight lifts are computed.
- `byId()` and `allEx()` merge the override over the library entry at read time; the library data is never edited.
- `EQUIP_FIX` (in `index.html`) re-tags about 30 library ids whose equipment is wrong; apply it before reading `equip`.
- Delete/hide uses `jk_hiddenEx`; favourites use `jk_favEx`.

## WATCH-ONLY (phone unchanged)
Full specs in `watch-client/DEV_NOTES.md`. Status of all: open (the watch source is not in this repo).
- **W1. Rotary dial precision + haptics** — one detent = ±1, no skipped numbers, a tick per value. (DEV_NOTES 1)
- **W2. Touching a field focuses it** so the dial edits that field. (DEV_NOTES 3)
- **W3. Picker screen layout** — title hierarchy, distinct search bar, filter pills, grouped cards; mockup first. (DEV_NOTES 4)
- **W4. Focus mode** — tap an exercise to make it the whole screen; tap-only next; close button + back swipe. (DEV_NOTES 5)

## PHONE-ONLY (no watch action)
- Removed the "0/3 done" progress text from the PR line.
- Exercise header wraps below 360px wide — `0608651`.
- Badge row scrolls sideways when several badges show (added with the stress-test fixes, `add4de6`).
- **GPS run tracker: not in the app.** Built and removed on 2026-09-19 by request; parked for the
  App Store version (`memory/projects/jacked-app-store.md`). The watch must not assume
  it exists: distance exercises are manual Miles/Min entry.

---

## How to add an entry (for the desktop session)
1. When a Jacked change lands, add one entry under the right tag (newest first, next number).
2. If a phone change needs a watch match, put the behavior in `APP-WIDE`, and add a line in
   `watch-client/DEV_NOTES.md` only if the watch needs extra work.
3. State the exact rule and data fields, not a description of the screen.
4. Record the commit, and add a dated line to the CHANGELOG below in the same edit.
5. Update this file in the same push as the app change, so the two never drift.
6. Add a PUSH LOG row (date, time, commit, BUILD, contents) with every push.

---

## PUSH LOG (when each batch went live; times MDT, from the git remote log)
Add a row in the same commit as every push. A change is live for real users only once its push is listed here.

| Pushed | origin/main | BUILD | What went out |
|---|---|---|---|
| 2026-09-19 21:07 | `5832e21` | v1.8.15 | A9 muscle-group tier rebuild (plus a follow-up docs commit filling in hashes) |
| 2026-09-19 20:18 | `92b4994` | v1.8.14 (unchanged) | Docs only: PUSH LOG added to this file (plus a follow-up commit filling in this hash). Strong tier removed then restored locally; net app code identical to `1ef9a39` |
| 2026-09-19 18:50 | `1ef9a39` | v1.8.14 | A8 Signal tier colors (grey/red/green/blue/gold) |
| 2026-09-19 16:12 | `e3adda2` | v1.8.13 | A7 Switch Exercise muscle filter; `WATCH_BRIDGE.md` moved into `watch-client/`; `DEV_NOTES.md` items 1-5 |
| 2026-09-19 00:30 | `0608651` | not recorded | A1-A6 (library editing, duration units, overload badges, tier badges, notes carry-over, auto-naming), GPS added then removed, stress-test fixes, narrow-phone header fix |
| 2026-09-15 18:39 | `38407d1` | not recorded | Baseline: watch-client auth handoff answers |

---

## CHANGELOG (phone app, newest first, every change since `38407d1`, 2026-09-15)
Dates are 2026 local (MDT). Tag = which section above holds the rule.

| Date | Commit | Change | Tag |
|---|---|---|---|
| 09-19 | `5832e21` | Muscle-group tier rebuild: 90-day window, rep cap 10, per-exercise scaling, top-3 average, tier lines at the standards | APP-WIDE A9 |
| 09-19 | `0e23fee` | Tier colors switched to the Signal scheme (grey/red/green/blue/gold), one color per tier, shared by body, bars and badges | APP-WIDE A8 |
| 09-19 | `7db214d` | Switch Exercise opens pre-filtered to the replaced exercise's muscle group | APP-WIDE A7 |
| 09-18 | `0608651` | Exercise header wraps on phones under 360px wide | PHONE-ONLY |
| 09-18 | `51963dd` | GPS run tracker removed from the live app (parked for App Store work) | PHONE-ONLY |
| 09-18 | `add4de6` | Stress-test fixes: duration exercises excluded from tier badges; badge row scrolls sideways when crowded; 4 GPS bugs fixed (moot, GPS later removed) | APP-WIDE A3 / PHONE-ONLY |
| 09-17 | `9cc0a28` | GPS tracker smoothing (later removed) | PHONE-ONLY |
| 09-17 | `d1e4a66` | GPS run tracker built (later removed, see `51963dd`) | PHONE-ONLY |
| 09-17 | `f9da482` | Note snapshotted onto each saved workout exercise at finish (shown escaped, so typed `<` cannot break the page) | APP-WIDE A5 |
| 09-17 | `984dacb` | Notes carry over as a greyed placeholder; blank never deletes | APP-WIDE A5 |
| 09-17 | `7b64503` | Tier popup redesigned as a real modal | APP-WIDE A3 |
| 09-17 | `fdb61e5` | Tier popup names the exact stat that earned it | APP-WIDE A3 |
| 09-17 | `d490d6b` | Live tier badge next to the progression chip | APP-WIDE A3 |
| 09-16 | `3fe5987` | Progressive-overload badges (go up / lighter) + auto-name untitled workouts; "0/3 done" removed from PR line | APP-WIDE A2, A4 / PHONE-ONLY |
| 09-16 | `37ef4e6` | Library exercise editing + sec/min/hr units for duration exercises (stored in seconds) | APP-WIDE A1, A6 |

Docs-only commits (no app change): `20bba21`, `1fd34cc`, `59ef1eb`, `b5d8e2c`, `bed2cf2` (`DEV_NOTES.md`),
and this file.
