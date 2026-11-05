# Jacked for iPhone — native SwiftUI rewrite plan

**Kickoff: 2026-11-04.** Decided 2026-10-28: a ground-up SwiftUI app, not a wrapper around the
PWA. Companion docs: `APP_STORE_READINESS.md` (blockers), `watch-client/API.md` (blob format,
stat formulas), `watch-client/AUTH_HANDOFF.md` (auth contract), `watch-client/SYNC_PLAYBOOK.md`
(merge rules), `ios/README.md` (how to run the code).

## Who does what

- **Desktop agent (Linux/WSL2):** writes the Swift source and the Xcode project files, commits
  them, checks the Foundation-only layer with a Linux Swift toolchain (`ios/Tests/linux-check.sh`).
  It **cannot** open Xcode, build the app, run the simulator, or do anything with signing or an
  Apple ID.
- **Mr. Roni, on the Mac:** pulls, opens `ios/Jacked.xcodeproj`, Cmd-R in a simulator, reports
  what he sees (or the compile error). Later: device builds, signing team, TestFlight uploads.
- Each slice below ends with one Mac check. A slice is not "done" until that check passed on the
  Mac, not when it is committed.

## Ground rules for the native app

1. **Same backend, same contract.** Same Supabase project (`qehlrwnumrjktujidabz`), same tables,
   RPCs, edge function and blob format as the PWA and both watches. No new schema for the iPhone
   app. Anything that does need a server change (account deletion) gets its own migration and
   Mr. Roni's go before it runs live.
2. **Local-first, blob-compatible.** The PWA keeps everything in `jk_*` localStorage keys and
   backs the whole set up as one JSON blob in `profile_backups.backup`. The native app keeps the
   same blob shape on disk (Codable mirror of the known keys + a raw passthrough for unknown keys,
   SYNC_PLAYBOOK §5) so the iPhone, PWA and watches can all round-trip each other's data. No
   SwiftData/Core Data model of our own until parity is proven: a second schema is a second place
   for the data to drift.
3. **Never write without read-merge-CAS.** Writes to `profile_backups` are compare-and-swap on
   `updated_at`, merged with `mergeBackup` rules (SYNC_PLAYBOOK §2-3). The PWA lost real data twice
   (2026-08-08) before this existed. The iPhone app writes nothing until this layer is ported and
   tested against fixtures.
4. **Port the math, then prove it matches.** PRs, badges (`*-Maxing`), streak, consistency,
   strength levels, muscle map credit and the denormalized `profiles` stats (API.md §7) are all
   computed client-side in `index.html`. Port them function by function, and check parity by
   running the same fixture backups through the JS (node) and the Swift (Linux toolchain) and
   diffing the outputs. This is the biggest hidden cost of the rewrite.

## Decision: raw REST vs `supabase-swift`

