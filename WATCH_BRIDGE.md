# WATCH_BRIDGE — keeping the phone app and the watch app aligned

Top level of the Jacked repo so the watch dev reads it every week. It is a running change log,
newest first inside each section, that says which changes are **watch-only** and which change
the **function of the whole app** (so the watch must match). Owner of edits: the desktop
session that works on Jacked. Phone app source: `jacked-pwa/index.html`. Watch specs:
`watch-client/` (`SPEC.md`, `API.md`, `DESIGN.md`, `DEV_NOTES.md`).

## How to read this
| Tag | Meaning | Watch dev action |
|---|---|---|
| **APP-WIDE** | Changes how the app behaves or what data it stores. Applies to phone and watch. | Mirror it. Behavior and data must match the phone. |
| **WATCH-ONLY** | Only the watch needs it (dial, watch layout, watch input). The phone does not change. | Build it; the phone is not affected. |
| **PHONE-ONLY** | Phone UI detail with no watch equivalent. | None. Listed so nobody wonders if it was missed. |

Each entry: what changed · the exact rule or data field · phone commit · status (`shipped-local` = on the desktop repo, not pushed/deployed yet; `pushed` = on origin/main).

Nothing below is pushed yet. `origin/main` is `38407d1`; everything since is `shipped-local`.
The phone app's live deploy therefore does not have these changes.

---

## APP-WIDE (watch must mirror)

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
those six exercise types only. Definitions: `BADGE_TIER_THRESH` / `BADGE_META` in `index.html`.

### A2. Progressive-overload badges — `3fe5987`
- **Go up:** the last 3 consecutive workouts of the exercise used the same weight and every set
  in each was more than 12 reps.
- **Consider lighter:** same, but every set under 5 reps.
- Constants `PROGRESS_STREAK=3`, `PROGRESS_UP_REPS=12`, `PROGRESS_DOWN_REPS=5`.
- Suppressed for an exercise that sets a PR that session.
- Shows on the exercise card live and in the finish summary. If the user then goes up in weight
  after a "go up", the summary adds a congratulatory note. Computed from `jk_hist` + `jk_prs`.

### A1. Library exercise editing — `37ef4e6`
Custom exercises: full edit. Built-in library exercises: name, equipment, category, bodyweight
flag, notes only; muscle group is locked. Stored as overrides in `jk_exOverride`.

## WATCH-ONLY (phone unchanged)
Full specs in `watch-client/DEV_NOTES.md`. Status of all: open (no watch code in this repo).
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
4. Record the commit and status. When pushed, change `shipped-local` to `pushed`.
