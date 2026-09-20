# WATCH_STATUS — what is actually running on the watches

The mirror of `WATCH_BRIDGE.md`: that file is phone → watch, this one is watch → phone. It
answers "what do the watch clients do today, and where do they deliberately differ from the
phone?" so the desktop session never has to guess. **Owners:** the Wear and watchOS sessions,
each editing only its own rows. Updated in the same push as the change it describes.

## Shipped versions

| Client | Version | Delivery | Verified |
|---|---|---|---|
| Wear OS (Galaxy Watch 8 Classic) | **v0.14** (wear vc113) | Play internal testing | on the real watch, 2026-09-16 |
| watchOS (Apple Watch) | **0.2.0 (24)** | TestFlight | build 22 field-tested; 24 adds overload nudges |
| Phone companion "Jacked Sync" (Android) | **v0.14** (phone vc13) | Play internal testing | on the S23, 2026-09-15 |

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
- **Progressive-overload nudges:** both watches, target-based — see "Deliberate differences".
- **Exercise picker:** muscle chips are **regions** (back / legs / core / cardio + one chip per
  remaining muscle), because the bundled library has no `back` muscle, only `lats`,
  `middle back`, `lower back`, `traps`. Stored `muscle` values on exercises are untouched.

## Deliberate differences from the phone (and why)

| Area | Phone | Watches | Why |
|---|---|---|---|
| Overload badge rule (`WATCH_BRIDGE` A2) | fixed: 3 sessions, up = every set > 12 reps, down = every set < 5 reps | targets: sets × rep range (default 3 × 8–12, editable in watch Settings); up = every set ≥ max for 3 sessions at the same weight; down = **no** set reached the minimum | shipped before A2 existed, from the owner's own 3 × 8–12 training. **Unresolved:** a user sees a badge on one device and not the other. Needs a product decision, not a code change. |
| Picker muscle filter (`WATCH_BRIDGE` A7) | filters by the raw library muscle (`quadriceps`) | filters by region (`legs`) | a raw-muscle chip list puts one exercise under "Back" on a small screen |
| Profile / settings / routines editing | full | read-only | watch input cost; the phone owns identity and library curation |

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
| A4 auto-name untitled workouts | Not mirrored. A watch workout is named from its routine, or "Workout". |
| A5 notes carry forward + `exercises[].note` at finish | Partly: the watch reads and writes `jk_exNotes`, but does not yet copy the note onto the saved workout exercise or show the previous note as a placeholder. |
| A6 duration `durUnit` | Not mirrored; the watch stores and displays seconds. |