| | Raw REST (URLSession) | `supabase-swift` package |
|---|---|---|
| Dependency | none | 1 SwiftPM package (+ its sub-modules) |
| What we call | ~12 endpoints, all already documented for the watches (AUTH_HANDOFF.md, API.md) | same endpoints, nicer Swift API |
| Auth/session | ~150 lines we own (refresh rotation, Keychain) | built in |
| Realtime | not included (websocket we'd write) | included |
| Who else uses it | both watch apps use raw HTTP | nobody in this project yet |

**DECIDED 2026-11-04: `supabase-swift`.** Mr. Roni picked the SDK (asked more than once,
same answer; final). `ios/` was moved onto it the same day: one `SupabaseClient` in
`Backend/Backend.swift`, the SDK owns session refresh/rotation, our `KeychainStore` is its
storage (this-device-only). The package is added once in Xcode (see `ios/README.md`).
The original recommendation is kept below for the record.

**Original recommendation: raw REST.** The contract is small, fixed and already written down for the
watches, so we'd be wrapping a dozen calls, not reinventing a client. Realtime is used in exactly
one place (`jk_live_workouts`, the live phone↔watch workout), and the PWA already falls back to a
5 s poll when Realtime is down, so the app works without it. If Realtime is wanted later, it can
be added alone then. The first slice is written this way already; switching would be a contained
change inside `Backend/` and `Auth/`. **Asked Mr. Roni, not decided unilaterally** (see the
`[[ask:]]` in the kickoff report).

## Minimum iOS version

Scaffold uses **iOS 17.0** (iPhone XS/XR and newer; same device list as iOS 18). It is needed for
the current `onChange`/Observation-era SwiftUI APIs and costs no devices vs iOS 18. iOS 16 would add
iPhone 8/X support at some API cost. **Asked Mr. Roni** whether any older test phone matters.

## Screen inventory (from `jacked-pwa/index.html`, 2026-11-04, `93b6ebf`)

Tabs (bottom nav, Home centered): **Routines · Library · Home · Metrics · Friends**, plus the
full-screen active workout and the onboarding/login flow. Calls below are the PWA's real ones.

| PWA screen (DOM id) | What it does today | SwiftUI shape | Backend calls |
|---|---|---|---|
| **Onboarding / login** (`#onboarding` ob0, ob1) | Log in with username or email + password; sign up with username, display name, optional email, password ×2; "Restore from a backup file" | `AuthView` (login / sign-up toggle) — **built in slice 1** | `rpc/account_status`, `rpc/account_status_by_email`, `auth/v1/token?grant_type=password`, `functions/v1/jacked-auth`, `auth/v1/logout`; then `profile_backups` select (load account data) |
| Protect your account (`#authGate`) | Sets a first password on a legacy password-less account, proving ownership with local workout ids | **Not ported.** A fresh iPhone install has no legacy data to prove with; those users finish on the PWA | `functions/v1/jacked-auth` with `proofIds` |
| **Home** (`#page-home`) | Header with profile photo; monthly **recap card**; **streak banner**; month **calendar** with trained days (`renderCal`), tap a day → `#dayModal`; **Gym years** view (every trained day, by year); **suggested workout** card; recent workouts; Return-to-workout pill | `NavigationStack` > `ScrollView` of cards; `CalendarMonthView` (`LazyVGrid`), `GymYearsView`; sheets for day detail / workout detail | Reads local blob only. Profile photo from `avatars` public URL |
| Workout detail / edit (`#wdModal`, `#weModal`) | View a finished workout, edit name/date/sets, add exercise, save as routine, delete (3-dot menu) | `.sheet` with `Form`/`List`, `confirmationDialog` for delete | Local, then backup sync |
| **Active workout** (`#page-active`) | Running timer; exercises with set rows (weight/reps/done), **rest timer** (`startRest`, auto-rest setting), ★ PR flag, **plate calculator** (`#pcModal`/`#fsModal`), add/reorder exercises, progress notes ("Ready to go up" / "Consider lighter"), finish summary + recommendations; **live shared workout** with the watch | `fullScreenCover`; `List` of `ExerciseCard`s with editable set rows; rest timer as overlay + local notification + **Live Activity** (native win); finish summary sheet | `live_workouts` select/insert/update (CAS on `rev`), Realtime channel `jk_live_workouts` (or 5 s poll); on finish: `profile_backups` CAS write + `profiles` PATCH of stat columns |
| Start workout (`#qsModal`) | Empty workout or choose a routine | `.sheet` | — |
| **Routines** (`#page-routines`) | **Trusted Programs** (curated), My routines in sections, reorder sections/routines, new/edit routine (`#crModal`), 3-dot edit/delete | `List` with `Section`s, `.onMove`, editor sheet | Local + backup sync |
| **Library** (`#page-exercises`) | Search, muscle chips, exercise list with photos; exercise info (`#exInfoModal`: images, history, notes, rename/override); create custom exercise with photo (`#ceModal`); favourites/hidden | `List` + `.searchable` + chip `ScrollView`; detail `NavigationLink`; `PhotosPicker` for custom photo | `exercise-images/exercises.json` + images from own Storage bucket (bundle a copy in the app for offline) |
| **Metrics** (`#page-metrics`) | Reorderable cards: **Muscle Map**, Overview, Workout Summary, **Body Weight** (log + chart), Lifetime Stats, Monthly Recaps, **Achievements** (badges by monthly / 3-month / permanent group, `*-Maxing`), strength levels | `ScrollView` of card views; Swift Charts for weight/volume; muscle map as SVG→`Shape` paths; card order sheet | Local only (computed from `jk_hist`, `jk_bwlog`, `jk_prs`) |
| **Friends** (`#page-leaderboard`) | Compare board (leaderboard), Close buddies, Friends, Pending requests, Sent requests; add friend by username or invite link (`#afModal`); friend profile with badges + 30-day workout detail (`#fpModal`/`#fbModal`) | `List` sections; `ShareLink` for invite; friend detail push | `friend_requests` select/insert/update/delete; `rpc/friend_profiles`; `rpc/public_profiles` (strangers: name + avatar only) |
| **Profile / settings** (`#profModal`) | Photo (change/edit), display name, **username rename**, units lb/kg, default rest, progress-badge rep range, auto rest; Body metrics (sex, body weight, birthday); Data & Backup (Export, Import JSON or **Hevy CSV**, Sync now); Feedback; Account: email add/change, Sign out | `NavigationStack` > `Form` with sections; `fileExporter`/`fileImporter` | `avatars` storage upload/remove; `rpc/rename_profile`; `rpc/my_email`, `rpc/set_my_email`; `feedback` insert; `profile_backups` |
| **Delete account** | **Does not exist yet** (APP_STORE_READINESS #5) | Destructive button in Account section, double confirm | New server function, needs Mr. Roni's go |
| Achievement toast (`#achModal`), cloud prompt (`#cloudPromptModal`), confirm (`#confirmModal`) | Celebration on new badge; first-run "back up?" prompt; generic confirm | Overlay view; not needed (native app is always signed in); `confirmationDialog` | — |

PWA-only, not ported: install banner, landscape rotate guard, iOS standalone-viewport hacks,
service worker, `#authGate` legacy claim.

## Build order (vertical slices)

The brief's guess (shell + auth first) is **right**, for a concrete reason: every later screen
needs a signed-in session and the user's code, and RLS returns nothing without a token, so auth is
the only slice that can be proven end-to-end alone. One correction to what follows it: the second
slice should be **read-only sync + Home**, not workout logging. Logging writes, and writing is only
safe once the merge/CAS layer and the stat math are ported and parity-tested.

| # | Slice | Proves | Mac check |
|---|---|---|---|
| 1 | **Project shell + login/sign-up + Keychain session + own-profile read** (done 2026-11-04, unbuilt) | Connection, auth contract, RLS with a real token | Cmd-R, log in, see your name/workouts/streak |
| 2 | Blob model + read-only sync (`profile_backups` → disk) + Home (calendar, recent workouts, streak) + tab bar shell | Blob decoding of real data, offline cache | Your real history shows on Home |
| 3 | Merge + CAS write + stat PATCH, with node-vs-Swift parity tests on fixture backups | Writing can't lose data | Edit a workout name on iPhone → PWA shows it |
| 4 | Active workout (sets, rest timer, PR flag, plate calc, finish) + routines (start from routine) | The core loop | Log a real workout, it appears on the PWA + watch |
| 5 | Library (bundled exercises.json + images, search, custom exercises) | Offline library | Airplane mode browse |
| 6 | Metrics + badges (ported math) | Parity of numbers | Same numbers as the PWA, side by side |
| 7 | Friends (requests, leaderboard, friend profiles) | Social RLS paths | Add/accept a friend between two test accounts |
| 8 | Profile/settings + account deletion (server function after his go) | 5.1.1(v) | Delete a throwaway account end to end |
| 9 | Native extras: rest-timer Live Activity + notifications, HealthKit (workouts, body weight / smart scale), Face ID | 4.2, real native value | On device |
| 10 | Live shared workout with the Apple Watch app (+ WatchConnectivity if the watch app ships inside this app) | Watch parity | Phone + watch same session |
| 11 | App Store last mile: privacy policy, labels, screenshots, age rating, trademark | Submission | TestFlight, then review |

TestFlight can start after slice 4 (Mr. Roni and Phil using it for real), well before App Store.

## Open questions for Mr. Roni (asked in the 2026-11-04 kickoff report)

1. Raw REST vs `supabase-swift` (recommend raw REST). **Answered: `supabase-swift`.**
2. Minimum iOS (recommend 17).
3. Ship the iPhone app and Phil's Apple Watch TestFlight app (`jacked-watchos`, under the
   Incline Institute developer account) as **one** App Store app. Recommended: yes; the watch
   board already says live sync for the Apple Watch "comes with the new Jacked iPhone app". This
   decides the bundle id and team: the scaffold's `com.inclineinstitute.jacked.ios` is a
   placeholder until then.
4. Build account deletion next (server side needs his go before it runs live).

## Risks

- **Two codebases, one data format.** Every PWA change to the blob or the stat math now has to
  land in Swift too. Mitigation: the parity fixtures (rule 4) run in CI-like fashion on the
  desktop for every change that touches `index.html` math.
- **I can't build.** Each slice needs a Mac round trip; a compile error costs a message cycle.
  Mitigation: keep slices small, compile-check the Foundation layer on Linux, keep UI code plain.
- **Watch app ownership.** The watchOS app is Phil's project; bundling it is a joint change.
