# WATCH_BRIDGE — keeping the phone app and the watch app aligned

Lives in `watch-client/` so the watch dev reads it every week. It is a running change log,
newest first inside each section, that says which changes are **watch-only** and which change
the **function of the whole app** (so the watch must match). Owner of edits: the desktop
session that works on Jacked. Phone app source: `jacked-pwa/index.html`. Sibling files: `SPEC.md`, `API.md`,
`DESIGN.md`, `DEV_NOTES.md` (the watch-only to-do list).

## WHAT IS LIVE ON THE PHONE (read the live version, then look it up here)
Ask the live site for its version. No login, and it cannot go stale:

    curl -s https://jacked-trainer.netlify.app/ | grep "const BUILD"

Then find that build below. Pushed is not the same as live: a push never deploys (Netlify
auto-builds are off; a deploy needs Mr. Roni's separate go). Check the live site, not this file.

| BUILD | What it contains (cumulative) | Pushed commit |
|---|---|---|
| v1.8.20 | A1-A11, plus black-to-grey header gradient (phone-only) and friends leaderboard defaulting to This month (app-wide) | `98531e8` |
| v1.8.19 | A1-A11, plus quarterly Cardio-Maxing reset and the full-screen achievement popup | `b5555fa` |
| v1.8.18 | A1-A10, plus the frosted-glass bottom tab bar (phone-only) | `631dd85` |
| v1.8.17 | A1-A10, **A10 amended: go-up at or above Max; lighter after a single workout (both match the watches)** | `c4ee8c5`, `4754bd0` |
| v1.8.16 | A1-A9, **A10 user-defined rep range for the overload badges** | `e513de7` |
| v1.8.15 | A1-A7, A8 Signal colors, **A9 muscle-group tier rebuild** | `5832e21` |
| v1.8.14 | A1-A7, **A8 Signal colors** | `1ef9a39` |
| v1.8.13 | A1-A7 (A7 = Switch Exercise muscle filter) | `e3adda2` |
| v1.8.12 | The old baseline, and also A1-A6: the 2026-09-19 00:30 push (`0608651`) went out without a bump, so this number covers both. A phone still showing v1.8.12 predates that push or is on it; it never shows A7 or later. | `38407d1`, `0608651` |

Rule: every push that changes `jacked-pwa/` bumps `BUILD` by one patch. Docs-only pushes do not
bump it, because users see nothing different. Watch relevance: A1, A2, A4-A7 apply to the watches;
A3, A8, A9 are phone-only (no body or group screen on a wrist); see `BOARD.md`.

---

## Test previews ("push for test")
Mr. Roni's term for pushing a build to the GitHub **`test` branch**: Netlify builds it as a free branch
preview at `https://test--jacked-trainer.netlify.app` (0 credits), separate from production. A push to
`main` builds the live app automatically (15 credits per deploy) and needs his explicit go. The build table
below marks builds that exist only on `test`. Check `curl -s https://jacked-trainer.netlify.app/ | grep BUILD`
for production; the preview may need a Netlify sign-in.

---

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

### A14. Profile privacy: strangers see only username + avatar — server change HELD until the watch answers
Mr. Roni, 2026-09-25. **Rule:** the only public profile fields are username and avatar. Name, volume,
workouts, PRs, streak, consistency, badges, `updated_at` and `data` are readable by the owner and
by accepted friends only. Phone build v1.10.29 is committed locally (not pushed); the database
migration `supabase/migrations/20260925_profiles_public_username_avatar_only.sql` is written and
tested but **not applied**. Order: phone build live, then your answer on the board, then migration.
- **What changes on the wire.** `profiles` becomes row-level: a signed-in caller gets their own row
  plus their accepted friends' rows; everyone else, and every request carrying only the anon key,
  gets `[]` (not an error). No column is revoked, so a request for `total_volume,workouts,prs,streak`
  still works for the owner.
- **What the watch must check (this is the whole watch-side risk):** the cheap poll in
  `AUTH_HANDOFF.md` §4 (`GET profiles?code=eq.<code>&select=total_volume,workouts,prs,streak,updated_at`)
  must send `Authorization: Bearer <access_token>`. Without it the reply is `[]`. If it already does,
  nothing changes. If it does not, add the header, or poll `profile_backups?code=eq.<code>&select=updated_at`
  (owner-only, already documented). Treat `[]` from an owner poll as "token missing or expired,
  refresh and retry", never as "profile deleted" or "no change".
- **Unchanged:** `PATCH profiles` (stats), everything on `profile_backups`, `friend_requests`,
  avatar reads (the bucket stays public).
- **Not used by the watch:** other users' profiles. If any watch screen reads someone else's
  profile, say so on the board; that read now returns username and avatar only.
- **Board question is on the `pwa` section:** default if unanswered = migration stays held.

### A13. Tap-to-clear set inputs; Coward-Maxing monthly; new Consistency-Maxing and Jacked badges — local, not pushed (BUILD not bumped yet)
Mr. Roni, 2026-09-24. Committed locally on `main`; not pushed, not live. Gets a BUILD number on push.
- **Tap-to-clear set inputs.** Every weight/reps cell of a set (live workout and the history
  editor; duration and distance too, since they use the same two cells): on focus the box empties
  and the old number shows as the greyed placeholder; typing starts from empty. Leaving the box
  with nothing typed puts the old value back **and keeps it in the data** (typing then erasing
  never stores 0). An already-empty set keeps its suggestion placeholder. Routines hold no set
  numbers, so nothing changes there. Watch: the dial/keypad equivalent is "edit starts from blank,
  cancel keeps the old value" -- mirror it if the watch has a type-in path.
- **Coward-Maxing resets monthly** (was the calendar quarter). Rule: earned when there are 7+
  consecutive calendar days with no workout **inside the current calendar month**, counting only
  days before today and only days after the user's first-ever workout. A layoff that straddles
  the 1st counts only its days in the new month. Cardio-Maxing keeps its **quarterly** window (A11);
  it used to share the window with Coward-Maxing.
- **New badge `Consistency-Maxing`** (icon Tabler `calendar-check`, green). Earned when the
  history has 7+ consecutive local calendar days with at least one finished workout each
  (several workouts on one day count once). Anywhere in history; permanent once earned (same as
  PR-Maxing). Differs from `PR-Maxing`, which needs a PR on each of the 7 days.
- **New badge `Jacked`** (icon Tabler `crown`, gold; no `-Maxing` suffix by request). Earned when
  every other badge is earned AND all six tiered badges (Bench, Shoulder, Leg, Pull-up, Push-up,
  Cardio-Maxing) are at Gold. Does not count itself. **Coward-Maxing is excluded** from the
  requirement (`JACKED_REQUIRES_COWARD=false` in `index.html`; flip to require it). Because
  Cardio-Maxing resets quarterly, Jacked can lapse with it.
- **Data:** no new storage keys. Badge names go into a profile's `badgeList` as before
  (`n:'Consistency-Maxing'`, `n:'Jacked'`, icons `calendarCheck` / `crown`); the `badges` count
  rises to at most 12. Older phone builds show these two with a blank icon until updated.

### A12. Routines never get added without an explicit "add" from the user — build v1.9.1
Bug report 2026-09-22: a user opened Jacked and found a routine ("Dip Machine Day") in their
Routines list they never chose to add. Root cause found in `jacked-pwa/index.html`:
- `startCuratedRoutine()` (the Home "Trusted pick of the day" card's Start button) wrote a new
  entry into `jk_routines` on every tap, before starting the workout, with no confirmation and
  no visible "added" moment. Tapping Start to try a suggestion is not the user adding a routine.
- `saveWorkoutAsRoutine()` (a past workout's "Save as routine" button) saved instantly using the
  workout's own name verbatim, including an auto-generated name like "Dip Machine Day" from
  `autoNameWorkout()` (the exercise with the day's highest e1RM + " Day") -- one tap, no naming
  step, no way to see what was about to be saved.
Fixed: `startCuratedRoutine` now runs the suggested workout ad hoc (nothing written to
`jk_routines`) unless the user already explicitly added that program via Library's
"+ Add to Routines" (`addCurated()`, unchanged, still the only silent-free path that persists a
curated program). `saveWorkoutAsRoutine` now prompts for a name first (same pattern as
`saveAsNewRoutine`), pre-filled with the workout's name so the user sees and can change it.
**Rule for any future save-a-routine code path (Mr. Roni, 2026-09-22): no routine is added to a
user's Routines without their own explicit input.** Watch relevance: ask wear/watchos whether
their own curated-program or workout-save flows write to `jk_routines` without an equivalent
explicit step -- flagged on the board.

### A11. Achievements: 1000lb Club renamed, Cardio-Maxing resets quarterly, full-screen detail — build v1.8.19
- **Rename:** the badge `1000lb Club-Maxing` is now `1000lb Club` (the `-Maxing` suffix is dropped for it only).
  The name string is what goes into a profile's `badgeList` (friends' view), so older stored lists still say
  `1000lb Club-Maxing`; the phone shows the new name for both.
- **Cardio-Maxing resets every 3 months:** only runs from the current **calendar quarter** count (Jan-Mar,
  Apr-Jun, Jul-Sep, Oct-Dec), the same window as Coward-Maxing. Best mile pace, tier, and the live in-workout
  cardio badge all use that window. The list title does not mention the reset; the detail popup does.
- **Detail popup (phone-only UI):** tapping an achievement opens a full-screen popup (badge icon, status, title,
  best stat, "How to earn it", tiers with the current one marked, and a "Resets" note where it applies). It
  replaces the small toast that used to appear.

### A10. Overload-badge rep range is user-defined (default 5 to 12) — builds v1.8.16 and v1.8.17
Amends A2. The go-up / consider-lighter thresholds are no longer fixed at 12 and 5.
- Defaults: **Min 5, Max 12** (same behavior as before until the user changes it).
- User setting: Profile > Preferences > "Progress badge rep range" (Min, Max). Stored in
  `jk_settings.repMin` and `jk_settings.repMax` (integers). Rules: Min 1-30, Max up to 50, Min must be
  lower than Max, otherwise the save is refused. Blank or invalid values fall back to 5 and 12.
- Go up = the last 3 consecutive workouts, same weight, **every set at or above Max** (changed from
  strictly above in build v1.8.17, Mr. Roni 2026-09-19 11:39pm, to match the watches).
  Consider lighter = the **most recent workout alone**: **no set reached Min** (every set below Min),
  immediately, no streak needed (changed in v1.8.17, Mr. Roni 2026-09-19 11:45pm, to match the watches).
- The badge text, its tap-to-explain popup and the finish-summary note all show the user's own
  numbers. Changing the range re-evaluates badges from history immediately.
- **Cross-device rule settled (2026-09-19):** phone and watches now agree: go-up = every set at or above
  Max for 3 workouts at the same weight; lighter = no set reached Min in the latest workout. `targetSets`
  (the watches' sets target, default 3) is not on the phone.
- Watch note: the watches' editable rep range (sets x repMin-repMax) is the same idea. To keep one
  rule on every device the watches can read `jk_settings.repMin` / `repMax` (read-only there).

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
7. **Update v1.10.36 (2026-09-26):** a blank or unmapped stored muscle falls back to the library's
   muscle (`strGroup`). **Triceps** (`triStrength`) and **core** (`STR_BEST_ONLY`) score from their single
   strongest exercise, never an average. Triceps line is now the chest ladder (.75/1.0/1.5 male). Triceps
   evidence: loaded presses (bench, dips, overhead; not plain push-ups/bodyweight dips) at 0.97 of their
   1RM (Strength Level average close-grip 206 lb vs bench 212 lb); isolation moves on their own Strength
   Level ladders (male Building/Strong/Elite: pushdown .45/.70/1.05, lying extension .35/.55/.75,
   dumbbell extension .15/.25/.45); one-arm cable/machine sets count 1.96x (Strength Level one-arm vs
   two-arm cable curl averages). No 1.8x factor for triceps.

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
Data rule: a duration set's value is stored in **seconds**, in the set's **`weight`** field
(`reps` is unused). This was already how the phone stored it; the contract docs were wrong and are
fixed (`API.md` §3 table, `SPEC.md` §4.2 table). The unit is display-only (`durUnit`: `sec`, `min`
or `hr`, on the workout exercise; custom exercises may carry a default). Convert with sec=1, min=60,
hr=3600 when showing or typing, never when storing. All duration math (totals, PRs) uses seconds.

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
**One rule on every device (see A10 for the current thresholds).** Phone and watches all use the rule below. The watches' target-based rule (sets x rep range) does not drive the badge.
- **Go up:** the last 3 consecutive workouts of the exercise used the same weight and every set
  in each was at or above Max reps (default 12; was strictly more than 12 until v1.8.17).
- **Consider lighter:** no set reached Min (default 5) in the latest workout, shown immediately (was
  3 workouts in a row until v1.8.17).
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
- Bottom tab bar is now frosted glass and sits low above the home line (build v1.8.18): translucent blur, teal pill on the active tab. Layout offsets for the resume/rest bars and page padding follow it.
- "Suggested today" (Home) counts a group as trained from the stored muscle, the library entry (exercise-db secondary glutes/abs included) or the routine name, so leg days count for Glutes (build v1.10.35).
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
7. Add a row to the BUILD table (top of this file) with every push that bumps `BUILD`. Never write "live" by hand: the live version comes from the curl command.

---

## PUSH LOG (when each batch went live; times MDT, from the git remote log)
Add a row in the same commit as every push. A change is live for real users only once its push is listed here.

| Pushed | origin/main | BUILD | What went out |
|---|---|---|---|
| 2026-09-20 12:13 | `537beca` | v1.8.18 | Phone-only: frosted-glass tab bar, moved low above the home line |
| 2026-09-19 23:46 | `4754bd0` | v1.8.17 | A10 amended: go-up at or above Max, lighter after a single workout (phone now matches the watches); board note |
| 2026-09-19 23:35 | `0f43eb7` | v1.8.16 | A10 overload-badge rep range (default 5-12, user-defined Min/Max in Profile); board note |
| 2026-09-19 22:35 | `e3022d4` | v1.8.15 (unchanged) | Docs only: table of what is live replaced by a BUILD lookup plus the live-version command; board note updated |
| 2026-09-19 22:30 | `e55324a` | v1.8.15 (unchanged) | Docs only: PHONE RIGHT NOW table added to this file; board note |
| 2026-09-19 22:27 | `116f61b` | v1.8.15 (unchanged) | Docs only: A1 corrected to match saveCE(); A2 confirmed as the one badge rule; A6 duration contract fixed (seconds, in `weight`); board replies |
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
| 09-26 | staging | v1.10.37: every popup close button (21) now uses one shared drawn X, centered in its circle at any size (was a text glyph that sat off-center) | PHONE-ONLY |
| 09-26 | staging | v1.10.36: Muscle Map triceps and core score from their strongest lift, not an average; triceps isolation on sourced Strength Level ladders, presses at 0.97; blank stored muscle falls back to the library (A9 rule 7); phone-only, no watch change | PHONE-ONLY |
| 09-25 | staging | v1.10.35: Home "Suggested today" reads what each exercise really trains (stored muscle, then the library incl. exercise-db secondary glutes/abs, then the routine name); squats, leg press, RDLs, lunges count for Glutes; days-since counted in local calendar days; phone-only, no watch change | PHONE-ONLY |
| 09-25 | staging | v1.10.30: single-button confirm popups ("Got it") are centered at the bottom; phone-only, no watch change | PHONE-ONLY |
| 09-25 | local (not pushed) | Profile privacy: strangers see username + avatar only (phone v1.10.29 uses `public_profiles()`; migration held) | APP-WIDE A14 |
| 09-24 | local (not pushed) | Tap-to-clear set inputs; Coward-Maxing resets monthly; new Consistency-Maxing and Jacked badges | APP-WIDE A13 |
| 09-19 | `5832e21` | Muscle-group tier rebuild: 90-day window, rep cap 10, per-exercise scaling, top-3 average, tier lines at the standards | APP-WIDE A9 |
| 09-19 | `0e23fee` | Tier colors switched to the Signal scheme (grey/red/green/blue/gold), one color per tier, shared by body, bars and badges | APP-WIDE A8 |
| 09-21 | `98531e8` | Fixed black-to-grey gradient behind sticky headers; friends leaderboard defaults to This month | PHONE-ONLY (gradient), APP-WIDE (leaderboard default) |
| 09-21 | `b5555fa` | Achievements: 1000lb Club rename, Cardio-Maxing quarterly reset, full-screen detail popup | APP-WIDE A11 |
| 09-20 | `631dd85` | Tab bar: frosted glass, moved low to the bottom | PHONE-ONLY |
| 09-19 | `c4ee8c5`, `4754bd0` | Go-up fires at or above Max; lighter fires after a single workout with no set reaching Min. Both match the watches | APP-WIDE A10 |
| 09-19 | `e513de7` | Overload-badge rep range: default 5-12, user-defined Min/Max in Profile (`jk_settings.repMin/repMax`) | APP-WIDE A10 |
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
