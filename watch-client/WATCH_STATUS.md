# WATCH_STATUS — what is actually running on the watches

The mirror of `WATCH_BRIDGE.md`: that file is phone → watch, this one is watch → phone. It
answers "what do the watch clients do today, and where do they deliberately differ from the
phone?" so the desktop session never has to guess. **Owners:** the Wear and watchOS sessions,
each editing only its own rows. Updated in the same push as the change it describes.

## Shipped versions

| Client | Version | Delivery | Verified |
|---|---|---|---|
| Wear OS (Galaxy Watch 8 Classic) | **v0.15** (wear vc114) | Play internal testing | tagged 2026-09-20, rolling out; v0.14 was the last owner-verified build |
| watchOS (Apple Watch) | **0.2.0 (24)** | TestFlight | build 22 field-tested; 24 adds overload nudges; Wear v0.15 parity items handed off 2026-09-20 |
| Phone companion "Jacked Sync" (Android) | **v0.15** (phone vc14) | Play internal testing | no functional change from v0.14 |

The companion is not a watch client: it reads the cloud blob and writes finished workouts into
Android Health Connect, which is the only path into Samsung Health. It signs in like a watch.

## What the watches implement today
- **Library edits from the phone (A1/A7), as of Wear `92a814d`:** `jk_exRename`,
  `jk_exOverride` (`equip`, `assist` applied; `category`/`notes` decoded but unused),
  `jk_hiddenEx`, `jk_favEx`. Hidden exercises leave the picker but still resolve in history;
  the picker ranks favourites → used-before → rest, searched lists included. The watch also
  now applies the PWA's `EQUIP_FIX` map, so the ~30 mis-tagged bodyweight ids classify the
  same on both sides.
- **Sync:** password sign-in (`AUTH_HANDOFF.md`), read `profile_backups`, merge locally, write
  back with the `updated_at` CAS, then the stats PATCH. Offline-first: a finished workout is
  saved and queued locally and uploads later; nothing blocks on the network.
- **Blob keys written:** `jk_hist`, `jk_prs`, `jk_cardioPR`, `jk_exNotes`, `jk_deleted`
  (tombstones). Never `jk_prof`, `jk_settings`, `jk_routines`, `jk_cex` — read-only there.
- **Stats columns written:** exactly `total_volume, workouts, prs, streak, consistency,
  updated_at`. Never `code`, `user_id`, `name`, `username`, `badges`, `data`, `avatar_url`.
- **Workout flow:** start empty or from a routine, sets pre-filled from the last session,
  add/remove set, add/replace/reorder/remove exercise, rest timer, per-exercise notes,
  finish → summary (volume, duration, PRs).
- **Sensors (Wear):** live HR + calories during the session; `hrAvg`/`hrMax`/`kcal`/`hrSeries`
  are written onto the workout as extra fields the PWA carries through untouched.
- **Progressive-overload nudges:** both watches, target-based — see "Agreed cross-device rules".
- **Focus view (Wear, v0.15; `DEV_NOTES` item 5):** tapping an exercise **name** in the
  workout list opens that exercise alone — sets, − Set / + Set, then **‹ Prev · All · Next ›**.
  Tap-only, never auto-advances; Prev/Next grey out at the ends (never change function);
  *All*, a right-swipe or Back returns to the list, which stays the home view. On the **last**
  exercise the list's tail appears under the row — green **✓ Finish** pill, red **Discard** —
  exactly as on the list, and nowhere else. The focused exercise is remembered, so *Resume
  workout* reopens it after a relaunch. Replace/remove/reorder stay on the list.
- **Set editor bezel (Wear, v0.15; `DEV_NOTES` items 1 and 3 / W1, W2):** reps move exactly
  ±1 per detent; weight keeps velocity tiers (2.5 / 5 / 10) but needs a deliberate spin
  (≥4 detents/s) to accelerate; a light tick on every value change, both columns. Touch-
  scrolling a wheel makes it the bezel's target — one focused column at a time, shown by
  the teal outline. Checking a set off gives a stronger haptic.
- **Change exercise (Wear, v0.15; `DEV_NOTES` item 2 / A7):** the ⇄ picker opens
  pre-filtered to the outgoing exercise's region chip, ranked favourites → used → rest,
  without the outgoing exercise itself.
- **Exercise picker:** muscle chips are **regions** (back / legs / core / cardio + one chip per
  remaining muscle), because the bundled library has no `back` muscle, only `lats`,
  `middle back`, `lower back`, `traps`. Stored `muscle` values on exercises are untouched.

## Deliberate differences from the phone (and why)

| Area | Phone | Watches | Why |
|---|---|---|---|
| Picker muscle filter (`WATCH_BRIDGE` A7) | filters by the raw library muscle (`quadriceps`) | filters by region (`legs`) | a raw-muscle chip list puts one exercise under "Back" on a small screen |
| Profile / settings / routines editing | full | read-only | watch input cost; the phone owns identity and library curation |

## Agreed cross-device rules

- **Overload badges (`WATCH_BRIDGE` A2), decided by Phil 2026-09-20:** targets are
  user-editable with defaults **3 sets, min 5, max 12**, read from
  `jk_settings.targetSets`/`repMin`/`repMax`. **Go up** = all sets **≥ max** for 3
  consecutive workouts at the same weight. **Go down** = no set reaches **min** in a
  **single** workout, immediately. Suppressed when the exercise sets a PR that session.
  Wear implements this as of v0.15; the phone matches from build v1.8.17 (A10). Known
  residue: the watches also require **≥ `targetSets` (default 3) done sets** per qualifying
  workout; the phone has no `targetSets`.
- **Duration sets** store seconds in the set's `weight` field (A6). Wear wrote `reps`
  until 2026-09-20; it now writes `weight` and falls back to `reps` when reading older
  sessions.

## What the watches need from the phone side

- APP-WIDE entries to state the **rule and the data field**, which `WATCH_BRIDGE.md` already
  does, and the contract doc amended in the same push (e.g. duration stored in **seconds** —
  `API.md`/`SPEC.md` still say minutes).
- A heads-up before any change to what the watches write: the six stats columns, the CAS shape,
  or the blob keys above.

## Not implemented on the watches (deliberate, for now)

Friends/leaderboard, badges beyond the overload nudges, avatars, exercise-library editing,
custom-exercise creation, GPS/route tracking, body-weight logging.

## APP-WIDE items from WATCH_BRIDGE not mirrored yet

| Item | Status on the watches |
|---|---|
| A3 metric-tier badges, A8 tier colours, A9 muscle-group tiers | Not mirrored, and **no watch equivalent is planned** — there is no Body Simulation or Muscle Group Usage screen on a watch. Nothing is waiting on you here. |
| A4 auto-name untitled workouts | **Mirrored on Wear (v0.15):** an untitled workout (`""`, `"Workout"`, `"Quick Workout"`) becomes "`<top-e1RM exercise> Day`" at finish, same `autoNameWorkout` logic incl. the reps+weight fallback. Routine names untouched. |
| A5 notes carry forward + `exercises[].note` at finish | **Mirrored on Wear (v0.15):** the note in effect is snapshotted onto `exercises[].note` at finish (omitted when blank) and shown in workout detail. "Placeholder" on the watch = the persistent note shown on the card, tap to edit with prefill; blank never deletes. |
| A6 duration `durUnit` | Not mirrored; the watch stores and displays seconds. |
